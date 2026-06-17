import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { getModelClassification } from "./config";
import { proposals, chatGlobalMemory } from "@shared/schema";
import { eq, desc, sql, and, isNull, isNotNull, or } from "drizzle-orm";
import { log } from "./index";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const MODEL = () => getModelClassification();

// Secciones de una ProposalData (orden estable para el diff)
const SECTION_KEYS = [
  "meta", "hero", "summary", "problem", "solution", "tech",
  "timeline", "roi", "authority", "pricing", "hardware", "operationalCosts", "cta",
] as const;

/**
 * Stringify canónico: ordena las claves recursivamente. Así dos objetos con el
 * mismo contenido pero distinto orden de claves (común cuando el front re-serializa
 * `sections` al guardar) producen el MISMO string → no generan falsos diffs.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * Construye un diff legible por sección entre lo que generó la IA (baseline) y la
 * versión final (editada a mano + por el chat). Solo incluye secciones que cambiaron
 * de contenido real (comparación canónica, inmune a reordenamiento de claves).
 * Trunca para no reventar el presupuesto de tokens de Haiku.
 */
function buildSectionDiff(
  baseline: Record<string, unknown>,
  final: Record<string, unknown>,
): string {
  const blocks: string[] = [];
  const keys = Array.from(new Set([...SECTION_KEYS, ...Object.keys(baseline), ...Object.keys(final)]));
  for (const key of keys) {
    const before = stableStringify(baseline[key] ?? null);
    const after = stableStringify(final[key] ?? null);
    if (before === after) continue; // mismo contenido (ignora orden de claves) → no aporta señal
    blocks.push(
      `### Sección "${key}"\n` +
      `ANTES (IA):\n${before.substring(0, 2500)}\n` +
      `DESPUÉS (final del humano):\n${after.substring(0, 2500)}`,
    );
  }
  return blocks.join("\n\n").substring(0, 18000);
}

/**
 * Lógica de upsert/refuerzo idéntica a extractFactsFromTurn: si ya existe un hecho
 * similar (substring normalizado), sube confidence + reinforcedCount; si no, lo crea.
 */
async function upsertLesson(
  lesson: { category: string; fact: string; confidence: number },
  proposalId: string,
): Promise<boolean> {
  if (!db) return false;
  try {
    const normalized = lesson.fact.toLowerCase().substring(0, 60).trim();
    const existing = await db.select()
      .from(chatGlobalMemory)
      .where(sql`LOWER(${chatGlobalMemory.fact}) LIKE ${`%${normalized.substring(0, 40)}%`}`)
      .limit(1);

    if (existing.length > 0) {
      const ex = existing[0];
      const newSourceIds = Array.from(new Set([...(ex.sourceProposalIds || []), proposalId])).slice(-10);
      await db.update(chatGlobalMemory).set({
        confidence: Math.min(99, ex.confidence + 5),
        reinforcedCount: ex.reinforcedCount + 1,
        lastSeenAt: new Date(),
        sourceProposalIds: newSourceIds,
      }).where(eq(chatGlobalMemory.id, ex.id));
    } else {
      await db.insert(chatGlobalMemory).values({
        category: lesson.category,
        fact: lesson.fact,
        confidence: Math.max(30, Math.min(85, lesson.confidence || 55)),
        sourceProposalIds: [proposalId],
        origin: "edit_diff",
      });
    }
    return true;
  } catch (err) {
    log(`[edit-learner] could not save lesson: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Compara la propuesta generada por la IA (aiBaselineSections) contra la versión
 * final (sections) y generaliza los cambios del humano en lecciones reutilizables
 * de redacción / estructura / patrones numéricos. Guarda en chatGlobalMemory para
 * que el generador las aplique en propuestas futuras.
 *
 * Idempotente: salta si no hay baseline o si ya fue procesada (editLessonsLearnedAt).
 */
export async function extractEditLessons(proposalId: string): Promise<{ lessonsLearned: number }> {
  if (!db) return { lessonsLearned: 0 };
  const anthropic = getClient();
  if (!anthropic) return { lessonsLearned: 0 };

  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) return { lessonsLearned: 0 };
  if (proposal.editLessonsLearnedAt) return { lessonsLearned: 0 }; // ya aprendida
  const baseline = proposal.aiBaselineSections as Record<string, unknown> | null;
  const final = proposal.sections as Record<string, unknown> | null;
  if (!baseline || !final || Object.keys(baseline).length === 0) {
    // Sin baseline IA no hay con qué comparar (ej. propuesta escrita 100% a mano)
    return { lessonsLearned: 0 };
  }

  const diff = buildSectionDiff(baseline, final);
  if (!diff.trim()) {
    // No hubo cambios humanos respecto a la IA → nada que aprender, pero márcala procesada
    await db.update(proposals).set({ editLessonsLearnedAt: new Date() }).where(eq(proposals.id, proposalId));
    return { lessonsLearned: 0 };
  }

  const prompt = `Eres un extractor de lecciones de estilo para el generador de propuestas de IM3 Systems.

Te paso los CAMBIOS que un humano (consultor senior) le hizo a una propuesta que generó la IA: el "ANTES" es lo que escribió la IA y el "DESPUÉS" es la versión final que el humano dejó. Tu trabajo es GENERALIZAR esos cambios en reglas reutilizables para que la IA escriba mejor la PRÓXIMA propuesta (de cualquier cliente).

CAMBIOS (diff por sección):
${diff}

EXTRAE reglas generalizables en estas categorías:
- "style" — redacción/tono: frases más cortas, palabras que el humano cambia consistentemente (ej: "solución integral" → "automatización"), jerga que elimina, segunda persona, etc.
- "structure" — estructura: secciones que reordena, partes que acorta o elimina siempre, formato preferido.
- "pattern" — patrones NUMÉRICOS como tendencia, NUNCA valores fijos. CORRECTO: "la IA tiende a inflar el ROI%, el humano lo baja a rangos más conservadores". INCORRECTO: "el ROI es 180%" o "el precio es 80M".

REGLAS (estrictas — ante la duda, NO extraigas):
- Solo reglas que se repetirían en OTRAS propuestas, de cualquier cliente.
- IGNORA por completo: nombres/datos del cliente, cifras concretas de este negocio, fechas (proposalDate/validUntil cambian solas), correcciones puntuales, y reformateos sin cambio de significado (mismo texto reordenado, espacios, mayúsculas).
- NÚMEROS: solo como TENDENCIA generalizable ("la IA infla el ROI%, bajarlo a rangos conservadores"), JAMÁS un valor concreto. Si no puedes formular el patrón sin citar una cifra específica, NO lo extraigas.
- Necesitas evidencia clara del MISMO patrón para afirmarlo. Un único cambio aislado y ambiguo → no es una regla.
- Cada lección: 1-2 oraciones, accionable, en imperativo ("Usa…", "Evita…", "Presenta…").
- Máximo 5 lecciones. Si los cambios son triviales, específicos del cliente o solo reformateo, responde {"lessons":[]}.

Responde SOLO JSON:
{"lessons":[{"category":"style|structure|pattern","fact":"<regla 1-2 oraciones>","confidence":50-80}]}`;

  let extracted: Array<{ category: string; fact: string; confidence: number }> = [];
  try {
    const response = await anthropic.messages.create({
      model: MODEL(),
      max_tokens: 1000,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "{}";
    const cleaned = text.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as { lessons?: typeof extracted };
    extracted = (parsed.lessons || []).filter(l => l.fact && l.fact.length > 10);
  } catch (err) {
    log(`[edit-learner] extraction failed for ${proposalId}: ${(err as Error).message}`);
    // No marcamos como aprendida: que reintente en un batch futuro
    return { lessonsLearned: 0 };
  }

  let saved = 0;
  for (const lesson of extracted) {
    const cat = ["style", "structure", "pattern"].includes(lesson.category) ? lesson.category : "style";
    if (await upsertLesson({ ...lesson, category: cat }, proposalId)) saved++;
  }

  // Marca la propuesta como procesada aunque no haya lecciones (evita reprocesar el mismo diff)
  await db.update(proposals).set({ editLessonsLearnedAt: new Date() }).where(eq(proposals.id, proposalId));

  if (saved > 0) {
    log(`[edit-learner] learned ${saved} lesson(s) from proposal ${proposalId}`);
  }
  return { lessonsLearned: saved };
}

/**
 * Versión batch para el botón "Ejecutar" del dashboard de agentes: procesa las
 * propuestas ya enviadas/aceptadas que tienen baseline IA y aún no fueron aprendidas.
 */
export async function runEditLearnerBatch(): Promise<{ recordsProcessed: number }> {
  if (!db) return { recordsProcessed: 0 };

  const pending = await db.select({ id: proposals.id })
    .from(proposals)
    .where(and(
      or(eq(proposals.status, "sent"), eq(proposals.status, "accepted")),
      isNotNull(proposals.aiBaselineSections),
      isNull(proposals.editLessonsLearnedAt),
    ))
    .orderBy(desc(proposals.updatedAt))
    .limit(15);

  let total = 0;
  for (const p of pending) {
    const { lessonsLearned } = await extractEditLessons(p.id);
    total += lessonsLearned;
  }

  log(`[edit-learner] batch processed ${pending.length} proposal(s), learned ${total} lesson(s)`);
  return { recordsProcessed: total };
}
