import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { chatGlobalMemory } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { log } from "./index";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const MODEL = "claude-haiku-4-5-20251001";

/**
 * Lee la memoria global y devuelve un bloque de texto para inyectar en
 * el system prompt del chat. Filtra por confidence > 30 y ordena por
 * relevancia (confidence × reinforcedCount × recencia).
 */
export async function getGlobalMemoryContext(): Promise<string> {
  if (!db) return "";
  try {
    // Top 50 hechos más relevantes
    const facts = await db.select({
      category: chatGlobalMemory.category,
      fact: chatGlobalMemory.fact,
      confidence: chatGlobalMemory.confidence,
      reinforcedCount: chatGlobalMemory.reinforcedCount,
    })
      .from(chatGlobalMemory)
      .where(sql`${chatGlobalMemory.confidence} >= 30`)
      .orderBy(desc(sql`${chatGlobalMemory.confidence} * ${chatGlobalMemory.reinforcedCount}`))
      .limit(50);

    if (facts.length === 0) return "";

    // Agrupar por categoría
    const grouped: Record<string, Array<{ fact: string; confidence: number; reinforced: number }>> = {};
    for (const f of facts) {
      if (!grouped[f.category]) grouped[f.category] = [];
      grouped[f.category].push({ fact: f.fact, confidence: f.confidence, reinforced: f.reinforcedCount });
    }

    const labels: Record<string, string> = {
      preference: "Preferencias del equipo IM3",
      constraint: "Restricciones / Cosas que NO hacemos",
      pattern: "Patrones por industria/cliente",
      person: "Personas y estilos de comunicación",
      client_history: "Historial de clientes (lo que aceptaron/rechazaron)",
      other: "Otros aprendizajes",
    };

    const lines: string[] = [];
    for (const [cat, items] of Object.entries(grouped)) {
      lines.push(`\n${labels[cat] || cat}:`);
      for (const it of items.slice(0, 15)) {
        const tag = it.reinforced > 1 ? ` [${it.reinforced}×]` : "";
        lines.push(`  • ${it.fact}${tag}`);
      }
    }

    return `═══════════════════════════════════════════════════════
MEMORIA GLOBAL DEL CHAT (aprendizajes cross-proposal/cross-client)
═══════════════════════════════════════════════════════
Estos son hechos que has aprendido en conversaciones anteriores con el admin
sobre TODAS las propuestas y clientes. Úsalos para mantener consistencia y
no preguntar cosas que ya sabes.${lines.join("\n")}`;
  } catch (err) {
    log(`[chat-memory] could not load: ${(err as Error).message}`);
    return "";
  }
}

/**
 * Extrae hechos de una conversación reciente del chat de propuestas.
 * Llamado al final de cada turno (después de que Claude responde).
 * Si el mensaje del usuario contiene insights generalizables, los persiste.
 */
export async function extractFactsFromTurn(params: {
  proposalId: string;
  userMessage: string;
  assistantMessage: string;
  contactCompany?: string;
  contactName?: string;
}): Promise<{ factsExtracted: number }> {
  if (!db) return { factsExtracted: 0 };
  const anthropic = getClient();
  if (!anthropic) return { factsExtracted: 0 };

  // Skip mensajes triviales (acks, "ok", "gracias", etc.)
  const trimmed = params.userMessage.trim();
  if (trimmed.length < 25) return { factsExtracted: 0 };

  const prompt = `Eres un extractor de memoria para un asistente de propuestas comerciales de IM3 Systems.

Te paso UN turno de conversación entre el admin y el asistente. Extrae SOLO hechos generalizables que valga la pena recordar para futuras propuestas y clientes — no detalles específicos del caso actual.

CONTEXTO DEL TURNO:
- Cliente: ${params.contactCompany || "(desconocido)"} / ${params.contactName || "(desconocido)"}
- Mensaje del admin: ${trimmed.substring(0, 2000)}
- Respuesta del asistente: ${params.assistantMessage.substring(0, 1500)}

EXTRAE solo si hay:
- Preferencias del equipo IM3 ("usamos Drizzle", "preferimos pricing por milestone")
- Restricciones / cosas que NO hacemos ("no usamos Firebase", "nunca cobramos retainers")
- Patrones por industria/cliente ("logística siempre necesita módulo de asistencia")
- Estilo de personas ("Carlos prefiere notas de voz")
- Historial de clientes específicos que sea relevante recordar después

NO extraigas:
- Cambios concretos a esta propuesta específica (ya están en la propuesta)
- Saludos, agradecimientos, confirmaciones
- Información que ya estaba en el diagnóstico (ya tenemos eso)
- Especulación

Si no hay nada generalizable, responde: {"facts":[]}

Sino, responde JSON:
{"facts":[{"category":"preference|constraint|pattern|person|client_history|other","fact":"<oración 1-2 líneas>","confidence":50-90}]}`;

  let extracted: Array<{ category: string; fact: string; confidence: number }> = [];

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 800,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "{}";
    const cleaned = text.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as { facts?: typeof extracted };
    extracted = (parsed.facts || []).filter(f => f.fact && f.fact.length > 10);
  } catch (err) {
    log(`[chat-memory] extraction failed: ${(err as Error).message}`);
    return { factsExtracted: 0 };
  }

  if (extracted.length === 0) return { factsExtracted: 0 };

  // Para cada hecho extraído, decidir: ¿es nuevo o refuerzo de uno existente?
  // Heurística simple: buscar hechos similares por substring (primer 40 chars normalizados).
  let saved = 0;
  for (const f of extracted) {
    try {
      const normalized = f.fact.toLowerCase().substring(0, 60).trim();
      const existing = await db.select()
        .from(chatGlobalMemory)
        .where(sql`LOWER(${chatGlobalMemory.fact}) LIKE ${`%${normalized.substring(0, 40)}%`}`)
        .limit(1);

      if (existing.length > 0) {
        // Refuerzo: subir confidence + reinforcedCount + last_seen
        const ex = existing[0];
        const newSourceIds = Array.from(new Set([...(ex.sourceProposalIds || []), params.proposalId])).slice(-10);
        await db.update(chatGlobalMemory).set({
          confidence: Math.min(99, ex.confidence + 5),
          reinforcedCount: ex.reinforcedCount + 1,
          lastSeenAt: new Date(),
          sourceProposalIds: newSourceIds,
        }).where(eq(chatGlobalMemory.id, ex.id));
      } else {
        await db.insert(chatGlobalMemory).values({
          category: f.category,
          fact: f.fact,
          confidence: Math.max(30, Math.min(90, f.confidence || 50)),
          sourceProposalIds: [params.proposalId],
        });
      }
      saved++;
    } catch (err) {
      log(`[chat-memory] could not save fact: ${(err as Error).message}`);
    }
  }

  if (saved > 0) {
    log(`[chat-memory] extracted ${extracted.length}, persisted ${saved} from proposal ${params.proposalId}`);
  }
  return { factsExtracted: saved };
}
