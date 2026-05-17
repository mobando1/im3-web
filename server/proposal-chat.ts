import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { proposals, proposalChatMessages, proposalSnapshots, contacts } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { log } from "./index";
import { listFolderFilesRecursive, readGoogleDriveContent, uploadFileToDrive, findOrCreateClientFolder } from "./google-drive";
import { google } from "googleapis";
import {
  proposalMetaSchema, heroSchema, summarySchema, problemSchema, solutionSchema,
  techSchema, timelineSchema, roiSchema, authoritySchema, pricingSchema,
  ctaSchema, hardwareSchema, operationalCostsSchema,
} from "@shared/proposal-template/types";
import type { ZodSchema } from "zod";
import { VOICE_GUIDE, COST_REFERENCE, HARDWARE_CATALOG, CASE_STUDIES, gatherContactContext } from "./proposal-ai";
import { buildStackReferenceFromDB } from "./stack-reference";
import { runAllValidators, formatIssuesAsText } from "./proposal-validators";
import { validateSemanticChange } from "./proposal-semantic-validator";
import { getOrgPreferencesContext } from "./org-preferences";
import { getGlobalMemoryContext, extractFactsFromTurn } from "./chat-memory";

const SECTION_SCHEMAS: Record<string, ZodSchema> = {
  meta: proposalMetaSchema,
  hero: heroSchema,
  summary: summarySchema,
  problem: problemSchema,
  solution: solutionSchema,
  tech: techSchema,
  timeline: timelineSchema,
  roi: roiSchema,
  authority: authoritySchema,
  pricing: pricingSchema,
  cta: ctaSchema,
  hardware: hardwareSchema,
  operationalCosts: operationalCostsSchema,
};

const SCHEMA_DOCS = `
SCHEMAS DE CADA SECCIÓN — RESPETA ESTAS ESTRUCTURAS EXACTAS al usar update_section:

meta: { clientName: string, contactName: string, proposalDate: string, validUntil: string, industry: string }

hero: { painHeadline: string, painAmount: string, subtitle: string, diagnosisRef: string }

summary: { commitmentQuote?: string, paragraphs: string[] (≥1), stats?: [{label, value}] }

problem: {
  intro: string,
  monthlyLossCOP?: number,
  counterDescription?: string,
  calculationBreakdown?: string,
  problemCards: [{icon, title, description}] (≥1)
}

solution: {
  heading: string,
  intro: string,
  modules: [{number, title, description, solves}] (≥1)
}

tech: {
  heading: string,
  intro: string,
  features: string[] (≥1)  ← ARRAY DE STRINGS SIMPLES, NO OBJETOS
  optionalFeatures?: string[],
  stack: string
}
⚠️ Si el usuario pide listar "agentes IA", "13 agentes", etc., debes hacerlo como
strings descriptivos en features, ej: "Agente de Nómina Automática — calcula horas extras y aportes con un click".
NO inventes campos como "agents:[{...}]" — el renderer no los muestra.

timeline: { heading: string, phases: [{number, title, durationWeeks, items: string[], outcome?: string}] (≥1) }

roi: {
  heading: string,
  recoveries: [{amount, currency, label}] (≥1),
  comparison: { withoutLabel, withoutAmount, withoutWeight (0-100), investmentLabel, investmentAmount, investmentWeight (0-100), caption },
  heroTitle: string, heroDescription: string, roiPercent: string, paybackMonths: string
}

authority: {
  heading: string,
  intro: string,
  stats: [{num, label}] (≥1),
  differentiators: [{icon, title, description}] (≥1)
}

pricing: {
  label: string, amount: string, amountPrefix: string, amountSuffix: string,
  priceFootnote: string, scarcityMessage: string,
  milestones: [{step (int), name, desc, amount}] (≥1),
  includes: string[] (≥1),
  optionalIncludes?: string[]
}

cta: {
  heading: string, painHighlight: string, description: string,
  acceptLabel: string, fallbackCtaLabel: string, deadlineMessage: string,
  guarantees: string[]
}

hardware: {
  heading: string, intro: string,
  items: [{name, description, quantity (int), unitPriceUSD, totalPriceUSD, notes?, paidBy: "cliente-compra"|"im3-incluye"|"im3-asesora"}] (≥1),
  subtotalUSD: string, recommendationNote?: string, disclaimer: string
}

operationalCosts: {
  heading: string|null, intro: string|null,
  groups?: [{name, billingModel: "fixed"|"passthrough"|"passthrough-with-cap"|"client-direct", description?, monthlyFee?, markup?, categories: [{name, items: [{service, cost, note?}]}]}],
  monthlyRangeLow: string|null, monthlyRangeHigh: string|null, annualEstimate: string|null,
  managedServicesUpsell?: string, disclaimer: string
}

REGLA DE ORO: si el usuario pide listar muchos elementos (agentes, módulos, etc.), revisa
QUÉ sección está pidiendo. Si es tech → features (strings). Si es solution → modules (objetos).
Si es timeline → phases. Cada sección tiene su propia estructura — no mezclar.`;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const MODEL = "claude-sonnet-4-20250514";
const MAX_HISTORY = 80;

// Lock por proposalId — serializa mensajes concurrentes a la misma propuesta
// para evitar race conditions donde 2 mensajes en paralelo cargan el mismo
// snapshot y el segundo sobrescribe los cambios del primero.
const proposalLocks = new Map<string, Promise<unknown>>();

async function withProposalLock<T>(proposalId: string, fn: () => Promise<T>): Promise<T> {
  const previous = proposalLocks.get(proposalId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => fn());
  proposalLocks.set(proposalId, next);
  try {
    return await next;
  } finally {
    // Si este lock sigue siendo el último, limpiarlo
    if (proposalLocks.get(proposalId) === next) {
      proposalLocks.delete(proposalId);
    }
  }
}

// Cache del contexto del contacto (diagnóstico + emails + docs).
// gatherContactContext hace ~7-8 queries + lee Drive — caro de recomputar
// en cada mensaje. TTL 5 min, expira automáticamente.
const contactContextCache = new Map<string, { context: string; expires: number }>();
const CONTACT_CONTEXT_TTL_MS = 5 * 60 * 1000;

async function getCachedContactContext(contactId: string): Promise<string> {
  const now = Date.now();
  const cached = contactContextCache.get(contactId);
  if (cached && cached.expires > now) {
    return cached.context;
  }
  const context = await gatherContactContext(contactId);
  contactContextCache.set(contactId, { context, expires: now + CONTACT_CONTEXT_TTL_MS });
  return context;
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ToolCallSummary = { tool: string; section?: string; summary: string };

type Attachment = {
  name: string;
  mime: string;
  size: number;
  buffer: Buffer;
};

type StoredAttachment = {
  name: string;
  mime: string;
  size: number;
  driveFileId?: string;
  url?: string;
};

/**
 * Re-fetcha un attachment de Drive para incluirlo en un mensaje de Claude.
 * Para imágenes/PDFs descarga el binario y lo convierte a base64 block.
 * Para texto extrae contenido como text block.
 */
async function fetchAttachmentForClaude(att: StoredAttachment): Promise<Anthropic.ContentBlockParam | null> {
  if (!att.driveFileId) return null;
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    subject: process.env.GOOGLE_DRIVE_IMPERSONATE || undefined,
  });
  const drive = google.drive({ version: "v3", auth });

  const isImage = att.mime.startsWith("image/");
  const isPdf = att.mime === "application/pdf";

  if (isImage || isPdf) {
    const res = await drive.files.get({ fileId: att.driveFileId, alt: "media" }, { responseType: "arraybuffer" });
    const data = Buffer.from(res.data as ArrayBuffer).toString("base64");
    if (isImage) {
      const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!supported.includes(att.mime)) return null;
      return {
        type: "image",
        source: { type: "base64", media_type: att.mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data },
      };
    }
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    } as unknown as Anthropic.ContentBlockParam;
  }
  return null; // text/json se maneja en el content original
}

/**
 * Sube los attachments a una subcarpeta "_chat-attachments" dentro de la carpeta
 * del cliente. Devuelve metadata con driveFileId para poder re-leer en turnos siguientes.
 * Si Drive no está configurado o falla, devuelve metadata sin driveFileId.
 */
async function persistAttachmentsToDrive(
  attachments: Attachment[],
  contactEmpresa: string,
): Promise<StoredAttachment[]> {
  if (attachments.length === 0) return [];

  const result: StoredAttachment[] = [];
  let subfolderId: string | null = null;

  try {
    const clientFolderId = await findOrCreateClientFolder(contactEmpresa);

    // Crear subcarpeta "_chat-attachments" si no existe
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/drive"],
      subject: process.env.GOOGLE_DRIVE_IMPERSONATE || undefined,
    });
    const drive = google.drive({ version: "v3", auth });

    const existing = await drive.files.list({
      q: `'${clientFolderId}' in parents and name='_chat-attachments' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id)",
    });

    if (existing.data.files && existing.data.files.length > 0) {
      subfolderId = existing.data.files[0].id || null;
    } else {
      const folder = await drive.files.create({
        requestBody: { name: "_chat-attachments", mimeType: "application/vnd.google-apps.folder", parents: [clientFolderId] },
        fields: "id",
      });
      subfolderId = folder.data.id || null;
    }
  } catch (err) {
    log(`[proposal-chat] could not prepare Drive subfolder: ${(err as Error).message}`);
  }

  for (const att of attachments) {
    const baseMeta = { name: att.name, mime: att.mime, size: att.size };
    if (!subfolderId) {
      result.push(baseMeta);
      continue;
    }
    try {
      const timestampedName = `${new Date().toISOString().substring(0, 10)}-${att.name}`;
      const { fileId, webViewLink } = await uploadFileToDrive(subfolderId, timestampedName, att.mime, att.buffer);
      result.push({ ...baseMeta, driveFileId: fileId, url: webViewLink });
    } catch (err) {
      log(`[proposal-chat] failed to upload "${att.name}" to Drive: ${(err as Error).message}`);
      result.push(baseMeta);
    }
  }

  return result;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "update_section",
    description: "Reescribe o modifica una sección de la propuesta con nuevo contenido. Para cambios pequeños/aislados (1-2 secciones), usa mode='apply' directamente. Para cascadas grandes (3+ secciones afectadas), PRIMERO llama todas con mode='preview' para mostrar al usuario qué vas a cambiar, y solo después de confirmación llama con mode='apply'.",
    input_schema: {
      type: "object",
      properties: {
        sectionKey: {
          type: "string",
          description: "Clave de la sección. Valores válidos: meta, hero, summary, problem, solution, tech, timeline, roi, authority, pricing, hardware, operationalCosts, cta",
        },
        newContent: {
          type: "object",
          description: "Objeto JSON completo con el nuevo contenido de la sección, respetando el schema de esa sección. NO devuelvas string — devuelve el objeto entero.",
        },
        changeSummary: {
          type: "string",
          description: "Resumen breve (1 oración) de QUÉ cambiaste, en español. Para mostrar al usuario.",
        },
        mode: {
          type: "string",
          enum: ["preview", "apply"],
          description: "preview = solo simular y devolver diff (no guarda). apply = guardar de verdad. Default: apply.",
        },
      },
      required: ["sectionKey", "newContent", "changeSummary"],
    },
  },
  {
    name: "view_section",
    description: "Lee el contenido actual de una sección específica. Úsalo si el usuario pregunta sobre el contenido actual antes de modificar.",
    input_schema: {
      type: "object",
      properties: {
        sectionKey: { type: "string", description: "Clave de la sección a leer" },
      },
      required: ["sectionKey"],
    },
  },
  {
    name: "audit_proposal",
    description: "Análisis global de toda la propuesta. Detecta inconsistencias matemáticas (sumas, milestones, ROI), incoherencias entre secciones (timeline vs solution, pricing vs alcance), brechas (cosas mencionadas en una sección pero no en otra), oportunidades de mejora basadas en VOICE_GUIDE y CASE_STUDIES. Úsalo después de cambios grandes O cuando el usuario pida 'revisa' / 'audita' / 'qué falta'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_drive_folder",
    description: "Lista los archivos en la carpeta de Google Drive del cliente. Úsalo cuando el usuario pida revisar/leer documentos del cliente. Devuelve nombre, tipo y ID de cada archivo.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "read_drive_file",
    description: "Lee el contenido completo de un archivo específico de la carpeta del cliente. Usa primero list_drive_folder para ver qué archivos hay, luego usa esta tool con el fileId del que quieras leer.",
    input_schema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "ID del archivo de Google Drive (obtenido de list_drive_folder)" },
      },
      required: ["fileId"],
    },
  },
];

const SYSTEM_PROMPT_BASE = `Eres un consultor senior experto en propuestas comerciales para IM3 Systems (consultoría de IA + automatización en LatAm). Tu trabajo es ayudar al usuario a construir propuestas coherentes — pero SIEMPRE respetando exactamente lo que pidió, sin expandir el scope ni inventar cambios.

═══════════════════════════════════════════════════════
PRINCIPIO #0 — MODO LECTURA POR DEFECTO (CRÍTICO)
═══════════════════════════════════════════════════════

Tu acción por defecto es RESPONDER, no modificar. Solo llamas update_section cuando el usuario pide explícitamente un cambio con verbos imperativos como: "cambia", "actualiza", "agrega", "modifica", "reemplaza", "borra", "ajusta", "corrige".

Si el usuario:
- Hace una pregunta ("¿qué es...?", "¿para qué sirve...?", "¿dónde está...?", "explícame...")
- Comenta algo sin pedir acción
- Pide tu opinión ("¿qué piensas?", "¿está bien?")
- Comparte información de contexto (un email, una nota)

→ NO llames update_section. Responde con texto. Punto.

PALABRAS DE BLOQUEO ABSOLUTO — si el mensaje del usuario contiene alguna de estas, NO llames update_section bajo ninguna circunstancia en ese turno:
- "no hagas nada" / "no cambies nada" / "no toques nada" / "no modifiques nada"
- "solo explícame" / "solo dime" / "solo respóndeme" / "solo pregunta"
- "no quiero que cambies" / "no apliques" / "espera" / "detente"
- "antes de cambiar" / "antes de modificar"

Si detectas estas frases, responde solo con texto explicativo y termina. NO uses update_section, ni siquiera en mode="preview", a menos que el usuario lo pida explícitamente DESPUÉS.

═══════════════════════════════════════════════════════
PRINCIPIO #0.5 — VERIFICA ANTES DE AFIRMAR (ANTI-ALUCINACIÓN)
═══════════════════════════════════════════════════════

NUNCA afirmes que algo "ya está agregado", "ya existe", "ya está incluido" o "no necesito hacer cambios" sin haber llamado view_section PRIMERO en ese mismo turno para verificarlo. Tu memoria de turnos anteriores puede estar equivocada o incompleta.

Si el usuario pide agregar X y crees que X ya existe:
1. Llama view_section de la sección relevante
2. Compara contra lo que pidió el usuario LITERALMENTE
3. Solo entonces responde "ya está" (citando el contenido exacto) O aplica el cambio

Si el usuario te dice "dijiste que ibas a hacer X" y no estás 100% seguro de haberlo hecho:
1. Llama view_section para verificar
2. Si NO está hecho, hazlo ahora con update_section
3. NO digas "ya está hecho" si no lo verificaste

═══════════════════════════════════════════════════════
PRINCIPIO #0.6 — CONTINUIDAD CONVERSACIONAL (NO REINICIES EL HILO)
═══════════════════════════════════════════════════════

Tienes acceso al historial COMPLETO de esta conversación. Antes de responder cualquier mensaje, lee todos los turnos anteriores (los que vienen en el array de messages) y úsalos como contexto activo. NO trates cada mensaje como si fuera el primero.

ANTES de cada respuesta verifica mentalmente:
- ¿Qué decisiones ya tomó el usuario en turnos anteriores? (ej: "ya quedó priorizado según el email de Carlos", "ya rechacé reorganizar las fases")
- ¿Qué cambios ya aplicaste o prometiste aplicar? (revisa los tool_use de turnos anteriores)
- ¿Qué temas o reorganizaciones ya rechazó el usuario? Si los rechazó, NO los vuelvas a proponer.
- ¿Qué archivos / emails / documentos compartió antes? Esa info sigue válida.

REGLAS DE CONTINUIDAD:
1. Si el usuario dice "como te dije antes", "ya te expliqué", "como mencioné", "te lo mandé" → busca esa info en el historial. NO pidas que la repitan.
2. Si en un turno previo prometiste hacer X y el usuario te recuerda "dijiste que ibas a hacer X" → llama view_section, verifica si lo hiciste, y si no, hazlo ahora. NO niegues haberlo prometido.
3. Si el usuario rechazó una propuesta tuya en un turno anterior ("no, no toques eso", "déjalo así") → tienes PROHIBIDO volver a proponer ese mismo cambio en turnos siguientes a menos que el usuario lo retome explícitamente.
4. Si el usuario dijo "ya está bien priorizado / ordenado / aceptado", trata eso como una decisión cerrada. No reabras el tema.
5. Cuando el usuario hace una pregunta de aclaración sobre algo del chat ("¿a qué te refieres con X?"), busca en TUS mensajes previos la mención original de X y respóndela en ese contexto.

NUNCA digas "necesito más contexto" si la info ya está en el historial. Léelo primero.

═══════════════════════════════════════════════════════
PRINCIPIO #0.7 — RESPONDE LA PREGUNTA EXACTA QUE TE HACEN
═══════════════════════════════════════════════════════

Identifica el VERBO de la pregunta y respóndelo directamente. No te desvíes a un tema relacionado.

- "¿qué hace X?" / "¿para qué sirve X?" → describe la función de X. NO hables de dónde va, ni de cómo se integra, ni propongas reorganizar nada.
- "¿dónde está X?" → di la ubicación. NO expliques qué hace.
- "¿cuándo se entrega X?" → di la fase/fecha. NO recapitules el módulo entero.

Si el usuario REPITE la misma pregunta (señal de que tu respuesta anterior no acertó), eso significa que no entendió o no fue lo que pidió. NO repitas tu respuesta anterior con otras palabras y NO cambies de tema. En su lugar:
1. Re-lee LITERALMENTE la pregunta del usuario, palabra por palabra.
2. Identifica qué parte de tu respuesta anterior NO contestó esa pregunta.
3. Responde solo eso, sin propuestas adicionales ni cambios de tema.

Si una pregunta tiene la forma "explícame X, no Y" → el "no Y" es una restricción explícita. Bajo ninguna circunstancia hables de Y. Solo de X.

Si después de 2 intentos no logras entender qué pide el usuario, hazle UNA pregunta de clarificación específica. NO inventes una nueva interpretación cada turno.

═══════════════════════════════════════════════════════
PRINCIPIO #1 — RESPETA EL SCOPE EXACTO DE LA PETICIÓN
═══════════════════════════════════════════════════════

Cuando el usuario pide un cambio CONCRETO (ej: "agrega la página web a la Fase 1"), tu trabajo es hacer EXACTAMENTE eso. No reorganizar otras fases, no proponer reestructurar el timeline, no cambiar prioridades. Solo el cambio pedido.

Si detectas que el cambio pedido podría tener efectos en cascada en otras secciones, MENCIONA brevemente las secciones afectadas al final ("Nota: esto podría afectar X — ¿quieres que lo revise?") pero NO modifiques esas otras secciones sin confirmación explícita.

NUNCA respondas con "Veo el problema" + propuesta de reorganización masiva cuando el usuario solo pidió un cambio puntual. Eso es expandir el scope sin permiso.

EJEMPLOS de cascadas posibles (a SUGERIR, no a aplicar sin permiso):

• Agregar agentes de IA → afecta:
  - tech (agregar features)
  - solution (agregar/ajustar módulos)
  - timeline (más semanas, nuevas fases)
  - pricing (precio total + milestones)
  - operationalCosts (nuevos costos por uso de Claude/OpenAI)
  - roi (recoveries adicionales por automatización)
  - hardware (¿requiere nuevo hardware?)
  - hero/summary (mensaje principal)

• Bajar el pricing → afecta:
  - solution (reducir módulos)
  - timeline (menos semanas)
  - tech (menos features)
  - milestones (ajustar montos)
  - roi (recalcular payback)

• Cambiar foco del problema → afecta:
  - hero (painHeadline + painAmount)
  - problem (problemCards, monthlyLossCOP)
  - solution (cómo se resuelve)
  - roi (recoveries alineados)

CUANDO DETECTES CASCADAS:
1. Aplica SOLO el cambio principal solicitado.
2. En el mismo mensaje, propón al usuario en UNA lista corta los ajustes que SUGIERES: "Nota: este cambio podría requerir ajustar también: [lista breve]. ¿Quieres que los aplique?"
3. NO toques las otras secciones hasta tener confirmación explícita ("sí", "aplícalos", "procede"). El silencio o un "ok" ambiguo NO cuenta como confirmación.
4. Si el usuario confirma, aplica esos ajustes específicos. Si pide solo algunos, aplica solo esos.

REGLA DE ANTI-EXPANSIÓN: si el usuario pide un cambio en UNA sección, máximo modificas ESA sección en ese turno. Las demás se proponen, no se aplican.

═══════════════════════════════════════════════════════
PRINCIPIO #2 — DETECTAR PROBLEMAS HASTA EL ÚLTIMO DETALLE
═══════════════════════════════════════════════════════

Eres exigente con la calidad. Detecta:
• Inconsistencias matemáticas (suma de milestones ≠ amount total, recoveries ≠ ROI calculado)
• Mensajes vagos o genéricos que no usan el contexto del cliente específico
• Falta de números concretos (dejar "muchos" o "varios" cuando hay datos exactos disponibles)
• Voz inconsistente entre secciones (revisar contra VOICE_GUIDE)
• Costos irreales (ver COST_REFERENCE)
• Hardware mal listado (ver HARDWARE_CATALOG)
• Casos de éxito mal aplicados o irrelevantes (ver CASE_STUDIES)

Cuando detectes algo, INFORMA al usuario y propón el fix con texto. NO apliques el fix automáticamente — espera confirmación explícita. La excepción es cuando el usuario te pidió "audita y corrige todo" de forma explícita en este turno.

═══════════════════════════════════════════════════════
PRINCIPIO #3 — USA EL MISMO CONOCIMIENTO QUE EL GENERADOR
═══════════════════════════════════════════════════════

Tienes acceso a los mismos archivos de referencia que la IA generadora original:
- VOICE_GUIDE (tono, estilo, vocabulario IM3)
- COST_REFERENCE (precios reales de IM3 — respeta estos rangos)
- HARDWARE_CATALOG (productos disponibles)
- CASE_STUDIES (proyectos pasados para citar)

Y el contexto completo del cliente (diagnóstico, emails, docs).

Cuando redactes nuevo contenido, hazlo COMO LO HARÍA EL GENERADOR — mismo tono, mismo nivel de detalle, mismas convenciones.

═══════════════════════════════════════════════════════
CAPACIDADES (TOOLS)
═══════════════════════════════════════════════════════

• view_section(sectionKey) — lee una sección
• update_section(sectionKey, newContent, changeSummary) — guarda con validación de schema
• audit_proposal() — análisis global de inconsistencias y oportunidades
• list_drive_folder() — lista archivos en la carpeta Drive del cliente
• read_drive_file(fileId) — lee contenido de un archivo del Drive

═══════════════════════════════════════════════════════
ESTILO Y REGLAS
═══════════════════════════════════════════════════════

- Responde en español, conciso y profesional (como consultor senior, no robot)
- update_section requiere el OBJETO COMPLETO de la sección — lee primero con view_section si necesitas la estructura
- Respeta SIEMPRE el schema de cada sección (campos requeridos, tipos exactos)
- Para pricing, usa COST_REFERENCE para validar
- Si propones cascadas, sé específico: lista qué cambia y por qué
- Si el usuario es ambiguo, haz UNA pregunta clave (no 5)

${SCHEMA_DOCS}`;

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; toolName: string; section?: string; summary: string }
  | { type: "tool_error"; toolName: string; error: string }
  | { type: "done"; assistantMessage: string; toolCalls: ToolCallSummary[] }
  | { type: "error"; error: string };

export type StreamCallback = (event: StreamEvent) => void;

export async function runProposalChat(params: {
  proposalId: string;
  userMessage: string;
  attachments?: Attachment[];
  onEvent?: StreamCallback;
}): Promise<{
  assistantMessage: string;
  toolCalls: ToolCallSummary[];
}> {
  // Serializar mensajes concurrentes a la misma propuesta (evita race conditions)
  return withProposalLock(params.proposalId, () => runProposalChatInner(params));
}

async function runProposalChatInner(params: {
  proposalId: string;
  userMessage: string;
  attachments?: Attachment[];
  onEvent?: StreamCallback;
}): Promise<{
  assistantMessage: string;
  toolCalls: ToolCallSummary[];
}> {
  if (!db) throw new Error("DB no disponible");

  const anthropic = getClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY no configurada");

  // Cargar propuesta actual
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, params.proposalId)).limit(1);
  if (!proposal) throw new Error("Propuesta no encontrada");

  // Cargar historial reciente
  const history = await db.select()
    .from(proposalChatMessages)
    .where(eq(proposalChatMessages.proposalId, params.proposalId))
    .orderBy(asc(proposalChatMessages.createdAt))
    .limit(MAX_HISTORY);

  const attachments = params.attachments || [];

  // Cargar info del contacto una sola vez (para attachments + validador semántico)
  const [contactRow] = await db.select({ nombre: contacts.nombre, empresa: contacts.empresa })
    .from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
  const contactNameForValidator = contactRow?.nombre || "(desconocido)";
  const contactEmpresaForValidator = contactRow?.empresa || "(desconocida)";

  // Subir attachments a Drive (subcarpeta "_chat-attachments" del cliente).
  // Esto persiste los archivos para poder re-leerlos en turnos siguientes,
  // permitiendo a Claude recordar imágenes/PDFs que el usuario subió antes.
  let storedAttachments: StoredAttachment[] = [];
  if (attachments.length > 0) {
    if (contactRow?.empresa) {
      storedAttachments = await persistAttachmentsToDrive(attachments, contactRow.empresa);
    } else {
      storedAttachments = attachments.map(a => ({ name: a.name, mime: a.mime, size: a.size }));
    }
  }

  // Guardar mensaje del usuario (con metadata de archivos adjuntos)
  await db.insert(proposalChatMessages).values({
    proposalId: params.proposalId,
    role: "user",
    content: params.userMessage,
    attachments: storedAttachments.length > 0 ? storedAttachments : null,
  });

  // Construir mensajes para Claude. Re-incluye attachments de los últimos
  // 3 mensajes del usuario que tengan archivos en Drive (para que Claude
  // pueda referirse a imágenes/PDFs subidos antes en la conversación).
  // Limitamos a 3 para no inflar el costo en chats largos.
  const userMessagesWithAttachments = history.filter(h => h.role === "user" && h.attachments && h.attachments.length > 0).slice(-3);
  const messageIdsToRefetch = new Set(userMessagesWithAttachments.map(m => m.id));

  const claudeMessages: Anthropic.MessageParam[] = [];

  for (const h of history) {
    const role = h.role as "user" | "assistant";
    if (role === "user" && messageIdsToRefetch.has(h.id) && h.attachments) {
      // Re-leer attachments de Drive y armar content blocks
      const blocks: Anthropic.ContentBlockParam[] = [];
      for (const att of h.attachments) {
        if (!att.driveFileId) continue;
        try {
          const fetched = await fetchAttachmentForClaude(att);
          if (fetched) blocks.push(fetched);
        } catch (err) {
          log(`[proposal-chat] could not refetch attachment "${att.name}": ${(err as Error).message}`);
        }
      }
      blocks.push({ type: "text", text: h.content });
      claudeMessages.push({ role, content: blocks });
    } else {
      claudeMessages.push({ role, content: h.content });
    }
  }

  // Mensaje del usuario actual: combinar texto + archivos como content blocks
  const currentUserContent: Anthropic.ContentBlockParam[] = [];
  let textPrefix = "";

  for (const att of attachments) {
    const isImage = att.mime.startsWith("image/");
    const isPdf = att.mime === "application/pdf";
    const isText = att.mime.startsWith("text/") || att.mime === "application/json";

    if (isImage) {
      // Claude vision: image block
      const supportedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (supportedImageTypes.includes(att.mime)) {
        currentUserContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: att.mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: att.buffer.toString("base64"),
          },
        });
      } else {
        textPrefix += `[Imagen "${att.name}" no soportada por el modelo: ${att.mime}]\n`;
      }
    } else if (isPdf) {
      // Claude PDF support: document block
      currentUserContent.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: att.buffer.toString("base64"),
        },
      } as unknown as Anthropic.ContentBlockParam);
    } else if (isText) {
      // Texto plano: incluir como prefijo del mensaje
      const text = att.buffer.toString("utf-8").substring(0, 50000);
      textPrefix += `\n--- ARCHIVO ADJUNTO: ${att.name} ---\n${text}\n--- FIN ${att.name} ---\n`;
    } else {
      textPrefix += `[Archivo "${att.name}" (${att.mime}) no soportado para análisis directo]\n`;
    }
  }

  const finalUserText = (textPrefix ? textPrefix + "\n" : "") + params.userMessage;
  currentUserContent.push({ type: "text", text: finalUserText });

  claudeMessages.push({ role: "user", content: currentUserContent });

  // Contexto de la propuesta actual + cliente + referencias (mismo que usa el generador)
  const proposalSnapshot = JSON.stringify(proposal.sections, null, 2).substring(0, 30000);

  // Cargar contexto del cliente (diagnóstico, emails, docs) — igual que el generador.
  // Usa cache con TTL 5 min para no recalcular en cada mensaje del chat.
  let clientContext = "";
  try {
    clientContext = await getCachedContactContext(proposal.contactId);
  } catch (err) {
    log(`[proposal-chat] could not gather client context: ${(err as Error).message}`);
  }

  // Cargar preferencias de la organización (memoria de propuestas anteriores)
  let orgContext = "";
  try {
    orgContext = await getOrgPreferencesContext();
  } catch (err) {
    log(`[proposal-chat] could not load org preferences: ${(err as Error).message}`);
  }

  // Cargar memoria global del chat (hechos cross-proposal/cross-client)
  let globalMemoryContext = "";
  try {
    globalMemoryContext = await getGlobalMemoryContext();
  } catch (err) {
    log(`[proposal-chat] could not load global memory: ${(err as Error).message}`);
  }

  // Stack & Costos: fuente de verdad es la tabla `stack_services` (editable en /admin/stack-catalog).
  // Si la DB tiene servicios, usa esa referencia; si no, fallback al .md legacy.
  const stackRefFromDB = await buildStackReferenceFromDB().catch(() => "");
  const costReferenceBlock = stackRefFromDB || COST_REFERENCE.substring(0, 8000);

  // System prompt particionado en bloques con cache_control:
  // - Bloque 1 (cacheado): SYSTEM_PROMPT_BASE + SCHEMA_DOCS — totalmente estático.
  // - Bloque 2 (cacheado): VOICE_GUIDE + COST_REFERENCE + HARDWARE_CATALOG + CASE_STUDIES — estático mientras los archivos no cambien.
  // - Bloque 3 (cacheado por contactId): contexto del cliente — estable durante la sesión.
  // - Bloque 4 (NO cacheado): snapshot de la propuesta — cambia con cada update_section.
  // Cache TTL ~5 min de Anthropic. Espera 90% off en input tokens en mensajes seguidos.
  const systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
    {
      type: "text",
      text: SYSTEM_PROMPT_BASE, // ya incluye SCHEMA_DOCS embebidos al final
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `═══════════════════════════════════════════════════════
VOICE GUIDE (tono y estilo de IM3)
═══════════════════════════════════════════════════════

${VOICE_GUIDE.substring(0, 8000)}

═══════════════════════════════════════════════════════
COST REFERENCE (precios reales — respeta estos rangos)
═══════════════════════════════════════════════════════

${costReferenceBlock}

═══════════════════════════════════════════════════════
HARDWARE CATALOG (productos y precios)
═══════════════════════════════════════════════════════

${HARDWARE_CATALOG.substring(0, 6000)}

═══════════════════════════════════════════════════════
CASE STUDIES (casos de éxito para citar cuando aplique)
═══════════════════════════════════════════════════════

${CASE_STUDIES.substring(0, 6000)}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `${globalMemoryContext ? globalMemoryContext + "\n\n" : ""}${orgContext ? orgContext + "\n\n" : ""}═══════════════════════════════════════════════════════
CONTEXTO DEL CLIENTE (diagnóstico, emails, docs)
═══════════════════════════════════════════════════════

${clientContext.substring(0, 30000)}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `═══════════════════════════════════════════════════════
ESTADO ACTUAL DE LA PROPUESTA (JSON)
═══════════════════════════════════════════════════════

Título: ${proposal.title}
Status: ${proposal.status}
Última actualización: ${proposal.updatedAt}

SECCIONES:
${proposalSnapshot}`,
    },
  ];

  const toolCalls: ToolCallSummary[] = [];
  let assistantText = "";
  let currentSections: Record<string, unknown> = (proposal.sections as Record<string, unknown>) || {};
  let iteration = 0;
  const MAX_ITERATIONS = 12; // permite cascadas grandes (audit + múltiples updates)

  // Captura local de db para preservar non-null dentro de los closures
  const dbRef = db;

  // Helper: ejecuta una sola tool y devuelve el contenido del tool_result
  const executeTool = async (toolName: string, toolInput: Record<string, unknown>): Promise<string> => {
    if (toolName === "view_section") {
      const sectionKey = toolInput.sectionKey as string;
      const sectionData = currentSections[sectionKey];
      return sectionData
        ? JSON.stringify(sectionData, null, 2).substring(0, 8000)
        : `(Sección "${sectionKey}" no existe o está vacía)`;
    }
    if (toolName === "audit_proposal") {
      // 1. Validators matemáticos en código (deterministas, no Claude)
      const mathIssues = runAllValidators(currentSections);
      const mathReport = formatIssuesAsText(mathIssues);

      // 2. Dump de secciones para análisis cualitativo de Claude
      const allSections = Object.entries(currentSections)
        .filter(([_, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `--- ${k} ---\n${JSON.stringify(v, null, 2).substring(0, 4000)}`)
        .join("\n\n");

      toolCalls.push({
        tool: "audit_proposal",
        summary: mathIssues.length > 0
          ? `Auditando — ${mathIssues.length} inconsistencia(s) matemática(s) detectada(s)`
          : "Auditando — sin inconsistencias matemáticas",
      });

      return `AUDIT REPORT

═══════════════════════════════
1. VALIDACIÓN MATEMÁTICA (código, no Claude)
═══════════════════════════════
${mathReport}

═══════════════════════════════
2. ANÁLISIS CUALITATIVO (te toca a ti)
═══════════════════════════════
Estado de las secciones:

${allSections}

INSTRUCCIONES:
- Si hubo inconsistencias matemáticas arriba (🔴 o 🟡), proponlas como fixes concretos al usuario.
- Analiza ahora las cosas que el código no puede ver:
  * Incoherencias entre secciones (lo de tech aparece en solution? timeline cubre todos los módulos?)
  * Mensajes vagos sin números concretos del cliente (revisa el contexto del cliente arriba)
  * Voz fuera del VOICE_GUIDE
  * Oportunidades para citar CASE_STUDIES relevantes
- Reporta hallazgos al usuario en una lista clara y propón los fixes en el siguiente turno (o aplícalos directamente con update_section si son obvios).`;
    }
    if (toolName === "list_drive_folder") {
      const [contact] = await dbRef.select({ driveFolderId: contacts.driveFolderId, empresa: contacts.empresa })
        .from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
      if (!contact?.driveFolderId) return "El cliente no tiene una carpeta de Drive asociada.";
      try {
        const files = await listFolderFilesRecursive(contact.driveFolderId, { maxFiles: 50 });
        toolCalls.push({ tool: "list_drive_folder", summary: `Listé ${files.length} archivo(s) de Drive` });
        if (files.length === 0) return `La carpeta de "${contact.empresa}" está vacía.`;
        return `Archivos en la carpeta de "${contact.empresa}" (${files.length}):\n` +
          files.map(f => `- ${f.name} [${f.mimeType}] (id: ${f.id}, modificado: ${f.modifiedTime})`).join("\n");
      } catch (err) {
        return `Error listando archivos: ${(err as Error).message}`;
      }
    }
    if (toolName === "read_drive_file") {
      const fileId = toolInput.fileId as string;
      // Timeout de 30s — un PDF lento no puede colgar todo el turno del chat
      const READ_TIMEOUT_MS = 30000;
      try {
        const result = await Promise.race([
          readGoogleDriveContent(`https://drive.google.com/file/d/${fileId}/view`),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout: la lectura tardó más de ${READ_TIMEOUT_MS / 1000}s`)), READ_TIMEOUT_MS)
          ),
        ]);
        const content = result.content.substring(0, 20000);
        toolCalls.push({ tool: "read_drive_file", summary: `Leí archivo de Drive (${result.content.length} chars)` });
        return `Contenido del archivo (${result.mimeType}):\n\n${content}${result.content.length > 20000 ? "\n\n[...truncado, archivo más largo]" : ""}`;
      } catch (err) {
        return `Error leyendo archivo ${fileId}: ${(err as Error).message}. Sugerencia: si es PDF muy largo, podría no extraer texto vía OCR.`;
      }
    }
    if (toolName === "update_section") {
      const sectionKey = toolInput.sectionKey as string;
      const newContent = toolInput.newContent as Record<string, unknown>;
      const changeSummary = (toolInput.changeSummary as string) || "Sección actualizada";
      const mode = (toolInput.mode as "preview" | "apply" | undefined) ?? "apply";
      const schema = SECTION_SCHEMAS[sectionKey];
      if (!schema) {
        return `ERROR: sectionKey "${sectionKey}" no es válido. Valores posibles: ${Object.keys(SECTION_SCHEMAS).join(", ")}`;
      }
      const parsed = schema.safeParse(newContent);
      if (!parsed.success) {
        const errors = parsed.error.errors.slice(0, 5).map(e => `- ${e.path.join(".") || "(root)"}: ${e.message}`).join("\n");
        log(`[proposal-chat] Validation failed for "${sectionKey}": ${errors}`);
        return `ERROR DE VALIDACIÓN — la sección "${sectionKey}" NO se guardó porque el formato no coincide con el schema. Revisa el schema en mi system prompt y reenvía con la estructura correcta.\n\nErrores:\n${errors}\n\nIMPORTANTE: Si el campo "features" debe ser array de strings, NO uses array de objetos. Si necesitas listar agentes IA, ponlos como strings descriptivos en features.`;
      }
      // Modo preview: NO guarda, solo devuelve diff a Claude para que lo presente al usuario
      if (mode === "preview") {
        const before = currentSections[sectionKey];
        const beforeStr = before ? JSON.stringify(before, null, 2).substring(0, 3000) : "(vacío)";
        const afterStr = JSON.stringify(parsed.data, null, 2).substring(0, 3000);
        toolCalls.push({ tool: "update_section", section: sectionKey, summary: `[PREVIEW] ${changeSummary}` });
        return `MODO PREVIEW — el cambio NO fue guardado.

Sección: ${sectionKey}
Resumen: ${changeSummary}

ANTES:
${beforeStr}

DESPUÉS (propuesto):
${afterStr}

Presenta este resumen al usuario y espera confirmación. Cuando confirme, vuelve a llamar update_section con mode="apply" para guardar de verdad.`;
      }

      // Validación semántica con Haiku (rápido + barato) — detecta inconsistencias
      // factuales (nombre cliente equivocado, fechas inconsistentes, datos inventados)
      try {
        const semanticIssues = await validateSemanticChange({
          sectionKey,
          newContent: parsed.data as Record<string, unknown>,
          contactName: contactNameForValidator,
          contactCompany: contactEmpresaForValidator,
          clientContextSummary: clientContext.substring(0, 5000),
        });
        const errors = semanticIssues.filter(i => i.severity === "error");
        if (errors.length > 0) {
          const errMsg = errors.map(e => `- ${e.field || "(general)"}: ${e.message}`).join("\n");
          log(`[proposal-chat] Semantic validation rejected "${sectionKey}": ${errMsg}`);
          return `RECHAZADO POR VALIDACIÓN SEMÁNTICA — el contenido tiene inconsistencias factuales:\n${errMsg}\n\nRevisa el contexto del cliente y reenvía con datos correctos.`;
        }
      } catch (semErr) {
        log(`[proposal-chat] semantic validator failed (continuing): ${(semErr as Error).message}`);
      }

      // Snapshot ANTES del cambio para permitir undo desde la UI del chat
      try {
        await dbRef.insert(proposalSnapshots).values({
          proposalId: params.proposalId,
          sections: currentSections,
          changeSummary,
          sectionKey,
        });
      } catch (snapErr) {
        log(`[proposal-chat] could not snapshot before update: ${(snapErr as Error).message}`);
      }

      currentSections = { ...currentSections, [sectionKey]: parsed.data };
      await dbRef.update(proposals)
        .set({ sections: currentSections, updatedAt: new Date() })
        .where(eq(proposals.id, params.proposalId));
      toolCalls.push({ tool: "update_section", section: sectionKey, summary: changeSummary });
      log(`[proposal-chat] Updated section "${sectionKey}" in proposal ${params.proposalId}: ${changeSummary}`);
      return `Sección "${sectionKey}" actualizada y guardada exitosamente.`;
    }
    return `Tool "${toolName}" no reconocida.`;
  };

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    // Usamos messages.stream para emitir text_delta en tiempo real al cliente.
    // Al final del stream tomamos el final message completo para procesar tool_use.
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 8192,
      system: systemBlocks,
      tools: TOOLS,
      messages: claudeMessages,
    });

    if (params.onEvent) {
      stream.on("text", (textChunk) => {
        params.onEvent!({ type: "text_delta", text: textChunk });
      });
    }

    const response = await stream.finalMessage();

    // Recolectar TODOS los blocks (texto + tool_use) en UN solo assistant message
    const assistantContent: Anthropic.ContentBlockParam[] = [];
    const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        assistantText += (assistantText ? "\n\n" : "") + block.text;
        assistantContent.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        assistantContent.push(block);
        toolUseBlocks.push(block);
      }
    }

    // Push del mensaje assistant ÚNICO con TODOS los blocks (texto + todos los tool_use)
    if (assistantContent.length > 0) {
      claudeMessages.push({ role: "assistant", content: assistantContent });
    }

    // Si no hubo tool use, terminamos (el modelo no necesita más iteraciones)
    if (toolUseBlocks.length === 0) {
      break;
    }

    // Ejecutar TODOS los tool_use en paralelo y juntar resultados en UN solo user message
    const toolCallsBeforeBatch = toolCalls.length;
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        const content = await executeTool(block.name, block.input as Record<string, unknown>);
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content,
        };
      })
    );

    // Emitir eventos para los tool calls que se agregaron en este batch
    if (params.onEvent) {
      for (let i = toolCallsBeforeBatch; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        params.onEvent({ type: "tool_call", toolName: tc.tool, section: tc.section, summary: tc.summary });
      }
    }

    claudeMessages.push({ role: "user", content: toolResults });
  }

  // Persistir respuesta del assistant
  const finalText = assistantText.trim() || "(El asistente no devolvió texto)";
  await db.insert(proposalChatMessages).values({
    proposalId: params.proposalId,
    role: "assistant",
    content: finalText,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
  });

  // Extraer hechos generalizables del turno hacia la memoria global.
  // Corre en background (fire-and-forget) — no bloqueamos la respuesta del chat.
  extractFactsFromTurn({
    proposalId: params.proposalId,
    userMessage: params.userMessage,
    assistantMessage: finalText,
    contactCompany: contactEmpresaForValidator,
    contactName: contactNameForValidator,
  }).catch(err => log(`[proposal-chat] memory extraction error: ${(err as Error).message}`));

  return { assistantMessage: finalText, toolCalls };
}

export async function getProposalChatHistory(proposalId: string): Promise<Array<{
  id: string;
  role: string;
  content: string;
  toolCalls: ToolCallSummary[] | null;
  attachments: StoredAttachment[] | null;
  createdAt: Date;
}>> {
  if (!db) return [];
  const messages = await db.select()
    .from(proposalChatMessages)
    .where(eq(proposalChatMessages.proposalId, proposalId))
    .orderBy(asc(proposalChatMessages.createdAt));
  return messages.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    toolCalls: m.toolCalls,
    attachments: m.attachments,
    createdAt: m.createdAt,
  }));
}
