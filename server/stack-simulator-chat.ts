import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { stackServices, stackSimulatorChatMessages } from "@shared/schema";
import { eq, and, asc } from "drizzle-orm";
import { log } from "./index";
import { calculateStackCost, type CalculatorInput } from "./stack-calculator";
import { buildStackReferenceFromDB } from "./stack-reference";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const MODEL = "claude-sonnet-4-20250514";
const MAX_ITERATIONS = 6;
const MAX_HISTORY = 30;

type ToolCallSummary = { tool: string; summary: string };

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_services",
    description: "Lista los servicios del catálogo de stack. Opcionalmente filtra por categoría (database/storage/ai/messaging/hosting/payments/email/other) o por substring del nombre.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filtro opcional por categoría" },
        nameContains: { type: "string", description: "Filtro opcional por substring del nombre del servicio o vendor" },
      },
    },
  },
  {
    name: "get_service_detail",
    description: "Devuelve el detalle completo de UN servicio (nombre, vendor, billing model, base fee, markup, pricing units, URL). Buscar por id exacto o por nombre (case-insensitive).",
    input_schema: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "ID del servicio o substring del nombre" },
      },
      required: ["identifier"],
    },
  },
  {
    name: "calculate_cost",
    description: "Calcula el costo mensual real para uno o varios servicios con uso estimado. Devuelve breakdown con fijo, variable, total cliente paga, y total anual. Usa esto cuando el usuario pregunte 'cuánto cuesta X' con cantidades específicas.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Array de items a calcular",
          items: {
            type: "object",
            properties: {
              serviceId: { type: "string", description: "ID del servicio (obtenerlo con list_services o get_service_detail primero)" },
              usageEstimate: {
                type: "object",
                description: "Mapa unidad → cantidad mensual. Ej: { 'GB storage': 5, '1M input tokens': 0.5 }. Las unidades exactas vienen de pricingUnits del servicio.",
              },
            },
            required: ["serviceId"],
          },
        },
      },
      required: ["items"],
    },
  },
];

const SYSTEM_PROMPT = `Eres el asistente del simulador de costos operativos de IM3 Systems. Tu trabajo es responder preguntas sobre cuánto cuesta usar servicios del stack tecnológico cuando el admin las hace en vivo (típicamente durante una llamada o presentación con cliente).

═══════════════════════════════════════════════════════
QUÉ HACES
═══════════════════════════════════════════════════════

Respondes preguntas como:
- "¿Cuánto cuestan 500 mensajes WhatsApp marketing al mes?"
- "Si el cliente usa 200GB en Supabase y 5M tokens Claude, ¿cuánto le sale?"
- "Compara el costo de usar Supabase Pro vs el free tier"
- "¿Qué servicios de IA tenemos en el catálogo?"

REGLAS CRÍTICAS:
1. NUNCA inventes precios. Siempre obtén los datos del catálogo usando tus tools.
2. Si el usuario pregunta por un servicio, primero usa list_services o get_service_detail para verificar que existe.
3. Para cualquier cálculo, usa la tool calculate_cost — NO hagas la matemática tú mismo.
4. Si un servicio NO está en el catálogo, dilo claramente y sugiere agregarlo en /admin/stack-catalog.
5. Respuestas concisas y orientadas a presentación con cliente: cifras claras, breakdown visual con bullets si aplica.
6. Español latinoamericano.
7. Cuando muestres totales, formatea: $X.XX/mes, $Y/año.

═══════════════════════════════════════════════════════
TUS TOOLS
═══════════════════════════════════════════════════════

• list_services(category?, nameContains?) — lista servicios del catálogo
• get_service_detail(identifier) — detalle de UN servicio (precios, billing model, pricing units)
• calculate_cost(items[]) — calcula costo real para uno o varios servicios con uso estimado

FLUJO TÍPICO:
1. Usuario pregunta "cuánto cuesta X"
2. Si no sabes qué servicio es, list_services para encontrar candidatos
3. get_service_detail para ver las pricingUnits exactas (qué unidades acepta)
4. calculate_cost con los datos exactos
5. Presenta el resultado al usuario en formato claro

EJEMPLO DE PRESENTACIÓN BUENA:
**Supabase con 200GB storage:**
- Plan Pro incluido: $25/mes
- Storage extra (100GB sobre 100GB free): $2.10/mes
- **Total: $27.10/mes** ($325.20/año)

EJEMPLO DE PRESENTACIÓN MALA (no hagas):
"Más o menos costaría $30 al mes aproximadamente."`;

export async function runSimulatorChat(params: {
  userMessage: string;
}): Promise<{ assistantMessage: string; toolCalls: ToolCallSummary[] }> {
  if (!db) throw new Error("DB no disponible");
  const anthropic = getClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY no configurada");

  const history = await db.select().from(stackSimulatorChatMessages)
    .orderBy(asc(stackSimulatorChatMessages.createdAt))
    .limit(MAX_HISTORY);

  // Guardar mensaje user
  await db.insert(stackSimulatorChatMessages).values({
    role: "user",
    content: params.userMessage,
  });

  const claudeMessages: Anthropic.MessageParam[] = history.map(h => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));
  claudeMessages.push({ role: "user", content: params.userMessage });

  // Inyectar el catálogo en el system prompt (cacheado para reutilizar entre mensajes)
  const stackRef = await buildStackReferenceFromDB().catch(() => "");

  const systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: `═══════════════════════════════════════════════════════
CATÁLOGO ACTUAL (referencia rápida — usa tools para datos exactos)
═══════════════════════════════════════════════════════

${stackRef || "(El catálogo está vacío. Indica al usuario que agregue servicios en /admin/stack-catalog.)"}`,
      cache_control: { type: "ephemeral" },
    },
  ];

  const dbRef = db;
  const toolCalls: ToolCallSummary[] = [];
  let assistantText = "";
  let iteration = 0;

  const executeTool = async (toolName: string, input: Record<string, unknown>): Promise<string> => {
    if (toolName === "list_services") {
      const category = input.category as string | undefined;
      const nameContains = input.nameContains as string | undefined;
      const whereClause = category
        ? and(eq(stackServices.isActive, true), eq(stackServices.category, category))
        : eq(stackServices.isActive, true);
      const rows = await dbRef.select().from(stackServices).where(whereClause).orderBy(asc(stackServices.name));
      let filtered = rows;
      if (nameContains) {
        const q = nameContains.toLowerCase();
        filtered = filtered.filter(r => r.name.toLowerCase().includes(q) || (r.vendor || "").toLowerCase().includes(q));
      }
      toolCalls.push({ tool: "list_services", summary: `Listé ${filtered.length} servicio(s)` });
      const summary = filtered.map(r => `- [${r.id}] ${r.name}${r.vendor ? ` (${r.vendor})` : ""} — categoría: ${r.category}, billingModel: ${r.billingModel}, base: $${r.baseFeeUSD}/mes`).join("\n");
      return filtered.length === 0 ? "(Sin servicios que coincidan con el filtro.)" : summary;
    }
    if (toolName === "get_service_detail") {
      const identifier = (input.identifier as string).toLowerCase();
      // Buscar por id exacto o por substring del nombre
      const rows = await dbRef.select().from(stackServices).where(eq(stackServices.isActive, true));
      const match = rows.find(r => r.id === input.identifier) || rows.find(r => r.name.toLowerCase().includes(identifier) || (r.vendor || "").toLowerCase().includes(identifier));
      if (!match) return `No se encontró servicio "${input.identifier}". Usa list_services para ver los disponibles.`;
      toolCalls.push({ tool: "get_service_detail", summary: `Detalle de ${match.name}` });
      return JSON.stringify({
        id: match.id,
        name: match.name,
        vendor: match.vendor,
        category: match.category,
        description: match.description,
        billingModel: match.billingModel,
        baseFeeUSD: match.baseFeeUSD,
        markupPercent: match.markupPercent,
        pricingUnits: match.pricingUnits,
        url: match.url,
      }, null, 2);
    }
    if (toolName === "calculate_cost") {
      const items = (input.items || []) as CalculatorInput[];
      if (items.length === 0) return "ERROR: items vacío. Pasa al menos un { serviceId, usageEstimate }.";
      const result = await calculateStackCost(items);
      if ("error" in result) return `ERROR: ${result.error}`;
      toolCalls.push({ tool: "calculate_cost", summary: `Calculado para ${items.length} servicio(s) → $${result.totals.monthlyClientPaysUSD.toFixed(2)}/mes` });
      return JSON.stringify(result, null, 2);
    }
    return `Tool "${toolName}" no reconocida.`;
  };

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemBlocks,
      tools: TOOLS,
      messages: claudeMessages,
    });

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

    if (assistantContent.length > 0) {
      claudeMessages.push({ role: "assistant", content: assistantContent });
    }

    if (toolUseBlocks.length === 0) break;

    const toolResults = await Promise.all(toolUseBlocks.map(async (b) => ({
      type: "tool_result" as const,
      tool_use_id: b.id,
      content: await executeTool(b.name, b.input as Record<string, unknown>),
    })));

    claudeMessages.push({ role: "user", content: toolResults });
  }

  const finalText = assistantText.trim() || "(El asistente no devolvió texto)";

  await db.insert(stackSimulatorChatMessages).values({
    role: "assistant",
    content: finalText,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
  });

  return { assistantMessage: finalText, toolCalls };
}

export async function getSimulatorChatHistory(): Promise<Array<{
  id: string;
  role: string;
  content: string;
  toolCalls: ToolCallSummary[] | null;
  createdAt: Date;
}>> {
  if (!db) return [];
  const rows = await db.select().from(stackSimulatorChatMessages)
    .orderBy(asc(stackSimulatorChatMessages.createdAt));
  return rows.map(r => ({
    id: r.id,
    role: r.role,
    content: r.content,
    toolCalls: r.toolCalls as ToolCallSummary[] | null,
    createdAt: r.createdAt,
  }));
}

export async function clearSimulatorChatHistory(): Promise<void> {
  if (!db) return;
  await db.delete(stackSimulatorChatMessages);
}
