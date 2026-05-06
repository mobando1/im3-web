import Anthropic from "@anthropic-ai/sdk";
import { log } from "./index";
import { db } from "./db";
import { clientProjects, projectPhases, projectTasks, projectDeliverables, projectActivityEntries, projectTimeLog, projectIdeas } from "@shared/schema";
import { eq, desc, gte, asc } from "drizzle-orm";
import { IM3_PROJECT_CONTEXT } from "./im3-project-context";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Tolerant JSON extractor. Handles markdown code fences, prose before/after,
 * and partial responses. Logs the raw text on failure so we can diagnose
 * exactly what Claude returned (helps when models drift their output format).
 */
function parseAIJson<T>(text: string, label: string): T | null {
  if (!text || typeof text !== "string") {
    log(`parseAIJson [${label}] received empty/non-string input`);
    return null;
  }
  let cleaned = text.trim().replace(/^```(?:json|JSON)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const candidate = arrayMatch?.[0] || objMatch?.[0];
    if (candidate) {
      try {
        return JSON.parse(candidate) as T;
      } catch (err2) {
        log(`parseAIJson [${label}] secondary parse failed: ${(err2 as Error).message}. Raw (first 800ch): ${text.slice(0, 800)}`);
        return null;
      }
    }
    log(`parseAIJson [${label}] no JSON found. Raw (first 800ch): ${text.slice(0, 800)}`);
    return null;
  }
}

type ValidationResult = { ok: true } | { ok: false; feedback: string };

/**
 * Mini-agente loop: llama a Sonnet, parsea, valida estructura. Si falla,
 * inyecta el feedback puntual al system prompt y reintenta hasta `maxRetries`
 * veces. Esto convierte la generación AI de un one-shot frágil (cualquier
 * truncado/malformación → fallback genérico) en algo auto-curativo: cuando
 * Sonnet emite algo raro, le decimos QUÉ falló específicamente y le damos
 * otra oportunidad.
 *
 * Retorna `null` solo después de agotar todos los reintentos. El caller
 * decide si tirar error (cae al fallback skeleton) o seguir.
 */
async function callSonnetWithRetry<T>(opts: {
  client: Anthropic;
  model: string;
  maxTokens: number;
  baseSystem: string;
  userMessage: string;
  parser: (text: string) => T | null;
  validator: (parsed: T) => ValidationResult;
  label: string;
  maxRetries?: number;
}): Promise<T | null> {
  const { client, model, maxTokens, baseSystem, userMessage, parser, validator, label } = opts;
  const maxRetries = opts.maxRetries ?? 2;

  let lastFeedback: string | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const system = lastFeedback
      ? `${baseSystem}\n\n---\nINTENTO ANTERIOR FALLÓ — corrige esto:\n${lastFeedback}\n\nResponde de nuevo cumpliendo EXACTAMENTE el formato pedido.`
      : baseSystem;

    try {
      const response = await client.messages.create({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: userMessage }] });
      const text = response.content?.[0]?.type === "text" ? response.content[0].text : "";
      const parsed = parser(text);

      if (parsed === null || parsed === undefined) {
        lastFeedback = "El JSON no se pudo parsear. Devuelve SOLO un array JSON válido, sin markdown ni texto extra antes o después.";
        log(`${label}: attempt ${attempt + 1}/${maxRetries + 1} parse failed`);
        continue;
      }

      const validation = validator(parsed);
      if (validation.ok) {
        if (attempt > 0) log(`${label}: succeeded on retry attempt ${attempt + 1}`);
        return parsed;
      }

      lastFeedback = validation.feedback;
      log(`${label}: attempt ${attempt + 1}/${maxRetries + 1} validation failed: ${validation.feedback}`);
    } catch (err) {
      lastFeedback = `Error de API en intento previo: ${err instanceof Error ? err.message : String(err)}. Asegúrate de devolver JSON válido.`;
      log(`${label}: attempt ${attempt + 1} threw: ${err}`);
    }
  }

  log(`${label}: all ${maxRetries + 1} attempts exhausted, returning null`);
  return null;
}

/**
 * Validador para la respuesta del prompt de diseño de fases.
 * Exige: 3-6 fases, name >=5 chars, weeks 1-20, description >=30 chars
 * con 2-4 frases, keyOutcomes array con >=2 elementos, deliverables >=1.
 * Si hasRepo, exige completionPercent entero 0-100.
 */
function validatePhaseSpecs(parsed: unknown, hasRepo: boolean): ValidationResult {
  if (!Array.isArray(parsed)) {
    return { ok: false, feedback: "La respuesta no es un array. Devuelve un JSON array de fases." };
  }
  if (parsed.length < 3 || parsed.length > 6) {
    return { ok: false, feedback: `El array tiene ${parsed.length} fases pero deben ser entre 3 y 6.` };
  }
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i] as Record<string, unknown>;
    if (!p || typeof p !== "object") {
      return { ok: false, feedback: `La fase ${i + 1} no es un objeto.` };
    }
    if (typeof p.name !== "string" || p.name.length < 5) {
      return { ok: false, feedback: `La fase ${i + 1} no tiene "name" válido (string >= 5 chars).` };
    }
    if (typeof p.weeks !== "number" || p.weeks < 1 || p.weeks > 20) {
      return { ok: false, feedback: `La fase ${i + 1} ("${p.name}") tiene "weeks" inválido. Debe ser número entre 1 y 20.` };
    }
    if (typeof p.description !== "string" || p.description.length < 30) {
      return { ok: false, feedback: `La fase ${i + 1} ("${p.name}") no tiene "description" suficiente. Necesito 2-4 frases (mínimo 30 chars) explicando qué hace la fase.` };
    }
    if (!Array.isArray(p.keyOutcomes) || p.keyOutcomes.length < 2) {
      return { ok: false, feedback: `La fase ${i + 1} ("${p.name}") tiene menos de 2 keyOutcomes. Necesito 3-5 bullets concretos y verificables.` };
    }
    if (!Array.isArray(p.deliverables) || p.deliverables.length < 1) {
      return { ok: false, feedback: `La fase ${i + 1} ("${p.name}") no tiene "deliverables". Necesito 2-4 entregables.` };
    }
    if (hasRepo) {
      if (typeof p.completionPercent !== "number" || p.completionPercent < 0 || p.completionPercent > 100 || !Number.isInteger(p.completionPercent)) {
        return { ok: false, feedback: `La fase ${i + 1} ("${p.name}") falta "completionPercent" como entero 0-100. Es OBLIGATORIO cuando hay contexto del repo.` };
      }
    }
  }
  return { ok: true };
}

/**
 * Validador para la respuesta del prompt de tareas por fase.
 * Exige un objeto con phaseIndex y tasks por cada fase esperada.
 * tasks debe tener al menos 4 elementos con title no vacío.
 */
function validatePhaseTasks(parsed: unknown, expectedPhaseCount: number): ValidationResult {
  if (!Array.isArray(parsed)) {
    return { ok: false, feedback: "La respuesta no es un array. Devuelve un JSON array de objetos {phaseIndex, tasks}." };
  }
  if (parsed.length < expectedPhaseCount) {
    return { ok: false, feedback: `Solo recibí tareas para ${parsed.length} fases pero hay ${expectedPhaseCount}. Debes incluir UN objeto por cada fase, con phaseIndex de 0 a ${expectedPhaseCount - 1}.` };
  }
  const seenIndexes = new Set<number>();
  for (let i = 0; i < parsed.length; i++) {
    const pt = parsed[i] as Record<string, unknown>;
    if (!pt || typeof pt !== "object") {
      return { ok: false, feedback: `El elemento ${i} no es un objeto.` };
    }
    if (typeof pt.phaseIndex !== "number" || !Number.isInteger(pt.phaseIndex)) {
      return { ok: false, feedback: `El elemento ${i} no tiene "phaseIndex" como entero. Cada objeto debe tener phaseIndex: 0, 1, 2, ...` };
    }
    if (pt.phaseIndex < 0 || pt.phaseIndex >= expectedPhaseCount) {
      return { ok: false, feedback: `phaseIndex ${pt.phaseIndex} está fuera de rango (válido: 0-${expectedPhaseCount - 1}).` };
    }
    if (seenIndexes.has(pt.phaseIndex)) {
      return { ok: false, feedback: `phaseIndex ${pt.phaseIndex} aparece más de una vez. Cada fase debe tener UN solo objeto.` };
    }
    seenIndexes.add(pt.phaseIndex);
    if (!Array.isArray(pt.tasks) || pt.tasks.length < 4) {
      return { ok: false, feedback: `La fase phaseIndex ${pt.phaseIndex} tiene ${Array.isArray(pt.tasks) ? pt.tasks.length : 0} tareas. Necesito mínimo 4 (idealmente 6-8).` };
    }
    for (let j = 0; j < pt.tasks.length; j++) {
      const t = pt.tasks[j] as Record<string, unknown>;
      if (!t || typeof t.title !== "string" || t.title.trim().length < 5) {
        return { ok: false, feedback: `La tarea ${j + 1} de phaseIndex ${pt.phaseIndex} no tiene "title" válido (>=5 chars).` };
      }
    }
  }
  for (let i = 0; i < expectedPhaseCount; i++) {
    if (!seenIndexes.has(i)) {
      return { ok: false, feedback: `Falta phaseIndex ${i}. Debe haber un objeto por cada índice de 0 a ${expectedPhaseCount - 1}.` };
    }
  }
  return { ok: true };
}

type CommitInfo = {
  sha: string;
  message: string;
  filesChanged: string[];
  timestamp: string;
};

type ActivityResult = {
  summaryLevel1: string;
  summaryLevel2: string;
  summaryLevel3: string;
  category: "feature" | "bugfix" | "improvement" | "infrastructure" | "meeting" | "milestone";
  suggestedTaskTitle: string | null;
  isSignificant: boolean;
};

/**
 * Analyzes a batch of commits for a project and generates client-facing activity entries.
 * Uses Claude to translate technical commits into human-readable updates.
 */
export async function analyzeCommitsForProject(
  projectId: string,
  commits: CommitInfo[]
): Promise<ActivityResult[]> {
  const ai = getClient();
  if (!ai || !db) return [];
  if (commits.length === 0) return [];

  // Fetch project context
  const [project] = await db.select().from(clientProjects).where(eq(clientProjects.id, projectId));
  if (!project) return [];

  const phases = await db.select().from(projectPhases).where(eq(projectPhases.projectId, projectId)).orderBy(asc(projectPhases.orderIndex));
  const tasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId));

  const phaseContext = phases.map((ph, i) => {
    const phaseTasks = tasks.filter(t => t.phaseId === ph.id);
    return `Fase ${i + 1}: ${ph.name} (${ph.status})\n  Tareas: ${phaseTasks.map(t => `${t.title} [${t.status}]`).join(", ") || "ninguna"}`;
  }).join("\n");

  const commitContext = commits.map(c =>
    `- ${c.message}\n  Archivos: ${c.filesChanged.slice(0, 10).join(", ")}${c.filesChanged.length > 10 ? ` (+${c.filesChanged.length - 10} más)` : ""}`
  ).join("\n");

  const prompt = `Eres un project manager experto que traduce trabajo técnico de desarrollo de software a reportes claros para clientes que NO son técnicos.

PROYECTO: ${project.name}
DESCRIPCIÓN: ${project.description || "Sin descripción"}

ESTADO ACTUAL DEL ROADMAP:
${phaseContext}

COMMITS RECIENTES (del más reciente al más antiguo):
${commitContext}

INSTRUCCIONES:
Agrupa los commits por área de trabajo y genera entradas de actividad. Para cada grupo:

1. summaryLevel1: UNA línea en español. Lenguaje 100% no técnico. Ejemplo: "Se completó la pantalla de seguimiento de envíos"
2. summaryLevel2: Un párrafo (3-5 oraciones) explicando QUÉ se hizo y POR QUÉ importa para el negocio del cliente. Sin jerga técnica.
3. summaryLevel3: Detalle completo con bullet points. AQUÍ SÍ puedes incluir detalles más técnicos pero siempre explicados. Documenta:
   - Cada cosa que se hizo
   - Si hubo un problema y cómo se resolvió
   - Si se intentó algo que no funcionó y por qué se cambió de enfoque
   - Decisiones técnicas importantes y su justificación
4. category: "feature" | "bugfix" | "improvement" | "infrastructure"
5. suggestedTaskTitle: El título de la tarea del roadmap que más se relaciona (null si no aplica)
6. isSignificant: true si es algo que el cliente debería notar (nueva funcionalidad, entrega, hito)

REGLAS ESTRICTAS:
- TODO en español latinoamericano
- NUNCA menciones nombres de archivos, funciones o variables en nivel 1 o nivel 2
- Nivel 3 puede mencionar conceptos técnicos pero SIEMPRE explicados entre paréntesis
- NO resumas de más. Cada commit debe reflejarse en alguna actividad
- Si un commit es un "fix", explica QUÉ problema había y CÓMO afectaba al usuario
- Si se hizo un "refactor", tradúcelo como "Se mejoró la organización interna del código para mayor eficiencia"
- Enmarca todo como VALOR entregado al cliente, no como código escrito
- Un commit de tests = "Se agregaron verificaciones automáticas de calidad"

Responde en JSON exacto (array de objetos):
[
  {
    "summaryLevel1": "...",
    "summaryLevel2": "...",
    "summaryLevel3": "...",
    "category": "feature",
    "suggestedTaskTitle": "Módulo de envíos" | null,
    "isSignificant": true
  }
]

SOLO devuelve el JSON, nada más.`;

  try {
    const response = await ai.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    // Extract JSON from response (handle possible markdown wrapping)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      log("project-ai: Could not parse AI response as JSON");
      return [];
    }

    const results: ActivityResult[] = JSON.parse(jsonMatch[0]);
    return results;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log(`project-ai: Error analyzing commits: ${message}`);
    return [];
  }
}

/**
 * Generates a weekly summary for a project based on recent activity entries.
 * Returns a formatted summary suitable for chat messages or email.
 */
export async function generateWeeklySummary(projectId: string): Promise<string | null> {
  const ai = getClient();
  if (!ai || !db) return null;

  const [project] = await db.select().from(clientProjects).where(eq(clientProjects.id, projectId));
  if (!project) return null;

  // Get last 7 days of activity
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const activities = await db.select().from(projectActivityEntries)
    .where(eq(projectActivityEntries.projectId, projectId))
    .orderBy(desc(projectActivityEntries.createdAt));

  const recentActivities = activities.filter(a => new Date(a.createdAt) >= oneWeekAgo);

  // Get tasks for progress context (también nos da fallback cuando no hay activity entries)
  const allTasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId));
  const completedTasks = allTasks.filter(t => t.status === "completed").length;
  const progress = allTasks.length > 0 ? Math.round((completedTasks / allTasks.length) * 100) : 0;
  const tasksCompletedThisWeek = allTasks.filter(t => t.completedAt && new Date(t.completedAt) >= oneWeekAgo);

  // Get hours this week
  const timeLogs = await db.select().from(projectTimeLog)
    .where(eq(projectTimeLog.projectId, projectId));
  const weeklyHours = timeLogs
    .filter(t => new Date(t.date) >= oneWeekAgo)
    .reduce((sum, t) => sum + parseFloat(String(t.hours)), 0);
  const weeklyTimeLogEntries = timeLogs.filter(t => new Date(t.date) >= oneWeekAgo);

  // Si no hay actividades AI ni tareas completadas ni horas registradas → no hay nada que reportar
  if (recentActivities.length === 0 && tasksCompletedThisWeek.length === 0 && weeklyTimeLogEntries.length === 0) {
    return null;
  }

  const activitySummary = recentActivities.length > 0
    ? recentActivities.map(a => `- [${a.category}] ${a.summaryLevel1}`).join("\n")
    : "(sin entradas auto-generadas esta semana)";

  const tasksSummary = tasksCompletedThisWeek.length > 0
    ? tasksCompletedThisWeek.map(t => `- ${t.clientFacingTitle || t.title}`).join("\n")
    : "(ninguna tarea cerrada esta semana)";

  const timeLogSummary = weeklyTimeLogEntries.length > 0
    ? weeklyTimeLogEntries.slice(0, 10).map(t => `- ${t.date}: ${t.hours}h ${t.description ? `— ${t.description}` : ""}`).join("\n")
    : "(sin entradas de tiempo)";

  const prompt = `Genera un resumen semanal breve y profesional para el cliente del proyecto "${project.name}".

Progreso actual: ${progress}%
Horas invertidas esta semana: ${weeklyHours.toFixed(1)}h
Tareas cerradas esta semana: ${tasksCompletedThisWeek.length}

Tareas completadas:
${tasksSummary}

Entradas de actividad (commits/decisiones):
${activitySummary}

Time log de la semana:
${timeLogSummary}

Escribe un resumen de 4-6 líneas en español latinoamericano, tono profesional pero cercano. Incluye:
1. Qué se logró esta semana (2-3 puntos principales — combina tareas + actividades + time log)
2. En qué se enfocará la próxima semana
3. Si hay algo pendiente de revisión del cliente

NO uses markdown. Texto plano con saltos de línea. NO incluyas emojis.`;

  try {
    const response = await ai.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    return response.content[0].type === "text" ? response.content[0].text.trim() : null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log(`project-ai: Error generating weekly summary: ${message}`);
    return null;
  }
}

/**
 * Calculates and updates the health status of a project based on timeline and progress.
 */
export async function calculateProjectHealth(projectId: string): Promise<{
  healthStatus: string;
  healthNote: string;
}> {
  if (!db) return { healthStatus: "on_track", healthNote: "" };

  const [project] = await db.select().from(clientProjects).where(eq(clientProjects.id, projectId));
  if (!project) return { healthStatus: "on_track", healthNote: "" };

  const allTasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId));
  const completedTasks = allTasks.filter(t => t.status === "completed").length;
  const progress = allTasks.length > 0 ? (completedTasks / allTasks.length) * 100 : 0;
  const blockedTasks = allTasks.filter(t => t.status === "blocked").length;

  const now = new Date();
  const start = project.startDate ? new Date(project.startDate) : null;
  const end = project.estimatedEndDate ? new Date(project.estimatedEndDate) : null;

  let healthStatus = "on_track";
  let healthNote = "Tu proyecto avanza según lo planeado.";

  if (start && end) {
    const totalDuration = end.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
    const expectedProgress = Math.min(100, (elapsed / totalDuration) * 100);

    if (progress >= expectedProgress + 10) {
      healthStatus = "ahead";
      healthNote = "Vamos adelantados. Podrías recibir tu proyecto antes de lo esperado.";
    } else if (progress < expectedProgress - 15) {
      healthStatus = "behind";
      healthNote = "Estamos un poco atrás del plan. Estamos ajustando para recuperar el ritmo.";
    } else if (blockedTasks > 0) {
      healthStatus = "at_risk";
      healthNote = `Hay ${blockedTasks} tarea${blockedTasks > 1 ? "s" : ""} bloqueada${blockedTasks > 1 ? "s" : ""}. Estamos trabajando en resolverlo.`;
    }
  } else if (blockedTasks > 0) {
    healthStatus = "at_risk";
    healthNote = `Hay ${blockedTasks} tarea${blockedTasks > 1 ? "s" : ""} bloqueada${blockedTasks > 1 ? "s" : ""}. Estamos trabajando en resolverlo.`;
  }

  // Update in DB
  await db.update(clientProjects).set({ healthStatus, healthNote, updatedAt: new Date() }).where(eq(clientProjects.id, projectId));

  return { healthStatus, healthNote };
}

type PhaseSpec = {
  name: string;
  weeks: number;
  deliverables?: string[];
  currentStatus?: "pending" | "in_progress" | "completed";
  completionPercent?: number;
  evidence?: string;
  description?: string;
  keyOutcomes?: string[];
};

/**
 * Maps a 0-100 completion percent to one of the three discrete statuses
 * we store on the phase row. >=90 counts as fully done, <30 as not started,
 * anything in between is in_progress.
 */
function deriveStatusFromPercent(percent: number): "pending" | "in_progress" | "completed" {
  if (percent >= 90) return "completed";
  if (percent >= 30) return "in_progress";
  return "pending";
}

type GenerateArtifactsOptions = {
  brief: string;
  phasesHint?: PhaseSpec[];
  repoContext?: string;
  startDate?: Date;
  totalWeeksHint?: number;
};

/**
 * Generates phases, tasks, deliverables and ideas for an existing project using AI.
 * - If phasesHint is provided (proposal flow), uses those phases as-is.
 * - Otherwise asks Claude Sonnet to design 3-6 phases from the brief (+ optional repo context).
 * Then generates 4-8 tasks per phase with Claude Haiku.
 */
export async function generateProjectArtifacts(
  projectId: string,
  opts: GenerateArtifactsOptions,
): Promise<{ phasesCreated: number; tasksCreated: number; deliverablesCreated: number }> {
  const anthropic = getClient();
  if (!db) throw new Error("Database not configured");
  const database = db;

  const startDate = opts.startDate ?? new Date();
  const brief = opts.brief.trim();
  const repoContext = opts.repoContext?.trim() || "";

  // 1. Resolve phases — either provided or designed by AI
  let phaseSpecs: PhaseSpec[] = opts.phasesHint ?? [];

  if (phaseSpecs.length === 0) {
    if (!anthropic) {
      log(`generateProjectArtifacts: no phasesHint and no Anthropic key — skipping phases`);
      return { phasesCreated: 0, tasksCreated: 0, deliverablesCreated: 0 };
    }

    try {
      const hasRepo = !!repoContext;
      const designPrompt = `Brief del proyecto:\n${brief}${repoContext ? `\n\nContexto del repositorio:\n${repoContext}` : ""}`;
      const designSystem = `${IM3_PROJECT_CONTEXT}

---

Eres un project manager senior de IM3 Systems diseñando el plan de un proyecto. Sigue las reglas de IM3 arriba al pie de la letra.

Diseña entre 3 y 6 fases secuenciales. Cada fase debe tener:
- "name": nombre concreto al dominio del cliente (no genérico).
- "weeks": duración realista en semanas (2-4 típicamente).
- "description": 2 a 4 frases explicando QUÉ se hace en esta fase, PARA QUÉ sirve, y cuál es la entrega principal. Pensado para que un empresario no técnico entienda. NO genérico — específico al brief y al dominio.
- "keyOutcomes": array de 3 a 5 strings cortos (máx 100 chars cada uno), concretos y verificables, describiendo los logros de la fase. Tipo bullet point. Ejemplos: "Schema multi-tenant con RLS por organización validado", "Webhook Meta verificado y enrutando mensajes al bot correcto".
- "deliverables": 2 a 4 entregables verificables (similar a keyOutcomes pero pensados como cosas que el cliente revisa/aprueba).${hasRepo ? `

IMPORTANTE — el repo ya tiene avance:
Te pasé contexto real del repositorio (README, manifest, estructura de archivos, endpoints detectados, schema de DB y los últimos 30 commits). Tu trabajo es deducir qué fases ya están hechas y cuáles faltan. NO seas conservador: si la evidencia del repo muestra que algo ya existe, márcalo como hecho.

Para CADA fase devuelve ADEMÁS estos tres campos:

1. "completionPercent": entero 0-100. Qué porcentaje de la fase ya está implementado en el repo.
   - 100 = todo lo central de la fase ya existe en código y commits
   - 70-99 = la mayoría hecho, faltan detalles
   - 30-69 = parcialmente armado
   - 1-29 = apenas empezó
   - 0 = nada de esa fase tocada todavía

2. "currentStatus": "completed" si completionPercent>=90, "in_progress" si está entre 30-89, "pending" si <30. Debe ser consistente con completionPercent.

3. "evidence": frase corta (máx 140 chars) citando QUÉ del repo justifica ese porcentaje. Solo obligatoria cuando completionPercent>0. Ejemplo: "schema Drizzle + endpoints /api/auth ya existen, commit 'auth funcionando' del 14 abril". Si completionPercent=0, omite el campo o pon "".

REGLAS DURAS:
- Sesgo a marcar COMPLETED las fases tempranas de infraestructura cuando hay evidencia: si el repo ya tiene auth/login operando, schema de DB definido, deploy en producción mencionado o frameworks instalados con código real, esas fases (setup, foundation, scaffolding, base de datos, auth) van como completed por defecto, NO como in_progress.
- Si ves endpoints reales (app/api/*, pages/api/*, server/routes.*) implementando lo que la fase pide, esa fase está al menos in_progress con completionPercent >= 50.
- Si ves commits con mensajes que mencionan explícitamente la funcionalidad de la fase, súmalo al porcentaje.
- NO listes como "pendiente" cosas que ya existen visibles en la estructura del repo.
- Si el repo tiene >20 commits y el último push es reciente, asume que las primeras 1-2 fases están completed salvo evidencia clara en contra.` : ""}

Responde SOLO con un JSON array válido, sin markdown ni texto extra. Formato:
[
  {
    "name": "Nombre de la fase",
    "weeks": 3,
    "description": "Frase 1. Frase 2. Frase 3.",
    "keyOutcomes": ["Logro concreto 1", "Logro concreto 2", "Logro concreto 3"],
    "deliverables": ["Entregable 1", "Entregable 2"]${hasRepo ? `,
    "completionPercent": 0,
    "currentStatus": "pending",
    "evidence": ""` : ""}
  }
]`;

      const parsed = await callSonnetWithRetry<PhaseSpec[]>({
        client: anthropic,
        model: "claude-sonnet-4-6",
        maxTokens: 4000,
        baseSystem: designSystem,
        userMessage: designPrompt,
        parser: (text) => parseAIJson<PhaseSpec[]>(text, "design-phases-fresh"),
        validator: (p) => validatePhaseSpecs(p, hasRepo),
        label: "design-phases-fresh",
        maxRetries: 2,
      });

      if (!parsed || !Array.isArray(parsed) || parsed.length === 0) throw new Error("AI returned empty phases after retries");
      phaseSpecs = parsed.map(p => {
        const cs = p.currentStatus;
        const explicitStatus = cs === "completed" || cs === "in_progress" || cs === "pending" ? cs : undefined;
        // Trust completionPercent over the enum if both are present, since
        // Claude is consistent with percentages but sometimes drifts the enum.
        const rawPercent = Number(p.completionPercent);
        const hasPercent = Number.isFinite(rawPercent);
        const completionPercent = hasPercent ? Math.max(0, Math.min(100, Math.round(rawPercent))) : undefined;
        const derivedStatus = completionPercent !== undefined ? deriveStatusFromPercent(completionPercent) : undefined;
        const finalStatus = derivedStatus ?? explicitStatus;
        const evidence = typeof p.evidence === "string" ? p.evidence.trim().slice(0, 200) : undefined;
        const description = typeof p.description === "string" ? p.description.trim().slice(0, 800) : undefined;
        const keyOutcomes = Array.isArray(p.keyOutcomes)
          ? p.keyOutcomes.map(String).map(s => s.trim()).filter(s => s.length > 0).slice(0, 6)
          : undefined;
        return {
          name: String(p.name || "Fase").slice(0, 200),
          weeks: Math.max(1, Math.min(20, Number(p.weeks) || 2)),
          deliverables: Array.isArray(p.deliverables) ? p.deliverables.map(String).slice(0, 6) : [],
          currentStatus: finalStatus,
          completionPercent,
          evidence,
          description,
          keyOutcomes,
        };
      });
    } catch (err) {
      log(`AI phase design failed: ${err}. Falling back to single planning phase.`);
      phaseSpecs = [{ name: "Planeación inicial", weeks: 2, deliverables: ["Plan de proyecto"] }];
    }
  }

  // 2. Insert phases + deliverables
  let totalDeliverables = 0;
  let currentDate = new Date(startDate);
  const insertedPhases: Array<{ id: string; startDate: Date; endDate: Date; spec: PhaseSpec; phaseStatus: string }> = [];

  for (let i = 0; i < phaseSpecs.length; i++) {
    const p = phaseSpecs[i];
    const phaseEndDate = new Date(currentDate.getTime() + (p.weeks * 7 * 24 * 60 * 60 * 1000));
    const phaseStatus = p.currentStatus || "pending";
    const isCompleted = phaseStatus === "completed";

    // Compose a rich phase description: narrative + bullet outcomes + evidence
    // (when AI recognized work in the repo). Each block is separated by a blank
    // line so the EditableText in the UI keeps it readable and editable.
    const descParts: string[] = [];
    if (p.description) descParts.push(p.description);
    if (p.keyOutcomes && p.keyOutcomes.length > 0) {
      descParts.push(p.keyOutcomes.map(o => `• ${o}`).join("\n"));
    }
    if (p.evidence && phaseStatus !== "pending") {
      descParts.push(`Evidencia (auto-detectada del repo): ${p.evidence}`);
    }
    const fullDescription = descParts.length > 0 ? descParts.join("\n\n") : null;

    const [phase] = await database.insert(projectPhases).values({
      projectId,
      name: p.name,
      description: fullDescription,
      orderIndex: i,
      status: phaseStatus,
      startDate: currentDate,
      endDate: phaseEndDate,
      estimatedHours: Math.round(p.weeks * 40),
    }).returning();

    if (p.deliverables && p.deliverables.length > 0) {
      for (const d of p.deliverables) {
        await database.insert(projectDeliverables).values({
          projectId,
          phaseId: phase.id,
          title: d,
          type: d.toLowerCase().includes("diseño") || d.toLowerCase().includes("mockup") || d.toLowerCase().includes("figma") ? "design"
            : d.toLowerCase().includes("documento") || d.toLowerCase().includes("spec") ? "document"
            : "feature",
          status: isCompleted ? "delivered" : "pending",
          deliveredAt: isCompleted ? new Date() : null,
        });
        totalDeliverables++;
      }
    }

    insertedPhases.push({ id: phase.id, startDate: new Date(currentDate), endDate: phaseEndDate, spec: p, phaseStatus });
    currentDate = phaseEndDate;
  }

  // Update project's estimatedEndDate if no hint was provided (phases were freshly designed)
  if (!opts.phasesHint && insertedPhases.length > 0) {
    await database.update(clientProjects)
      .set({ estimatedEndDate: currentDate, updatedAt: new Date() })
      .where(eq(clientProjects.id, projectId));
  }

  // 3. Generate tasks per phase with Claude Haiku
  let totalTasks = 0;
  if (anthropic && insertedPhases.length > 0) {
    try {
      // taskContext intentionally NO LONGER includes the full repoContext.
      // The first call already used it to assign currentStatus + evidence per
      // phase; passing it again here just eats the token budget and made
      // Sonnet truncate the JSON response (silent fallback to "Completar Fase X").
      // Instead we pass a compact summary: phase name + status + evidence.
      const taskContext = `
Brief del proyecto:
${brief.slice(0, 800)}

Fases ya diseñadas (con su estado y descripción):
${phaseSpecs.map((p, i) => {
  const statusBits: string[] = [];
  if (p.currentStatus) statusBits.push(p.currentStatus);
  if (p.completionPercent !== undefined) statusBits.push(`${p.completionPercent}%`);
  const statusStr = statusBits.length > 0 ? ` [${statusBits.join(" ")}]` : "";
  const desc = p.description ? `\n   Descripción: ${p.description.slice(0, 400)}` : "";
  const ev = p.evidence ? `\n   Evidencia del repo: ${p.evidence}` : "";
  const outcomes = p.keyOutcomes && p.keyOutcomes.length > 0
    ? `\n   Logros: ${p.keyOutcomes.slice(0, 4).join(" · ")}`
    : "";
  return `${i + 1}. ${p.name}${statusStr} (${p.weeks} semanas)${desc}${outcomes}${ev}`;
}).join("\n\n")}
`.trim();

      const tasksSystem = `${IM3_PROJECT_CONTEXT}

---

Eres un project manager senior de IM3. Genera tareas detalladas para cada fase siguiendo las reglas IM3 arriba.

Responde SOLO con un JSON array válido. Sin texto antes ni después. Sin bloques de código markdown.

Formato EXACTO (no agregues comentarios, explicaciones ni claves extra):
[
  {
    "phaseIndex": 0,
    "tasks": [
      { "title": "título de la tarea", "priority": "high|medium|low", "isMilestone": false, "clientFacingTitle": "título para el cliente (sin jerga técnica)" }
    ]
  }
]

Reglas estrictas:
- DEBES generar UN objeto por cada fase (phaseIndex 0 a ${insertedPhases.length - 1}, sin saltarte ninguno).
- 4-8 tareas por fase. NO menos de 4. Idealmente 6-8.
- La primera tarea de cada fase debe ser el kickoff/planeación
- La última tarea de cada fase debe ser un milestone (isMilestone: true) con la entrega principal
- Prioridades realistas: 2-3 high, resto medium/low
- clientFacingTitle debe ser comprensible para un empresario no técnico
- Tareas específicas al dominio descrito en el brief, NO genéricas. Usa nombres de archivos/módulos reales mencionados en las descripciones de fase cuando aplique.`;

      type PhaseTasksPayload = Array<{
        phaseIndex: number;
        tasks: Array<{ title: string; priority: string; isMilestone?: boolean; clientFacingTitle?: string }>;
      }>;

      const phaseTasks = await callSonnetWithRetry<PhaseTasksPayload>({
        client: anthropic,
        model: "claude-sonnet-4-6",
        maxTokens: 12000,
        baseSystem: tasksSystem,
        userMessage: `Genera tareas para este proyecto:\n\n${taskContext}`,
        parser: (text) => parseAIJson<PhaseTasksPayload>(text, "tasks-fresh"),
        validator: (p) => validatePhaseTasks(p, insertedPhases.length),
        label: "tasks-fresh",
        maxRetries: 2,
      });

      if (!phaseTasks || !Array.isArray(phaseTasks) || phaseTasks.length === 0) {
        throw new Error("AI returned empty or invalid tasks payload after retries");
      }
      log(`generateProjectArtifacts: Sonnet returned tasks for ${phaseTasks.length} phases (validated)`);

      const now = new Date();
      // skippedCount makes the silent-skip visible in Railway logs. If Sonnet
      // returns objects without phaseIndex, we used to discard them silently
      // and end with 0 real tasks; now it's loud.
      let skippedCount = 0;
      for (const pt of phaseTasks) {
        if (typeof pt.phaseIndex !== "number" || !Number.isInteger(pt.phaseIndex)) {
          skippedCount++;
          continue;
        }
        const phase = insertedPhases[pt.phaseIndex];
        if (!phase) {
          skippedCount++;
          continue;
        }
        if (!Array.isArray(pt.tasks) || pt.tasks.length === 0) {
          skippedCount++;
          continue;
        }
        const phaseIsCompleted = phase.phaseStatus === "completed";
        const phaseIsInProgress = phase.phaseStatus === "in_progress";

        // When a phase is partially done, mark the leading tasks as completed
        // proportional to its completionPercent. e.g. 50% in_progress with
        // 6 tasks → first 3 marked done, last 3 still pending.
        const percent = phase.spec.completionPercent ?? (phaseIsCompleted ? 100 : phaseIsInProgress ? 50 : 0);
        const tasksToComplete = phaseIsCompleted
          ? pt.tasks.length
          : phaseIsInProgress
            ? Math.min(pt.tasks.length, Math.floor((pt.tasks.length * percent) / 100))
            : 0;

        const phaseDays = Math.max(1, Math.round((phase.endDate.getTime() - phase.startDate.getTime()) / (24 * 60 * 60 * 1000)));

        for (let j = 0; j < pt.tasks.length; j++) {
          const t = pt.tasks[j];
          const taskDueDate = new Date(phase.startDate.getTime() + ((j + 1) / pt.tasks.length) * phaseDays * 24 * 60 * 60 * 1000);
          const taskIsDone = j < tasksToComplete;

          await database.insert(projectTasks).values({
            phaseId: phase.id,
            projectId,
            title: t.title,
            clientFacingTitle: t.clientFacingTitle || t.title,
            priority: t.priority || "medium",
            isMilestone: t.isMilestone || false,
            status: taskIsDone ? "completed" : "pending",
            dueDate: taskDueDate,
            completedAt: taskIsDone ? now : null,
          });
          totalTasks++;
        }
      }
      if (skippedCount > 0) {
        log(`generateProjectArtifacts: skipped ${skippedCount} task entries with bad/missing phaseIndex or empty tasks`);
      }
      // If we ended up with too few tasks per phase, the AI response was probably
      // truncated. Log a warning so it's diagnosable in production without grepping.
      if (totalTasks < insertedPhases.length * 2) {
        log(`generateProjectArtifacts: warning — only ${totalTasks} tasks for ${insertedPhases.length} phases (expected at least ${insertedPhases.length * 4})`);
      }
    } catch (err) {
      log(`AI task generation failed, creating basic tasks: ${err}`);
      const now = new Date();
      // Skeleton: kickoff → core → tests → demo. Useful even if AI fails entirely
      // — gives the user an editable structure rather than a single "Complete X"
      // bullet that has to be replaced manually.
      for (const phase of insertedPhases) {
        const phaseIsCompleted = phase.phaseStatus === "completed";
        const phaseIsInProgress = phase.phaseStatus === "in_progress";
        const percent = phase.spec.completionPercent ?? (phaseIsCompleted ? 100 : phaseIsInProgress ? 50 : 0);
        const phaseDays = Math.max(1, Math.round((phase.endDate.getTime() - phase.startDate.getTime()) / (24 * 60 * 60 * 1000)));
        const fallbackTasks: Array<{ title: string; priority: string; isMilestone: boolean }> = [
          { title: `Definir alcance y kickoff de ${phase.spec.name}`,                 priority: "high",   isMilestone: false },
          { title: `Implementar core de ${phase.spec.name}`,                           priority: "high",   isMilestone: false },
          { title: `Pruebas y validación de ${phase.spec.name}`,                       priority: "medium", isMilestone: false },
          { title: `Demo y entrega de ${phase.spec.name}`,                             priority: "high",   isMilestone: true  },
        ];
        const tasksToComplete = phaseIsCompleted
          ? fallbackTasks.length
          : phaseIsInProgress
            ? Math.min(fallbackTasks.length, Math.floor((fallbackTasks.length * percent) / 100))
            : 0;
        for (let j = 0; j < fallbackTasks.length; j++) {
          const t = fallbackTasks[j];
          const taskDueDate = new Date(phase.startDate.getTime() + ((j + 1) / fallbackTasks.length) * phaseDays * 24 * 60 * 60 * 1000);
          const taskIsDone = j < tasksToComplete;
          await database.insert(projectTasks).values({
            phaseId: phase.id,
            projectId,
            title: t.title,
            clientFacingTitle: t.title,
            priority: t.priority,
            isMilestone: t.isMilestone,
            status: taskIsDone ? "completed" : "pending",
            dueDate: taskDueDate,
            completedAt: taskIsDone ? now : null,
          });
          totalTasks++;
        }
      }
    }
  }

  // 4. Generate forward-looking ideas
  if (anthropic) {
    try {
      const ideasResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: "Genera 3 ideas de mejoras futuras para un proyecto de tecnología. JSON array: [{\"title\": \"...\", \"description\": \"...\", \"priority\": \"medium\"}]. Sin markdown.",
        messages: [{ role: "user", content: `Brief: ${brief.substring(0, 500)}` }],
      });
      const ideasText = ideasResponse.content?.[0]?.type === "text" ? ideasResponse.content[0].text : "";
      const ideas = parseAIJson<Array<{ title: string; description?: string; priority?: string }>>(ideasText, "ideas-fresh") || [];
      for (const idea of ideas) {
        await database.insert(projectIdeas).values({ projectId, ...idea, suggestedBy: "team", status: "suggested" });
      }
    } catch (err) { log(`Ideas generation failed (optional): ${err}`); }
  }

  log(`Project artifacts generated for ${projectId}: ${insertedPhases.length} fases, ${totalTasks} tareas, ${totalDeliverables} entregas`);

  return { phasesCreated: insertedPhases.length, tasksCreated: totalTasks, deliverablesCreated: totalDeliverables };
}

/**
 * Designs ONE additional phase with AI and appends it to an existing project,
 * preserving all current phases and tasks. Useful for mid-execution course corrections.
 */
export async function appendPhaseArtifact(
  projectId: string,
  brief: string,
  options: { repoContext?: string } = {},
): Promise<{ phaseId: string; tasksCreated: number; deliverablesCreated: number }> {
  const anthropic = getClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY no configurado");
  if (!db) throw new Error("Database not configured");
  const database = db;

  const trimmedBrief = brief.trim();
  if (trimmedBrief.length < 10) throw new Error("Brief demasiado corto");

  const [project] = await database.select().from(clientProjects).where(eq(clientProjects.id, projectId));
  if (!project) throw new Error("Proyecto no encontrado");

  const existingPhases = await database.select().from(projectPhases)
    .where(eq(projectPhases.projectId, projectId))
    .orderBy(asc(projectPhases.orderIndex));

  const lastPhase = existingPhases[existingPhases.length - 1];
  const nextOrderIndex = lastPhase ? lastPhase.orderIndex + 1 : 0;
  const minStart = lastPhase?.endDate ? new Date(lastPhase.endDate) : new Date();
  const phaseStart = minStart.getTime() < Date.now() ? new Date() : minStart;

  // 1. Design one phase
  const designContext = `
Brief de lo que sigue / del cambio:
${trimmedBrief}

${options.repoContext ? `Contexto del repositorio:\n${options.repoContext}\n` : ""}

Fases ya existentes en el proyecto:
${existingPhases.length === 0 ? "(ninguna todavía)" : existingPhases.map((p, i) => `${i + 1}. ${p.name} (${p.status})`).join("\n")}
`.trim();

  let phaseSpec: PhaseSpec = { name: "Nueva fase", weeks: 2, deliverables: [] };
  try {
    const designRes = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: `${IM3_PROJECT_CONTEXT}

---

Diseña UNA SOLA fase nueva para añadir al final del proyecto IM3, siguiendo las reglas IM3 arriba. NO repitas fases existentes. La fase debe ser concreta y aterrizar específicamente lo que pide el brief.

Responde SOLO con un JSON válido (un objeto, no un array), sin markdown:
{ "name": "Nombre de la fase", "weeks": 3, "deliverables": ["Entregable 1", "Entregable 2"] }`,
      messages: [{ role: "user", content: designContext }],
    });
    const designText = designRes.content?.[0]?.type === "text" ? designRes.content[0].text : "";
    const parsed = parseAIJson<{ name?: string; weeks?: number; deliverables?: string[] }>(designText, "design-phase-append");
    if (!parsed) throw new Error("AI returned invalid phase design");
    phaseSpec = {
      name: String(parsed.name || "Nueva fase").slice(0, 200),
      weeks: Math.max(1, Math.min(20, Number(parsed.weeks) || 2)),
      deliverables: Array.isArray(parsed.deliverables) ? parsed.deliverables.map(String).slice(0, 6) : [],
    };
  } catch (err) {
    log(`appendPhaseArtifact: design failed, using fallback: ${err}`);
  }

  // 2. Insert phase + deliverables
  const phaseEnd = new Date(phaseStart.getTime() + phaseSpec.weeks * 7 * 24 * 60 * 60 * 1000);

  const [phase] = await database.insert(projectPhases).values({
    projectId,
    name: phaseSpec.name,
    orderIndex: nextOrderIndex,
    status: "pending",
    startDate: phaseStart,
    endDate: phaseEnd,
    estimatedHours: Math.round(phaseSpec.weeks * 40),
  }).returning();

  let totalDeliverables = 0;
  if (phaseSpec.deliverables && phaseSpec.deliverables.length > 0) {
    for (const d of phaseSpec.deliverables) {
      await database.insert(projectDeliverables).values({
        projectId,
        phaseId: phase.id,
        title: d,
        type: d.toLowerCase().includes("diseño") || d.toLowerCase().includes("mockup") ? "design"
          : d.toLowerCase().includes("documento") || d.toLowerCase().includes("spec") ? "document"
          : "feature",
        status: "pending",
      });
      totalDeliverables++;
    }
  }

  // 3. Generate tasks for the new phase
  let totalTasks = 0;
  try {
    const taskRes = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: `${IM3_PROJECT_CONTEXT}

---

Genera 4-8 tareas detalladas para una fase específica de un proyecto IM3, siguiendo las reglas IM3 arriba.

Responde SOLO con un JSON array válido, sin markdown ni texto extra. Formato EXACTO:
[ { "title": "...", "priority": "high|medium|low", "isMilestone": false, "clientFacingTitle": "..." } ]

- Primera tarea: kickoff/planeación de la fase
- Última tarea: milestone (isMilestone: true) con la entrega principal
- Específicas al brief, NO genéricas`,
      messages: [{ role: "user", content: `Brief: ${trimmedBrief}\n\nFase: ${phaseSpec.name} (${phaseSpec.weeks} semanas)\nEntregables: ${phaseSpec.deliverables?.join(", ") || "—"}` }],
    });
    const taskText = taskRes.content?.[0]?.type === "text" ? taskRes.content[0].text : "";
    const tasks = parseAIJson<Array<{ title: string; priority: string; isMilestone?: boolean; clientFacingTitle?: string }>>(taskText, "tasks-append");
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      throw new Error("AI returned empty or invalid tasks payload (append)");
    }
    log(`appendPhaseArtifact: Sonnet returned ${tasks.length} tasks for new phase`);

    const phaseDays = Math.max(1, Math.round((phaseEnd.getTime() - phaseStart.getTime()) / (24 * 60 * 60 * 1000)));

    for (let j = 0; j < tasks.length; j++) {
      const t = tasks[j];
      const taskDueDate = new Date(phaseStart.getTime() + ((j + 1) / tasks.length) * phaseDays * 24 * 60 * 60 * 1000);
      await database.insert(projectTasks).values({
        phaseId: phase.id,
        projectId,
        title: t.title,
        clientFacingTitle: t.clientFacingTitle || t.title,
        priority: t.priority || "medium",
        isMilestone: t.isMilestone || false,
        status: "pending",
        dueDate: taskDueDate,
      });
      totalTasks++;
    }
  } catch (err) {
    log(`appendPhaseArtifact: task generation failed: ${err}`);
    await database.insert(projectTasks).values({
      phaseId: phase.id,
      projectId,
      title: `Completar ${phaseSpec.name}`,
      priority: "high",
      status: "pending",
      isMilestone: true,
      dueDate: phaseEnd,
    });
    totalTasks = 1;
  }

  // 4. Extend project's estimatedEndDate if needed
  const currentEnd = project.estimatedEndDate ? new Date(project.estimatedEndDate) : null;
  if (!currentEnd || phaseEnd.getTime() > currentEnd.getTime()) {
    await database.update(clientProjects)
      .set({ estimatedEndDate: phaseEnd, updatedAt: new Date() })
      .where(eq(clientProjects.id, projectId));
  }

  log(`appendPhaseArtifact: añadida fase "${phaseSpec.name}" a ${projectId} con ${totalTasks} tareas`);

  return { phaseId: phase.id, tasksCreated: totalTasks, deliverablesCreated: totalDeliverables };
}

/**
 * Generate a full project plan from a proposal using AI.
 * Thin wrapper: creates the project row, then delegates to generateProjectArtifacts.
 */
export async function generateProjectFromProposal(proposal: {
  id: string;
  contactId: string | null;
  title: string;
  sections: Record<string, string>;
  pricing: { total: number; currency: string; includes?: string[] } | null;
  timelineData: { phases: Array<{ name: string; weeks: number; deliverables?: string[] }>; totalWeeks?: number } | null;
}, startDate: Date = new Date()): Promise<{
  projectId: string;
  phasesCreated: number;
  tasksCreated: number;
  deliverablesCreated: number;
}> {
  if (!db) throw new Error("Database not configured");
  const database = db;

  const timeline = proposal.timelineData;
  const pricing = proposal.pricing;
  const sections = proposal.sections || {};

  const stripHtml = (html: string) => html?.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim() || "";
  const resumen = stripHtml(sections.resumen || "");
  const solucion = stripHtml(sections.solucion || "");
  const alcance = stripHtml(sections.alcance || "");

  const [project] = await database.insert(clientProjects).values({
    contactId: proposal.contactId,
    name: proposal.title.replace(/^Propuesta:?\s*/i, "").trim() || "Nuevo proyecto",
    description: resumen.substring(0, 500) || solucion.substring(0, 500) || "Proyecto generado desde propuesta",
    status: "planning",
    startDate,
    estimatedEndDate: timeline?.totalWeeks
      ? new Date(startDate.getTime() + (timeline.totalWeeks * 7 * 24 * 60 * 60 * 1000))
      : new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000),
    totalBudget: pricing?.total || 0,
    currency: pricing?.currency || "USD",
    healthStatus: "on_track",
    healthNote: "Proyecto recién creado — pendiente de activación.",
  }).returning();

  const brief = [
    `Propuesta: ${proposal.title}`,
    resumen && `Resumen: ${resumen}`,
    solucion && `Solución: ${solucion}`,
    alcance && `Alcance: ${alcance}`,
    pricing && `Presupuesto: ${pricing.total} ${pricing.currency || "USD"}`,
  ].filter(Boolean).join("\n");

  const artifacts = await generateProjectArtifacts(project.id, {
    brief,
    phasesHint: timeline?.phases,
    startDate,
    totalWeeksHint: timeline?.totalWeeks,
  });

  log(`Proyecto generado desde propuesta ${proposal.id}: ${project.id} — ${artifacts.phasesCreated} fases, ${artifacts.tasksCreated} tareas, ${artifacts.deliverablesCreated} entregas`);

  return { projectId: project.id, ...artifacts };
}
