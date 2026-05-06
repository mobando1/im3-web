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

type PhaseSpec = { name: string; weeks: number; deliverables?: string[]; currentStatus?: "pending" | "in_progress" | "completed" };

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
      const designRes = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: `${IM3_PROJECT_CONTEXT}

---

Eres un project manager senior de IM3 Systems diseñando el plan de un proyecto. Sigue las reglas de IM3 arriba al pie de la letra.

Diseña entre 3 y 6 fases secuenciales. Cada fase debe tener un nombre concreto al dominio del cliente, una duración realista en semanas (2-4 típicamente), y 2-4 entregables verificables.${hasRepo ? `

IMPORTANTE: te di contexto real del repositorio del proyecto (README, docs, manifest, últimos commits). USALO para deducir qué partes ya están implementadas. Para CADA fase devuelve un campo "currentStatus":
- "completed" si el grueso del trabajo de esa fase ya está en el código (ej: ya hay infraestructura montada, autenticación funcionando, modelos de datos creados, etc.)
- "in_progress" si está parcialmente hecho
- "pending" si todavía no se aborda en el repo

Sé honesto: si el repo muestra que ya hay 50% del proyecto, marca las fases tempranas como completed. NO propongas como "pendientes" cosas que claramente ya existen.` : ""}

Responde SOLO con un JSON array válido, sin markdown ni texto extra. Formato:
[
  { "name": "Nombre de la fase", "weeks": 3, "deliverables": ["Entregable 1", "Entregable 2"]${hasRepo ? `, "currentStatus": "completed" | "in_progress" | "pending"` : ""} }
]`,
        messages: [{ role: "user", content: designPrompt }],
      });

      const designText = designRes.content?.[0]?.type === "text" ? designRes.content[0].text : "";
      const parsed = parseAIJson<PhaseSpec[]>(designText, "design-phases-fresh");
      if (!parsed || !Array.isArray(parsed) || parsed.length === 0) throw new Error("AI returned empty phases");
      phaseSpecs = parsed.map(p => {
        const cs = p.currentStatus;
        const validStatus = cs === "completed" || cs === "in_progress" || cs === "pending" ? cs : undefined;
        return {
          name: String(p.name || "Fase").slice(0, 200),
          weeks: Math.max(1, Math.min(20, Number(p.weeks) || 2)),
          deliverables: Array.isArray(p.deliverables) ? p.deliverables.map(String).slice(0, 6) : [],
          currentStatus: validStatus,
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

    const [phase] = await database.insert(projectPhases).values({
      projectId,
      name: p.name,
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
      const taskContext = `
Brief: ${brief}
${repoContext ? `\nContexto del repositorio:\n${repoContext}\n` : ""}
Fases: ${phaseSpecs.map((p, i) => `${i + 1}. ${p.name} (${p.weeks} semanas)`).join(", ")}
`.trim();

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 6000,
        system: `${IM3_PROJECT_CONTEXT}

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
- DEBES generar tareas para TODAS las fases (un objeto por phaseIndex empezando en 0)
- 4-8 tareas por fase. NO menos de 4.
- La primera tarea de cada fase debe ser el kickoff/planeación
- La última tarea de cada fase debe ser un milestone (isMilestone: true) con la entrega principal
- Prioridades realistas: 2-3 high, resto medium/low
- clientFacingTitle debe ser comprensible para un empresario no técnico
- Tareas específicas al brief, NO genéricas. Aplica los anti-patrones IM3.
- Si tienes contexto del repositorio, usa nombres de archivos/módulos reales en las tareas cuando aplique.`,
        messages: [{ role: "user", content: `Genera tareas para este proyecto:\n\n${taskContext}` }],
      });

      const text = response.content?.[0]?.type === "text" ? response.content[0].text : "";
      const phaseTasks = parseAIJson<Array<{
        phaseIndex: number;
        tasks: Array<{ title: string; priority: string; isMilestone?: boolean; clientFacingTitle?: string }>;
      }>>(text, "tasks-fresh");
      if (!phaseTasks || !Array.isArray(phaseTasks) || phaseTasks.length === 0) {
        throw new Error("AI returned empty or invalid tasks payload");
      }
      log(`generateProjectArtifacts: Sonnet returned tasks for ${phaseTasks.length} phases`);

      const now = new Date();
      for (const pt of phaseTasks) {
        const phase = insertedPhases[pt.phaseIndex];
        if (!phase) continue;
        const phaseIsCompleted = phase.phaseStatus === "completed";

        const phaseDays = Math.max(1, Math.round((phase.endDate.getTime() - phase.startDate.getTime()) / (24 * 60 * 60 * 1000)));

        for (let j = 0; j < pt.tasks.length; j++) {
          const t = pt.tasks[j];
          const taskDueDate = new Date(phase.startDate.getTime() + ((j + 1) / pt.tasks.length) * phaseDays * 24 * 60 * 60 * 1000);

          await database.insert(projectTasks).values({
            phaseId: phase.id,
            projectId,
            title: t.title,
            clientFacingTitle: t.clientFacingTitle || t.title,
            priority: t.priority || "medium",
            isMilestone: t.isMilestone || false,
            status: phaseIsCompleted ? "completed" : "pending",
            dueDate: taskDueDate,
            completedAt: phaseIsCompleted ? now : null,
          });
          totalTasks++;
        }
      }
    } catch (err) {
      log(`AI task generation failed, creating basic tasks: ${err}`);
      const now = new Date();
      for (const phase of insertedPhases) {
        const phaseIsCompleted = phase.phaseStatus === "completed";
        await database.insert(projectTasks).values({
          phaseId: phase.id,
          projectId,
          title: `Completar ${phase.spec.name}`,
          priority: "high",
          status: phaseIsCompleted ? "completed" : "pending",
          isMilestone: true,
          dueDate: phase.endDate,
          completedAt: phaseIsCompleted ? now : null,
        });
        totalTasks++;
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
