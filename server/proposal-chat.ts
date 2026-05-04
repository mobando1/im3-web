import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { proposals, proposalChatMessages, contacts } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { log } from "./index";
import { listFolderFilesRecursive, readGoogleDriveContent } from "./google-drive";
import {
  proposalMetaSchema, heroSchema, summarySchema, problemSchema, solutionSchema,
  techSchema, timelineSchema, roiSchema, authoritySchema, pricingSchema,
  ctaSchema, hardwareSchema, operationalCostsSchema,
} from "@shared/proposal-template/types";
import type { ZodSchema } from "zod";

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

type StoredAttachment = { name: string; mime: string; size: number };

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

const SYSTEM_PROMPT = `Eres un asistente experto en propuestas comerciales para IM3 Systems, una consultoría de IA y automatización en Latinoamérica. Tu trabajo es ayudar al admin a refinar propuestas comerciales conversacionalmente.

CONTEXTO:
- IM3 Systems vende soluciones de IA, automatización, integraciones, hardware y consultoría a empresas en LatAm
- Las propuestas siguen un schema estructurado con secciones: meta, hero, summary, problem, solution, tech, timeline, roi, authority, pricing, hardware, operationalCosts, cta
- El admin acaba de generar la propuesta con IA y ahora la está refinando contigo

CAPACIDADES:
- Puedes leer cualquier sección con la tool view_section
- Puedes modificar cualquier sección con la tool update_section, devolviendo el objeto JSON completo nuevo
- Puedes hacer múltiples modificaciones en un mismo turno si tiene sentido

ESTILO:
- Responde en español, conciso y directo
- Cuando hagas cambios, explica brevemente qué hiciste y por qué
- Si el usuario pide algo ambiguo, pregúntale antes de modificar
- NO hagas cambios destructivos sin confirmación si el usuario no fue específico
- Mantén el tono profesional, claro y orientado a resultados de IM3 (ver voice guide en el contexto si aplica)

REGLAS IMPORTANTES:
- update_section requiere el OBJETO COMPLETO de la sección, no solo el campo cambiado. Lee primero la sección si necesitas saber su estructura actual.
- Respeta el schema de cada sección (campos requeridos, tipos correctos)
- Si no estás seguro del schema de una sección, usa view_section primero
- Para pricing, mantén consistencia con el costo de IM3 si está documentado en la propuesta

${SCHEMA_DOCS}`;

export async function runProposalChat(params: {
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
  const storedAttachments: StoredAttachment[] = attachments.map(a => ({ name: a.name, mime: a.mime, size: a.size }));

  // Guardar mensaje del usuario (con metadata de archivos adjuntos)
  await db.insert(proposalChatMessages).values({
    proposalId: params.proposalId,
    role: "user",
    content: params.userMessage,
    attachments: storedAttachments.length > 0 ? storedAttachments : null,
  });

  // Construir mensajes para Claude
  const claudeMessages: Anthropic.MessageParam[] = history.map(h => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));

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

  // Contexto de la propuesta actual (snapshot completo)
  const proposalSnapshot = JSON.stringify(proposal.sections, null, 2).substring(0, 30000);
  const systemWithContext = `${SYSTEM_PROMPT}

ESTADO ACTUAL DE LA PROPUESTA (JSON):
${proposalSnapshot}

Título: ${proposal.title}
Status: ${proposal.status}`;

  const toolCalls: ToolCallSummary[] = [];
  let assistantText = "";
  let currentSections: Record<string, unknown> = (proposal.sections as Record<string, unknown>) || {};
  let iteration = 0;
  const MAX_ITERATIONS = 5;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemWithContext,
      tools: TOOLS,
      messages: claudeMessages,
    });

    // Concatenar texto y procesar tool_use
    const assistantContent: Anthropic.ContentBlockParam[] = [];
    let hasToolUse = false;

    for (const block of response.content) {
      if (block.type === "text") {
        assistantText += (assistantText ? "\n\n" : "") + block.text;
        assistantContent.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        hasToolUse = true;
        assistantContent.push(block);

        const toolName = block.name;
        const toolInput = block.input as Record<string, unknown>;
        let toolResultContent = "";

        if (toolName === "view_section") {
          const sectionKey = toolInput.sectionKey as string;
          const sectionData = currentSections[sectionKey];
          toolResultContent = sectionData
            ? JSON.stringify(sectionData, null, 2).substring(0, 8000)
            : `(Sección "${sectionKey}" no existe o está vacía)`;
        } else if (toolName === "list_drive_folder") {
          // Buscar driveFolderId del contacto asociado a la propuesta
          const [contact] = await db.select({ driveFolderId: contacts.driveFolderId, empresa: contacts.empresa })
            .from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
          if (!contact?.driveFolderId) {
            toolResultContent = "El cliente no tiene una carpeta de Drive asociada.";
          } else {
            try {
              const files = await listFolderFilesRecursive(contact.driveFolderId, { maxFiles: 50 });
              if (files.length === 0) {
                toolResultContent = `La carpeta de "${contact.empresa}" está vacía.`;
              } else {
                toolResultContent = `Archivos en la carpeta de "${contact.empresa}" (${files.length}):\n` +
                  files.map(f => `- ${f.name} [${f.mimeType}] (id: ${f.id}, modificado: ${f.modifiedTime})`).join("\n");
              }
              toolCalls.push({ tool: "list_drive_folder", summary: `Listé ${files.length} archivo(s) de Drive` });
            } catch (err) {
              toolResultContent = `Error listando archivos: ${(err as Error).message}`;
            }
          }
        } else if (toolName === "read_drive_file") {
          const fileId = toolInput.fileId as string;
          try {
            const result = await readGoogleDriveContent(`https://drive.google.com/file/d/${fileId}/view`);
            const content = result.content.substring(0, 20000);
            toolResultContent = `Contenido del archivo (${result.mimeType}):\n\n${content}${result.content.length > 20000 ? "\n\n[...truncado, archivo más largo]" : ""}`;
            toolCalls.push({ tool: "read_drive_file", summary: `Leí archivo de Drive (${result.content.length} chars)` });
          } catch (err) {
            toolResultContent = `Error leyendo archivo ${fileId}: ${(err as Error).message}`;
          }
        } else if (toolName === "update_section") {
          const sectionKey = toolInput.sectionKey as string;
          const newContent = toolInput.newContent as Record<string, unknown>;
          const changeSummary = (toolInput.changeSummary as string) || "Sección actualizada";

          // Validar contra el schema antes de persistir
          const schema = SECTION_SCHEMAS[sectionKey];
          if (!schema) {
            toolResultContent = `ERROR: sectionKey "${sectionKey}" no es válido. Valores posibles: ${Object.keys(SECTION_SCHEMAS).join(", ")}`;
          } else {
            const parsed = schema.safeParse(newContent);
            if (!parsed.success) {
              const errors = parsed.error.errors.slice(0, 5).map(e => `- ${e.path.join(".") || "(root)"}: ${e.message}`).join("\n");
              toolResultContent = `ERROR DE VALIDACIÓN — la sección "${sectionKey}" NO se guardó porque el formato no coincide con el schema. Revisa el schema en mi system prompt y reenvía con la estructura correcta.\n\nErrores:\n${errors}\n\nIMPORTANTE: Si el campo "features" debe ser array de strings, NO uses array de objetos. Si necesitas listar agentes IA, ponlos como strings descriptivos en features (ej: "Nómina Automática — calcula horas extras y aportes con un click").`;
              log(`[proposal-chat] Validation failed for "${sectionKey}": ${errors}`);
            } else {
              // Aplicar cambio en memoria + persistir
              currentSections = { ...currentSections, [sectionKey]: parsed.data };
              await db.update(proposals)
                .set({ sections: currentSections, updatedAt: new Date() })
                .where(eq(proposals.id, params.proposalId));

              toolCalls.push({ tool: "update_section", section: sectionKey, summary: changeSummary });
              toolResultContent = `Sección "${sectionKey}" actualizada y guardada exitosamente.`;
              log(`[proposal-chat] Updated section "${sectionKey}" in proposal ${params.proposalId}: ${changeSummary}`);
            }
          }
        } else {
          toolResultContent = `Tool "${toolName}" no reconocida.`;
        }

        // Agregar tool_result al contexto para siguiente iteración
        claudeMessages.push({ role: "assistant", content: assistantContent });
        claudeMessages.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: block.id, content: toolResultContent }],
        });
      }
    }

    // Si no hubo tool use, terminamos
    if (!hasToolUse) {
      break;
    }
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
