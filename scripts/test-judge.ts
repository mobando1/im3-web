/**
 * Test del juez semántico de fases y tareas.
 *
 * Ejecuta los mismos prompts que usa server/project-ai.ts pero standalone
 * (sin tocar DB, sin importar el bootstrap de Express). Corre 4 casos:
 *   1. judgePhaseDesign con plan BUENO    → esperamos APROBADO.
 *   2. judgePhaseDesign con plan MALO     → esperamos RECHAZADO.
 *   3. judgePhaseTasks con tareas BUENAS  → esperamos APROBADO.
 *   4. judgePhaseTasks con tareas MALAS   → esperamos RECHAZADO.
 *
 * Si los 4 matchean expectativa, el juez está calibrado. Si alguno falla,
 * imprime el veredicto completo para debuggear el prompt.
 *
 * Uso: ANTHROPIC_API_KEY=... npx tsx scripts/test-judge.ts
 */

import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";

// Carga .env manual
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[m[1]] = val;
    }
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ──────────────────────────────────────────────────────────────────────
// Tipos y helpers (copia inline de server/project-ai.ts para evitar
// importar el bootstrap del servidor)
// ──────────────────────────────────────────────────────────────────────

type JudgeIssueSeverity = "blocker" | "warning" | "nit";
type JudgeIssue = {
  severity: JudgeIssueSeverity;
  faseIndex: number | null;
  issue: string;
  fix: string;
};
type JudgeVerdict = {
  ok: boolean;
  score: number;
  issues: JudgeIssue[];
  summary: string;
};

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

function parseAIJson<T>(text: string): T | null {
  if (!text) return null;
  let cleaned = text.trim().replace(/^```(?:json|JSON)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned) as T; } catch {
    const match = cleaned.match(/\{[\s\S]*\}/) || cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]) as T; } catch { return null; }
    }
    return null;
  }
}

async function callJudge(opts: {
  systemPrompt: string;
  userMessage: string;
  label: string;
  maxTokens?: number;
}): Promise<JudgeVerdict | null> {
  const { systemPrompt, userMessage, label } = opts;
  const maxTokens = opts.maxTokens ?? 2500;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    const text = response.content?.[0]?.type === "text" ? response.content[0].text : "";
    const parsed = parseAIJson<JudgeVerdict>(text);
    if (!parsed || typeof parsed !== "object") {
      console.log(`[${label}] judge returned unparseable response (first 400ch): ${text.slice(0, 400)}`);
      return null;
    }
    const ok = parsed.ok === true || (parsed.ok as unknown) === "true";
    const score = typeof parsed.score === "number" ? Math.max(1, Math.min(10, Math.round(parsed.score))) : 5;
    const issues: JudgeIssue[] = Array.isArray(parsed.issues) ? parsed.issues
      .filter(i => i && typeof i === "object" && typeof i.issue === "string")
      .map(i => ({
        severity: (i.severity === "blocker" || i.severity === "warning" || i.severity === "nit") ? i.severity : "warning",
        faseIndex: typeof i.faseIndex === "number" && Number.isInteger(i.faseIndex) ? i.faseIndex : null,
        issue: String(i.issue).slice(0, 400),
        fix: typeof i.fix === "string" ? String(i.fix).slice(0, 400) : "",
      }))
      .slice(0, 20) : [];
    const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 300) : "(sin resumen)";
    const hasBlocker = issues.some(i => i.severity === "blocker");
    return { ok: ok && !hasBlocker, score, issues, summary };
  } catch (err) {
    console.log(`[${label}] judge call threw:`, err);
    return null;
  }
}

async function judgePhaseDesign(parsed: PhaseSpec[], brief: string, repoContext: string): Promise<JudgeVerdict | null> {
  const hasRepo = !!repoContext;
  const repoSummary = repoContext ? repoContext.slice(0, 3000) : "";
  const phasesJson = JSON.stringify(parsed.map((p, i) => ({
    index: i,
    name: p.name,
    weeks: p.weeks,
    description: p.description,
    keyOutcomes: p.keyOutcomes,
    deliverables: p.deliverables,
    currentStatus: p.currentStatus,
    completionPercent: p.completionPercent,
    evidence: p.evidence,
  })), null, 2);

  const systemPrompt = `Eres un project manager senior de IM3 Systems revisando un plan de fases recién generado por otro PM. Tu objetivo: detectar problemas que afectarían la entrega real del proyecto. NO eres pedante — solo marcas issues con impacto.

Revisa estos 7 aspectos del plan:

1. COBERTURA del brief — ¿cada cosa importante mencionada en el brief tiene una fase asignada? Si el brief habla de "WhatsApp + RAG + multi-tenant" y hay una fase para WhatsApp + una para multi-tenant pero RAG no aparece en ninguna fase, eso es un BLOCKER.

2. ORDEN lógico — ¿están en orden de ejecución correcto? "Deploy a producción" no puede venir antes de "Implementación core". "QA" no antes de algo que probar. Una violación clara de orden es WARNING (no blocker, se puede reordenar manual).

3. DUPLICACIÓN — ¿dos fases hablando del mismo tema con mínima diferencia? Marca como WARNING. Si la duplicación es severa (50%+ overlap), BLOCKER.

4. COHERENCIA INTERNA — ¿la description, los keyOutcomes y los deliverables de una fase hablan de la misma cosa? Si la description dice "implementar auth" pero los deliverables son sobre billing, BLOCKER.

5. ESPECIFICIDAD — ¿son específicas al dominio del cliente o son fases genéricas tipo "Fase 1: Discovery", "Fase 2: Implementación", "Fase 3: Testing" que aplican a cualquier proyecto? Genéricas = WARNING.

${hasRepo ? `6. CREDIBILIDAD de completionPercent — para fases marcadas con completionPercent > 0, ¿el evidence cita realmente algo del repo que justifique ese %? Si dice "100% completed" con evidence vago tipo "el repo tiene commits recientes", BLOCKER (el % es inventado). Si el evidence es preciso (cita archivos/funciones reales), OK.

` : ""}${hasRepo ? "7" : "6"}. DURACIÓN — ¿la suma de semanas es razonable para el alcance descrito? Un proyecto enorme en 4 semanas o uno pequeño en 30 semanas = WARNING.

Responde SOLO con JSON válido, sin markdown:
{
  "ok": boolean,
  "score": número 1-10,
  "issues": [
    {
      "severity": "blocker" | "warning" | "nit",
      "faseIndex": número 0-based o null si es global,
      "issue": "descripción concisa del problema (máx 140 chars)",
      "fix": "qué cambiar específicamente (máx 140 chars)"
    }
  ],
  "summary": "una frase con tu veredicto general"
}

Reglas duras:
- ok=true SOLO si NO hay blockers. Warnings y nits no bloquean.
- ok=false si hay 1+ blockers (cosas que romperían la entrega).
- Si el plan está bien, devuelve issues:[] y summary:"Plan sólido, listo para ejecutar."
- NO inventes problemas. Si no hay nada serio, dilo.`;

  const userMessage = `Brief original:
${brief.slice(0, 2000)}

${hasRepo ? `Contexto del repositorio (resumen):\n${repoSummary}\n\n` : ""}Plan de fases generado a revisar:
${phasesJson}`;

  return callJudge({ systemPrompt, userMessage, label: "judge-phases" });
}

async function judgePhaseTasks(
  parsed: Array<{ phaseIndex: number; tasks: Array<{ title: string; priority: string; isMilestone?: boolean; clientFacingTitle?: string }> }>,
  phaseSpecs: PhaseSpec[],
  brief: string,
): Promise<JudgeVerdict | null> {
  const phasesWithTasks = phaseSpecs.map((p, i) => {
    const pt = parsed.find(x => x.phaseIndex === i);
    return {
      faseIndex: i,
      faseName: p.name,
      faseDescription: p.description,
      keyOutcomes: p.keyOutcomes || [],
      tasks: pt?.tasks.map(t => ({
        title: t.title,
        priority: t.priority,
        isMilestone: !!t.isMilestone,
      })) || [],
    };
  });

  const systemPrompt = `Eres un project manager senior de IM3 Systems revisando las tareas asignadas a cada fase de un proyecto. Tu objetivo: detectar tareas genéricas, faltantes o mal balanceadas.

Revisa estos 5 aspectos de las tareas dentro de cada fase:

1. COBERTURA de keyOutcomes — los keyOutcomes de una fase son los logros prometidos. ¿Las tareas cubren cada keyOutcome? Si un keyOutcome dice "Webhook Meta verificado y enrutando mensajes" pero no hay tarea específica de webhook → BLOCKER en esa fase.

2. ESPECIFICIDAD — las tareas deben ser específicas al dominio. "Implementar lógica core", "Hacer testing", "Documentar todo" son GENÉRICAS = WARNING. Buenas: "Implementar webhook receiver Meta Cloud API en /api/whatsapp/webhook", "Configurar verificación HMAC de Meta".

3. KICKOFF + MILESTONE — la primera tarea debe ser kickoff/planeación de la fase. La última debe ser un milestone (entrega principal de la fase). Si falta cualquiera = WARNING.

4. DUPLICACIÓN — dos tareas dentro de la misma fase haciendo lo mismo = WARNING.

5. BALANCE — entre 4 y 8 tareas por fase. <4 muy poco, >10 demasiado granular. Salirse del rango = WARNING.

Responde SOLO con JSON válido, sin markdown:
{
  "ok": boolean,
  "score": número 1-10,
  "issues": [
    {
      "severity": "blocker" | "warning" | "nit",
      "faseIndex": número 0-based o null si es global,
      "issue": "descripción concisa (máx 140 chars)",
      "fix": "qué cambiar (máx 140 chars)"
    }
  ],
  "summary": "frase resumen"
}

Reglas:
- ok=true SOLO si NO hay blockers.
- Si todo está bien, issues:[] y summary positivo.
- NO inventes problemas.`;

  const userMessage = `Brief del proyecto:
${brief.slice(0, 1500)}

Fases con sus tareas generadas (en JSON):
${JSON.stringify(phasesWithTasks, null, 2)}`;

  return callJudge({ systemPrompt, userMessage, label: "judge-tasks" });
}

// ──────────────────────────────────────────────────────────────────────
// Casos de prueba
// ──────────────────────────────────────────────────────────────────────

const BRIEF = `Plataforma SaaS multi-tenant que conecta con WhatsApp Business API de Meta.
Cada cliente (organización) tiene sus propios bots con Knowledge Base alimentada
por documentos PDF/TXT (RAG con Claude). Los bots responden mensajes entrantes,
soportan transcripción de audios y pueden devolver respuestas de voz con
ElevenLabs. Hay panel admin (super-admin IM3) y panel cliente (self-service).
Stack: Next.js + Supabase + pgvector + Vercel. 2 clientes piloto en go-live.`;

const REPO_CONTEXT = `Repositorio: mobando1/whatsapp-ai-saas
Lenguaje principal: TypeScript
Último push: 2026-03-24

## Estructura del repositorio (resumen)
### app/api/
- app/api/auth/[...nextauth]/route.ts
- app/api/whatsapp/webhook/route.ts
- app/api/knowledge/upload/route.ts

### server/
- server/middleware.ts
- server/actions/auth.ts
- server/actions/clients.ts
- server/actions/bot-config.ts

## Schema (drizzle/schema.ts)
organizations, users, bots, phone_numbers, knowledge_chunks (pgvector)

## Últimos 30 commits
- 2026-03-24 — full MVP redesign
- 2026-03-23 — image/audio sending + ElevenLabs TTS
- 2026-03-22 — audio transcription
- 2026-03-16 — debounce fragmented messages
- 2026-03-16 — RAG for WhatsApp AI bots
- 2026-03-15 — KB per-client/per-bot
- 2026-03-09 — auth funcionando con Supabase
`;

const GOOD_PHASES: PhaseSpec[] = [
  {
    name: "Fase 1: Base SaaS — Auth, Multi-tenant y Dashboard",
    weeks: 3,
    description: "Establece la infraestructura base de la plataforma: autenticación con NextAuth, schema multi-tenant en Supabase con RLS por organización, y el dashboard inicial con role-gate (admin IM3 vs cliente). Esta fase es el cimiento del proyecto.",
    keyOutcomes: ["Schema multi-tenant con RLS por organización validado", "Auth con NextAuth + middleware de role-gate operando", "Dashboard base navegable con vista admin vs cliente"],
    deliverables: ["Auth funcionando", "Schema multi-tenant en producción", "Dashboard base"],
    currentStatus: "completed", completionPercent: 100,
    evidence: "middleware.ts, app/api/auth, drizzle/schema con organizations+users+bots. Commit 'auth funcionando' del 2026-03-09",
  },
  {
    name: "Fase 2: Núcleo WhatsApp — Webhook Meta y Bot con IA",
    weeks: 4,
    description: "Conecta el webhook de Meta WhatsApp Business Cloud API, implementa el orchestrator del bot con Claude, y agrega transcripción de audios + respuestas de voz con ElevenLabs. Es el motor de comunicación del sistema.",
    keyOutcomes: ["Webhook Meta verificado y enrutando mensajes al bot correcto por phone_number", "Bot orchestrator respondiendo en <3s con Claude", "Audios entrantes transcritos con Whisper y respuestas de voz salientes con ElevenLabs"],
    deliverables: ["Webhook Meta operativo", "Bot orchestrator con Claude", "Pipeline de audio bidireccional"],
    currentStatus: "completed", completionPercent: 100,
    evidence: "app/api/whatsapp/webhook/route.ts existe, commits 'audio transcription' y 'ElevenLabs TTS' del 22-23 marzo",
  },
  {
    name: "Fase 3: Knowledge Base con RAG por cliente y bot",
    weeks: 4,
    description: "Cada bot tiene su propia base de conocimiento alimentada por documentos. Implementa pipeline de upload, chunking, embeddings con pgvector y retrieval contextual al responder mensajes. Permite que cada cliente personalice las respuestas con sus documentos.",
    keyOutcomes: ["Upload de PDF/TXT con chunking y embeddings en pgvector", "Retrieval semántico por bot al responder mensajes", "UI de gestión de KB en el panel cliente"],
    deliverables: ["Pipeline RAG funcional", "UI de KB", "Aislamiento por bot validado"],
    currentStatus: "in_progress", completionPercent: 60,
    evidence: "knowledge/process y endpoints de upload existen, commit 'RAG for WhatsApp AI bots' del 16 marzo. Falta UI de gestión.",
  },
  {
    name: "Fase 4: Configurador de bots self-service",
    weeks: 3,
    description: "Panel donde el cliente (no IM3) configura sus propios bots: nombre, prompt de sistema, voz, KB asignada. Quita carga operativa de IM3 y permite escalar a más clientes sin cuello de botella humano.",
    keyOutcomes: ["Panel /dashboard/bots con CRUD de bots", "Configuración de voz ElevenLabs por bot con preview", "Asignación de Knowledge Base existente al bot"],
    deliverables: ["Panel self-service en producción", "Onboarding de cliente piloto sin tocar código"],
    currentStatus: "pending", completionPercent: 0,
  },
  {
    name: "Fase 5: Super Admin IM3 + Métricas",
    weeks: 2,
    description: "Panel /admin con vista global: lista de organizaciones, métricas por bot (mensajes, tokens, errores), impersonación para soporte. Permite que IM3 monitoree y opere todos los clientes desde un solo lugar.",
    keyOutcomes: ["Panel /admin/organizations con métricas en tiempo real", "Impersonación para soporte sin compartir credenciales", "Alertas de errores 5xx por organización"],
    deliverables: ["Panel super-admin", "Dashboard de métricas con recharts"],
    currentStatus: "pending", completionPercent: 0,
  },
  {
    name: "Fase 6: QA, hardening y go-live con 2 clientes piloto",
    weeks: 2,
    description: "Pruebas E2E del flujo completo, hardening de seguridad (firma HMAC del webhook, RLS validado, secrets rotados), y go-live con 2 clientes piloto. Cierra el proyecto con casos reales en producción.",
    keyOutcomes: ["Suite E2E cubriendo el flujo mensaje→RAG→respuesta", "Auditoría de seguridad firmada (HMAC, RLS, rate-limits)", "2 clientes piloto onboardeados con bots activos"],
    deliverables: ["Reporte de QA", "Checklist de Go-Live firmado", "2 clientes piloto en producción"],
    currentStatus: "pending", completionPercent: 0,
  },
];

const BAD_PHASES: PhaseSpec[] = [
  {
    name: "Fase 1: Discovery",
    weeks: 2,
    description: "Definir requerimientos y arquitectura.",
    keyOutcomes: ["Documento de arquitectura", "Plan aprobado"],
    deliverables: ["Documento", "Plan"],
    currentStatus: "pending", completionPercent: 0,
  },
  {
    name: "Fase 2: Implementación core",
    weeks: 4,
    description: "Implementar el core del sistema con todas las funcionalidades necesarias para el cliente.",
    keyOutcomes: ["Backend listo", "Frontend listo", "API documentada"],
    deliverables: ["Backend", "Frontend", "Docs"],
    currentStatus: "completed", completionPercent: 100,
    evidence: "Hay commits recientes en el repo",
  },
  {
    name: "Fase 3: Implementación de funcionalidades",
    weeks: 4,
    description: "Continuar implementando features del backend y frontend, con tests unitarios.",
    keyOutcomes: ["Más features", "Tests"],
    deliverables: ["Features"],
    currentStatus: "in_progress", completionPercent: 50,
    evidence: "El repo tiene cosas",
  },
  {
    name: "Fase 4: Deploy a producción",
    weeks: 1,
    description: "Subir a producción.",
    keyOutcomes: ["Sistema en vivo"],
    deliverables: ["Sistema"],
    currentStatus: "pending", completionPercent: 0,
  },
  {
    name: "Fase 5: QA y testing",
    weeks: 2,
    description: "Pruebas y validación.",
    keyOutcomes: ["Tests pasan"],
    deliverables: ["Reporte de tests"],
    currentStatus: "pending", completionPercent: 0,
  },
];

const GOOD_TASKS = [
  {
    phaseIndex: 0,
    tasks: [
      { title: "Kickoff técnico Fase 1: validar stack Next.js + Supabase + drizzle", priority: "high", isMilestone: false, clientFacingTitle: "Reunión de arranque y validación de stack" },
      { title: "Configurar NextAuth con provider email/password y sesiones JWT", priority: "high", isMilestone: false, clientFacingTitle: "Sistema de login con email" },
      { title: "Implementar schema multi-tenant: tablas organizations, users, role enum, FK", priority: "high", isMilestone: false, clientFacingTitle: "Estructura de cuentas separadas por cliente" },
      { title: "Configurar RLS policies en Supabase para aislamiento por organization_id", priority: "high", isMilestone: false, clientFacingTitle: "Seguridad: cada cliente solo ve sus datos" },
      { title: "Construir middleware.ts con role-gate (admin IM3 vs cliente)", priority: "medium", isMilestone: false, clientFacingTitle: "Permisos diferenciados según tipo de usuario" },
      { title: "Construir layout y rutas base del dashboard (vista admin IM3 + vista cliente)", priority: "high", isMilestone: false, clientFacingTitle: "Panel base con menú según tipo de usuario" },
      { title: "Demo: dos cuentas distintas iniciando sesión, RLS validado en queries", priority: "high", isMilestone: true, clientFacingTitle: "Demo: dos clientes con datos completamente separados" },
    ],
  },
];

const BAD_TASKS = [
  {
    phaseIndex: 0,
    tasks: [
      { title: "Hacer auth", priority: "high", isMilestone: false, clientFacingTitle: "Autenticación" },
      { title: "Implementar core", priority: "high", isMilestone: false, clientFacingTitle: "Implementación" },
      { title: "Documentar todo", priority: "low", isMilestone: false, clientFacingTitle: "Documentación" },
    ],
  },
];

const PHASE_SPECS_FOR_TASKS = GOOD_PHASES.slice(0, 1);

// ──────────────────────────────────────────────────────────────────────
// Presentación
// ──────────────────────────────────────────────────────────────────────
const RESET = "\x1b[0m", BOLD = "\x1b[1m", GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", DIM = "\x1b[2m";

function printVerdict(label: string, verdict: JudgeVerdict | null, expected: "approve" | "reject"): boolean {
  console.log(`\n${BOLD}${CYAN}━━━ ${label} ━━━${RESET}`);
  if (!verdict) {
    console.log(`${YELLOW}Juez devolvió null (treated as approved).${RESET}`);
    return expected === "approve";
  }
  const okStr = verdict.ok ? `${GREEN}APROBADO${RESET}` : `${RED}RECHAZADO${RESET}`;
  console.log(`Veredicto: ${okStr}  ${DIM}(score ${verdict.score}/10, ${verdict.issues.length} issues)${RESET}`);
  console.log(`${BOLD}Resumen:${RESET} ${verdict.summary}`);
  if (verdict.issues.length > 0) {
    console.log(`\n${BOLD}Issues:${RESET}`);
    for (const issue of verdict.issues) {
      const sev = issue.severity === "blocker" ? `${RED}BLOCKER${RESET}` :
                  issue.severity === "warning" ? `${YELLOW}WARNING${RESET}` :
                  `${DIM}NIT${RESET}`;
      const where = issue.faseIndex !== null ? ` [fase ${issue.faseIndex + 1}]` : " [global]";
      console.log(`  • ${sev}${where}: ${issue.issue}`);
      if (issue.fix) console.log(`    ${DIM}→ fix: ${issue.fix}${RESET}`);
    }
  }
  const matches = expected === "approve" ? verdict.ok : !verdict.ok;
  console.log(`\n${BOLD}Expectativa:${RESET} ${expected}. ${matches ? `${GREEN}✓ MATCH${RESET}` : `${RED}✗ MISMATCH${RESET}`}`);
  return matches;
}

async function main() {
  console.log(`${BOLD}Probando juez semántico de fases y tareas...${RESET}\n`);

  let allPassed = true;

  console.log(`${DIM}1/4 — judgePhaseDesign con plan BUENO (esperamos APROBADO)${RESET}`);
  const v1 = await judgePhaseDesign(GOOD_PHASES, BRIEF, REPO_CONTEXT);
  allPassed = printVerdict("Plan BUENO de fases", v1, "approve") && allPassed;

  console.log(`\n${DIM}2/4 — judgePhaseDesign con plan MALO (esperamos RECHAZADO)${RESET}`);
  const v2 = await judgePhaseDesign(BAD_PHASES, BRIEF, REPO_CONTEXT);
  allPassed = printVerdict("Plan MALO de fases", v2, "reject") && allPassed;

  console.log(`\n${DIM}3/4 — judgePhaseTasks con tareas BUENAS (esperamos APROBADO)${RESET}`);
  const v3 = await judgePhaseTasks(GOOD_TASKS, PHASE_SPECS_FOR_TASKS, BRIEF);
  allPassed = printVerdict("Tareas BUENAS", v3, "approve") && allPassed;

  console.log(`\n${DIM}4/4 — judgePhaseTasks con tareas MALAS (esperamos RECHAZADO)${RESET}`);
  const v4 = await judgePhaseTasks(BAD_TASKS, PHASE_SPECS_FOR_TASKS, BRIEF);
  allPassed = printVerdict("Tareas MALAS", v4, "reject") && allPassed;

  console.log(`\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  if (allPassed) {
    console.log(`${GREEN}${BOLD}✓ Todos los casos del juez se comportaron como esperado.${RESET}\n`);
  } else {
    console.log(`${RED}${BOLD}✗ Algún caso falló — revisar el prompt del juez.${RESET}\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`${RED}Error:${RESET}`, err);
  process.exit(1);
});
