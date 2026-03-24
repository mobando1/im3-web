import Anthropic from "@anthropic-ai/sdk";
import { log } from "./index";
import { db } from "./db";
import { clientProjects, projectPhases, projectTasks, projectActivityEntries, projectTimeLog } from "@shared/schema";
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
