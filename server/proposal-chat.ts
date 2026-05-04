import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { proposals, proposalChatMessages, contacts } from "@shared/schema";
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
const MAX_HISTORY = 30;

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
    description: "Reescribe o modifica una sección de la propuesta con nuevo contenido. Úsalo cuando el usuario pida cambiar texto, ajustar tono, agregar detalle, o reescribir una sección entera.",
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

const SYSTEM_PROMPT_BASE = `Eres un consultor senior experto en propuestas comerciales para IM3 Systems (consultoría de IA + automatización en LatAm). Tu trabajo NO es solo aplicar cambios literales — es pensar como un arquitecto de propuestas y mantener TODA la propuesta coherente.

═══════════════════════════════════════════════════════
PRINCIPIO #1 — VISIÓN GLOBAL Y PENSAMIENTO EN CASCADA
═══════════════════════════════════════════════════════

Cuando el usuario pide un cambio, NUNCA lo hagas aislado. SIEMPRE pregúntate:

> "Si modifico X, ¿qué OTRAS secciones se afectan y necesitan ajuste?"

EJEMPLOS de cascadas:

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
1. Aplica el cambio principal solicitado
2. Luego REVISA cada sección afectada con view_section
3. Propón al usuario los ajustes necesarios EN UN SOLO MENSAJE: "Para que esto sea coherente, también deberíamos: [lista]. ¿Procedo?"
4. Si el usuario confirma, aplica todo de una. Si pide solo algunos, aplica solo esos.
5. Al final del proceso, valida con audit_proposal que no quedaron inconsistencias.

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

Cuando detectes algo, informa al usuario y propón el fix.

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

export async function runProposalChat(params: {
  proposalId: string;
  userMessage: string;
  attachments?: Attachment[];
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

  // Subir attachments a Drive (subcarpeta "_chat-attachments" del cliente).
  // Esto persiste los archivos para poder re-leerlos en turnos siguientes,
  // permitiendo a Claude recordar imágenes/PDFs que el usuario subió antes.
  let storedAttachments: StoredAttachment[] = [];
  if (attachments.length > 0) {
    const [contact] = await db.select({ empresa: contacts.empresa })
      .from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
    if (contact?.empresa) {
      storedAttachments = await persistAttachmentsToDrive(attachments, contact.empresa);
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

${COST_REFERENCE.substring(0, 8000)}

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
      text: `═══════════════════════════════════════════════════════
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
      const allSections = Object.entries(currentSections)
        .filter(([_, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `--- ${k} ---\n${JSON.stringify(v, null, 2).substring(0, 4000)}`)
        .join("\n\n");
      toolCalls.push({ tool: "audit_proposal", summary: "Auditando toda la propuesta" });
      return `AUDIT — todas las secciones de la propuesta:\n\n${allSections}\n\nAhora analiza:\n1. Inconsistencias matemáticas (sumas, milestones vs amount, ROI vs recoveries)\n2. Incoherencias entre secciones (¿lo que dice tech está en solution? ¿el timeline cubre todos los módulos?)\n3. Mensajes vagos sin números concretos del cliente\n4. Voz fuera de tono\n5. Oportunidades para citar CASE_STUDIES o aplicar VOICE_GUIDE\n\nReporta hallazgos al usuario y propón fixes.`;
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
      try {
        const result = await readGoogleDriveContent(`https://drive.google.com/file/d/${fileId}/view`);
        const content = result.content.substring(0, 20000);
        toolCalls.push({ tool: "read_drive_file", summary: `Leí archivo de Drive (${result.content.length} chars)` });
        return `Contenido del archivo (${result.mimeType}):\n\n${content}${result.content.length > 20000 ? "\n\n[...truncado, archivo más largo]" : ""}`;
      } catch (err) {
        return `Error leyendo archivo ${fileId}: ${(err as Error).message}`;
      }
    }
    if (toolName === "update_section") {
      const sectionKey = toolInput.sectionKey as string;
      const newContent = toolInput.newContent as Record<string, unknown>;
      const changeSummary = (toolInput.changeSummary as string) || "Sección actualizada";
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

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: systemBlocks,
      tools: TOOLS,
      messages: claudeMessages,
    });

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
