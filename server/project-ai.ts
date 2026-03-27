import Anthropic from "@anthropic-ai/sdk";
import { log } from "./index";
import { db } from "./db";
import { clientProjects, projectPhases, projectTasks, projectDeliverables, projectActivityEntries, projectTimeLog, projectIdeas } from "@shared/schema";
import { eq, desc, gte, asc } from "drizzle-orm";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
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

  if (recentActivities.length === 0) return null;

  // Get tasks for progress context
  const allTasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId));
  const completedTasks = allTasks.filter(t => t.status === "completed").length;
  const progress = allTasks.length > 0 ? Math.round((completedTasks / allTasks.length) * 100) : 0;

  // Get hours this week
  const timeLogs = await db.select().from(projectTimeLog)
    .where(eq(projectTimeLog.projectId, projectId));
  const weeklyHours = timeLogs
    .filter(t => new Date(t.date) >= oneWeekAgo)
    .reduce((sum, t) => sum + parseFloat(String(t.hours)), 0);

  const activitySummary = recentActivities
    .map(a => `- [${a.category}] ${a.summaryLevel1}`)
    .join("\n");

  const prompt = `Genera un resumen semanal breve y profesional para el cliente del proyecto "${project.name}".

Progreso actual: ${progress}%
Horas invertidas esta semana: ${weeklyHours.toFixed(1)}h

Actividades de esta semana:
${activitySummary}

Escribe un resumen de 4-6 líneas en español latinoamericano, tono profesional pero cercano. Incluye:
1. Qué se logró esta semana (2-3 puntos principales)
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

/**
 * Generate a full project plan from a proposal using AI.
 * Uses proposal timeline, pricing, and scope to create phases, tasks, deliverables, and ideas.
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
  const anthropic = getClient();

  // Extract proposal data
  const timeline = proposal.timelineData;
  const pricing = proposal.pricing;
  const sections = proposal.sections || {};

  if (!db) throw new Error("Database not configured");
  const database = db; // TS narrowing

  // Strip HTML from sections for AI context
  const stripHtml = (html: string) => html?.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim() || "";
  const resumen = stripHtml(sections.resumen || "");
  const solucion = stripHtml(sections.solucion || "");
  const alcance = stripHtml(sections.alcance || "");

  // 1. Create project
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

  let totalTasks = 0;
  let totalDeliverables = 0;

  // 2. Create phases from timeline
  if (timeline?.phases && timeline.phases.length > 0) {
    let currentDate = new Date(startDate);

    for (let i = 0; i < timeline.phases.length; i++) {
      const p = timeline.phases[i];
      const phaseEndDate = new Date(currentDate.getTime() + (p.weeks * 7 * 24 * 60 * 60 * 1000));

      const [phase] = await database.insert(projectPhases).values({
        projectId: project.id,
        name: p.name,
        orderIndex: i,
        status: "pending",
        startDate: currentDate,
        endDate: phaseEndDate,
        estimatedHours: Math.round(p.weeks * 40), // ~40h per week
      }).returning();

      // Create deliverables from phase deliverables
      if (p.deliverables && p.deliverables.length > 0) {
        for (const d of p.deliverables) {
          await database.insert(projectDeliverables).values({
            projectId: project.id,
            phaseId: phase.id,
            title: d,
            type: d.toLowerCase().includes("diseño") || d.toLowerCase().includes("mockup") || d.toLowerCase().includes("figma") ? "design"
              : d.toLowerCase().includes("documento") || d.toLowerCase().includes("spec") ? "document"
              : "feature",
            status: "pending",
          });
          totalDeliverables++;
        }
      }

      currentDate = phaseEndDate;
    }
  }

  // 3. Use AI to generate detailed tasks if anthropic is available
  if (anthropic && timeline?.phases) {
    try {
      const context = `
Propuesta: ${proposal.title}
Resumen: ${resumen}
Solución: ${solucion}
Alcance: ${alcance}
Fases del timeline: ${timeline.phases.map((p, i) => `${i + 1}. ${p.name} (${p.weeks} semanas)`).join(", ")}
Presupuesto: ${pricing?.total || "N/A"} ${pricing?.currency || "USD"}
`.trim();

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        system: `Eres un project manager senior. Genera tareas detalladas para cada fase de un proyecto de desarrollo de software/tecnología.

Responde SOLO con un JSON array válido. Sin texto antes ni después. Sin bloques de código markdown.

Formato:
[
  {
    "phaseIndex": 0,
    "tasks": [
      { "title": "título de la tarea", "priority": "high|medium|low", "isMilestone": false, "clientFacingTitle": "título para el cliente (sin jerga técnica)" }
    ]
  }
]

Reglas:
- 4-8 tareas por fase
- La primera tarea de cada fase debe ser el kickoff/planeación
- La última tarea de cada fase debe ser un milestone (isMilestone: true) con la entrega principal
- Prioridades realistas: 2-3 high, resto medium/low
- clientFacingTitle debe ser comprensible para un empresario no técnico
- Tareas específicas al alcance descrito, NO genéricas`,
        messages: [{
          role: "user",
          content: `Genera tareas para este proyecto:\n\n${context}`,
        }],
      });

      const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "[]";
      const cleaned = text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
      const phaseTasks = JSON.parse(cleaned) as Array<{
        phaseIndex: number;
        tasks: Array<{ title: string; priority: string; isMilestone?: boolean; clientFacingTitle?: string }>;
      }>;

      // Get created phases
      const phases = await database.select().from(projectPhases)
        .where(eq(projectPhases.projectId, project.id))
        .orderBy(asc(projectPhases.orderIndex));

      for (const pt of phaseTasks) {
        const phase = phases[pt.phaseIndex];
        if (!phase) continue;

        const phaseStart = phase.startDate ? new Date(phase.startDate) : startDate;
        const phaseEnd = phase.endDate ? new Date(phase.endDate) : new Date(phaseStart.getTime() + 14 * 24 * 60 * 60 * 1000);
        const phaseDays = Math.max(1, Math.round((phaseEnd.getTime() - phaseStart.getTime()) / (24 * 60 * 60 * 1000)));

        for (let j = 0; j < pt.tasks.length; j++) {
          const t = pt.tasks[j];
          const taskDueDate = new Date(phaseStart.getTime() + ((j + 1) / pt.tasks.length) * phaseDays * 24 * 60 * 60 * 1000);

          await database.insert(projectTasks).values({
            phaseId: phase.id,
            projectId: project.id,
            title: t.title,
            clientFacingTitle: t.clientFacingTitle || t.title,
            priority: t.priority || "medium",
            isMilestone: t.isMilestone || false,
            status: "pending",
            dueDate: taskDueDate,
          });
          totalTasks++;
        }
      }
    } catch (err) {
      log(`AI task generation failed, creating basic tasks: ${err}`);
      // Fallback: create 1 basic task per phase
      const phases = await database.select().from(projectPhases)
        .where(eq(projectPhases.projectId, project.id))
        .orderBy(asc(projectPhases.orderIndex));

      for (const phase of phases) {
        await database.insert(projectTasks).values({
          phaseId: phase.id, projectId: project.id,
          title: `Completar ${phase.name}`, priority: "high", status: "pending", isMilestone: true,
          dueDate: phase.endDate,
        });
        totalTasks++;
      }
    }
  }

  // 4. Generate ideas for future phases
  if (anthropic) {
    try {
      const ideasResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: "Genera 3 ideas de mejoras futuras para un proyecto de tecnología. JSON array: [{\"title\": \"...\", \"description\": \"...\", \"priority\": \"medium\"}]. Sin markdown.",
        messages: [{ role: "user", content: `Proyecto: ${proposal.title}. Alcance: ${alcance.substring(0, 300)}` }],
      });
      const ideasText = ideasResponse.content?.[0]?.type === "text" ? ideasResponse.content[0].text.trim() : "[]";
      const ideas = JSON.parse(ideasText.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim());
      for (const idea of ideas) {
        await database.insert(projectIdeas).values({ projectId: project.id, ...idea, suggestedBy: "team", status: "suggested" });
      }
    } catch (err) { log(`Ideas generation failed (optional): ${err}`); }
  }

  log(`Proyecto generado desde propuesta: ${project.id} — ${timeline?.phases?.length || 0} fases, ${totalTasks} tareas, ${totalDeliverables} entregas`);

  return { projectId: project.id, phasesCreated: timeline?.phases?.length || 0, tasksCreated: totalTasks, deliverablesCreated: totalDeliverables };
}
