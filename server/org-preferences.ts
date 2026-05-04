import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { orgPreferences, proposals } from "@shared/schema";
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
 * Devuelve un resumen de las preferencias de la organización para inyectar
 * en el system prompt del chat y el generador. Solo las de mayor confianza.
 */
export async function getOrgPreferencesContext(): Promise<string> {
  if (!db) return "";
  try {
    const prefs = await db.select().from(orgPreferences)
      .orderBy(desc(orgPreferences.confidence))
      .limit(30);
    if (prefs.length === 0) return "";
    const lines = prefs.map(p =>
      `- ${p.key} (${p.confidence}%${p.source === "explicit" ? " · admin-set" : ""}): ${p.value}${p.notes ? ` — ${p.notes}` : ""}`
    );
    return `═══════════════════════════════════════════════════════
PREFERENCIAS DE LA ORGANIZACIÓN (memoria de propuestas anteriores)
═══════════════════════════════════════════════════════

${lines.join("\n")}`;
  } catch (err) {
    log(`[org-preferences] could not load: ${(err as Error).message}`);
    return "";
  }
}

/**
 * Cron diario: extrae lecciones de propuestas cerradas (accepted/rejected)
 * en la última semana y las guarda como preferencias inferidas.
 */
export async function runOrgPreferencesExtractor(): Promise<{ recordsProcessed: number }> {
  if (!db) return { recordsProcessed: 0 };
  const anthropic = getClient();
  if (!anthropic) return { recordsProcessed: 0 };

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentClosed = await db.select()
    .from(proposals)
    .where(sql`(${proposals.status} = 'accepted' OR ${proposals.status} = 'rejected') AND (${proposals.acceptedAt} > ${oneWeekAgo} OR ${proposals.updatedAt} > ${oneWeekAgo})`)
    .orderBy(desc(proposals.updatedAt))
    .limit(20);

  if (recentClosed.length === 0) return { recordsProcessed: 0 };

  const context = recentClosed.map(p =>
    `--- ${p.title} (${p.status}) ---\n${JSON.stringify(p.sections, null, 2).substring(0, 4000)}`
  ).join("\n\n");

  const prompt = `Eres un analista que extrae lecciones aprendidas de propuestas cerradas para alimentar la memoria del CRM.

PROPUESTAS RECIENTES (${recentClosed.length}):
${context.substring(0, 60000)}

EXTRAE preferencias/patrones de IM3 Systems. SOLO patrones reales, no especulación. Ejemplos:
- "preferred_stack_crm: Next.js + Drizzle ORM" — si 3+ propuestas usan eso
- "winning_price_range_logistics: $80M-150M COP" — si las accepted están en ese rango
- "rejected_pricing_above: $200M COP" — si las rejected pasaban X
- "preferred_timeline_weeks_logistics: 14-18" — patrón observable

Responde JSON: {"preferences": [{"key": "...", "value": "...", "confidence": 0-100, "notes": "razonamiento breve", "derivedFromProposalIds": ["id1", "id2"]}]}`;

  let extracted: Array<{ key: string; value: string; confidence: number; notes?: string; derivedFromProposalIds?: string[] }> = [];

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "{}";
    const cleaned = text.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as { preferences?: typeof extracted };
    extracted = parsed.preferences || [];
  } catch (err) {
    log(`[org-preferences] extraction failed: ${(err as Error).message}`);
    return { recordsProcessed: 0 };
  }

  // Upsert por key (replace o create)
  let saved = 0;
  for (const pref of extracted) {
    if (!pref.key || !pref.value) continue;
    try {
      const existing = await db.select().from(orgPreferences).where(eq(orgPreferences.key, pref.key)).limit(1);
      if (existing.length > 0) {
        // No sobrescribir explicit con inferred
        if (existing[0].source === "explicit") continue;
        await db.update(orgPreferences).set({
          value: pref.value,
          confidence: pref.confidence ?? 50,
          notes: pref.notes,
          derivedFromProposalIds: pref.derivedFromProposalIds || [],
          updatedAt: new Date(),
        }).where(eq(orgPreferences.id, existing[0].id));
      } else {
        await db.insert(orgPreferences).values({
          key: pref.key,
          value: pref.value,
          source: "inferred",
          confidence: pref.confidence ?? 50,
          notes: pref.notes,
          derivedFromProposalIds: pref.derivedFromProposalIds || [],
        });
      }
      saved++;
    } catch (err) {
      log(`[org-preferences] could not save "${pref.key}": ${(err as Error).message}`);
    }
  }

  log(`[org-preferences] extracted ${extracted.length}, saved ${saved} from ${recentClosed.length} closed proposals`);
  return { recordsProcessed: saved };
}
