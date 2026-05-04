import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { proposals, proposalChatMessages } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { log } from "./index";

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
- Para pricing, mantén consistencia con el costo de IM3 si está documentado en la propuesta`;

export async function runProposalChat(params: {
  proposalId: string;
  userMessage: string;
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

  // Guardar mensaje del usuario
  await db.insert(proposalChatMessages).values({
    proposalId: params.proposalId,
    role: "user",
    content: params.userMessage,
  });

  // Construir mensajes para Claude
  const claudeMessages: Anthropic.MessageParam[] = history.map(h => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));
  claudeMessages.push({ role: "user", content: params.userMessage });

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
        } else if (toolName === "update_section") {
          const sectionKey = toolInput.sectionKey as string;
          const newContent = toolInput.newContent as Record<string, unknown>;
          const changeSummary = (toolInput.changeSummary as string) || "Sección actualizada";

          // Aplicar cambio en memoria
          currentSections = { ...currentSections, [sectionKey]: newContent };

          // Persistir en DB
          await db.update(proposals)
            .set({ sections: currentSections, updatedAt: new Date() })
            .where(eq(proposals.id, params.proposalId));

          toolCalls.push({ tool: "update_section", section: sectionKey, summary: changeSummary });
          toolResultContent = `Sección "${sectionKey}" actualizada exitosamente.`;
          log(`[proposal-chat] Updated section "${sectionKey}" in proposal ${params.proposalId}: ${changeSummary}`);
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
    createdAt: m.createdAt,
  }));
}
