import {
  processEmailQueue,
  processAbandonedEmails,
  processWhatsAppQueue,
  updateContactSubstatuses,
  checkOverdueTasks,
  processPostMeetingRecordings,
  sendAdminDailyBriefing,
  autoAnalyzeProjectCommits,
  sendWeeklyProjectSummaries,
  generateAndSendDailyNewsletter,
  syncGmailEmails,
  purgeOldDeletedProposals,
} from "../email-scheduler";
import { runErrorSupervisor } from "./error-supervisor";
import { runMeetingPrep } from "./meeting-prep";
import { runFollowupWriter } from "./followup-writer";
import { runCostReferenceFreshness } from "./cost-reference-freshness";
import { runAnalyticsSync } from "./analytics-sync";
import { runAnalyticsMonthlyReport } from "./analytics-monthly-report";
import { runOrgPreferencesExtractor } from "../org-preferences";
import { runContactDriveSyncCron } from "../drive-file-sync";

export type AgentKind = "ai" | "automation" | "integration" | "webhook";

export type AgentTrigger = "cron" | "webhook" | "manual";

export type AgentCriticality = "critical" | "normal" | "low";

export type AgentConnectionType = "db" | "api" | "llm" | "internal" | "webhook";

export type AgentConnection = {
  type: AgentConnectionType;
  label: string;
  detail?: string;
};

export type AgentDefinition = {
  name: string;
  displayName: string;
  kind: AgentKind;
  description: string;
  trigger: AgentTrigger;
  schedule?: string;
  scheduleHuman?: string;
  criticality: AgentCriticality;
  runnable?: () => Promise<unknown>;
  longDescription?: string;
  connections?: AgentConnection[];
  sourceFile?: string;
};

export const AGENT_KINDS: Record<AgentKind, { label: string; description: string }> = {
  ai: {
    label: "Agentes IA",
    description: "Razonan, generan o clasifican usando Claude",
  },
  automation: {
    label: "Automatizaciones",
    description: "Cron jobs y reglas deterministas que mantienen el sistema vivo",
  },
  integration: {
    label: "Integraciones",
    description: "Sincronización con sistemas externos (Gmail, Drive, GA4, Meet)",
  },
  webhook: {
    label: "Webhooks",
    description: "Receptores de eventos externos (Resend, Meta, GitHub)",
  },
};

export const AGENT_REGISTRY: AgentDefinition[] = [
  // ─── Agentes IA ──────────────────────────────────────────────
  {
    name: "proposal-ai",
    displayName: "Generador de Propuestas",
    kind: "ai",
    description: "Genera propuestas comerciales completas con Claude",
    trigger: "manual",
    criticality: "normal",
    longDescription:
      "Genera propuestas comerciales completas en formato estructurado con 8 secciones (hero, resumen, problema, solución, tecnología, timeline, ROI, precios). Recopila contexto del contacto (diagnóstico, emails, notas, documentos Drive) y aplica validación de calidad con Claude Haiku para coherencia de costos y matemáticas cross-section.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Genera propuesta completa estructurada (max 10000 tokens)" },
      { type: "llm", label: "Claude Haiku 4.5", detail: "Validación de costos operativos y coherencia ROI/pricing" },
      { type: "db", label: "contacts", detail: "Lee nombre, empresa, email, leadScore" },
      { type: "db", label: "diagnostics", detail: "Industria, empleados, presupuesto, objetivos, herramientas" },
      { type: "db", label: "contactNotes", detail: "Notas de reuniones (últimas 10)" },
      { type: "db", label: "gmailEmails", detail: "Historial Gmail del contacto (últimos 15)" },
      { type: "db", label: "contactFiles", detail: "Documentos subidos del cliente" },
      { type: "db", label: "aiInsightsCache", detail: "Mini-auditoría previa cacheada" },
      { type: "api", label: "Google Drive", detail: "Auto-sync de contenido de documentos del cliente" },
      { type: "internal", label: "shared/proposal-cost-reference.md", detail: "Precios de servicios para fees" },
      { type: "internal", label: "shared/proposal-voice-guide.md", detail: "Tono y reglas de redacción" },
      { type: "internal", label: "shared/proposal-case-studies.md", detail: "Casos de éxito autorizados" },
    ],
    sourceFile: "server/proposal-ai.ts:167",
  },
  {
    name: "proposal-section-regen",
    displayName: "Reescritor de Sección de Propuesta",
    kind: "ai",
    description: "Reescribe una sección de propuesta con instrucción del admin (~3-5s)",
    trigger: "manual",
    criticality: "normal",
    longDescription:
      "Regenera una sola sección de una propuesta existente según instrucción del admin (ej: reescribir hero, cambiar tono de precios). Mantiene exactamente la misma forma JSON y valida coherencia con las otras secciones del contexto.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Reescribe sección manteniendo estructura JSON exacta" },
      { type: "db", label: "proposals", detail: "Lee propuesta y guarda nueva versión de la sección" },
      { type: "db", label: "contacts", detail: "Contexto del cliente para personalización" },
      { type: "db", label: "diagnostics", detail: "Datos del cliente para tono apropiado" },
    ],
    sourceFile: "server/proposal-ai.ts:631",
  },
  {
    name: "proposal-chat",
    displayName: "Asistente Conversacional de Propuestas",
    kind: "ai",
    description: "Refina propuestas conversacionalmente con Claude Sonnet 4 + tool use para editar secciones",
    trigger: "manual",
    criticality: "normal",
    longDescription:
      "Asistente conversacional para refinar propuestas iterativamente. El admin chatea con Claude, quien lee/modifica secciones del brief con herramientas (view_brief, update_module, add_faq). Mantiene historial conversacional y sincroniza cambios a DB con snapshots versionados.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Conversación con tool use para editar módulos del brief" },
      { type: "db", label: "proposalBriefs", detail: "Contenedor del brief de propuesta" },
      { type: "db", label: "proposalBriefChatMessages", detail: "Historial conversacional (últimos 30 mensajes)" },
      { type: "db", label: "proposalBriefSnapshots", detail: "Versiones snapshot del brief" },
      { type: "db", label: "contacts", detail: "Contexto contacto para personalización" },
      { type: "api", label: "Google Drive", detail: "Lectura recursiva de archivos del cliente" },
    ],
    sourceFile: "server/proposal-brief-chat.ts:1",
  },
  {
    name: "project-ai-analyzer",
    displayName: "Analizador de Proyectos",
    kind: "ai",
    description: "Traduce commits técnicos a actividad para clientes",
    trigger: "manual",
    criticality: "normal",
    longDescription:
      "Traduce commits técnicos de GitHub a actividad legible para clientes (sin jerga). Analiza batch de commits, genera 3 niveles de resumen (1 línea, párrafo, detallado), categoriza (feature/bugfix/improvement) y detecta si es hito significativo. Crea entradas de project_activity_entries.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Traduce commits técnicos a actividad cliente" },
      { type: "db", label: "client_projects", detail: "Proyecto, nombre, descripción" },
      { type: "db", label: "project_phases", detail: "Fases del proyecto (contexto para mapeo)" },
      { type: "db", label: "project_tasks", detail: "Tareas (para mapeo de suggestedTaskTitle)" },
      { type: "db", label: "project_activity_entries", detail: "Guarda summaryLevel1/2/3, categoría, isSignificant" },
      { type: "api", label: "GitHub API", detail: "Fetch últimos 10 commits del repo" },
    ],
    sourceFile: "server/project-ai.ts:38",
  },
  {
    name: "blog-ai",
    displayName: "Generador de Blog",
    kind: "ai",
    description: "Crea y mejora artículos de blog con Claude",
    trigger: "manual",
    criticality: "low",
    longDescription:
      "Crea artículos de blog desde un prompt: genera título, excerpt, contenido HTML completo (800+ palabras), meta tags SEO, tags y referencias. Usa system prompt especializado en contenido tech.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Genera artículo completo con metadata SEO" },
    ],
    sourceFile: "server/blog-ai.ts:33",
  },
  {
    name: "blog-generator",
    displayName: "Generador de Blog",
    kind: "ai",
    description: "Crea artículos nuevos desde un prompt/idea",
    trigger: "manual",
    criticality: "low",
    longDescription:
      "Variante de blog-ai disparada desde la UI del editor. Devuelve JSON con title, excerpt, content (HTML), metaTitle, metaDescription, tags, references — todo listo para publicar.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Genera blog completo con SEO" },
    ],
    sourceFile: "server/blog-ai.ts:33",
  },
  {
    name: "blog-improver",
    displayName: "Mejorador de Blog",
    kind: "ai",
    description: "Mejora contenido existente según instrucciones",
    trigger: "manual",
    criticality: "low",
    longDescription:
      "Mejora artículos de blog existentes según instrucción del admin (ampliar sección, cambiar tono, agregar casos). Devuelve HTML mejorado manteniendo estructura.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Mejora contenido HTML según instrucción" },
    ],
    sourceFile: "server/blog-ai.ts:93",
  },
  {
    name: "contact-insight",
    displayName: "Insight de Contacto",
    kind: "ai",
    description: "Mini-auditoría de 3 insights por contacto (cache 7 días)",
    trigger: "manual",
    criticality: "normal",
    longDescription:
      "Genera análisis de inteligencia comercial por contacto: resumen, próximas acciones, talking points, nivel de riesgo y valor estimado. Basado en engagement de emails, notas internas y perfil. Resultado cacheado 7 días para no regenerar en cada visita.",
    connections: [
      { type: "llm", label: "Claude Haiku 4.5", detail: "Análisis de riesgo/valor (temperatura 0.2)" },
      { type: "db", label: "contacts", detail: "Nombre, empresa, leadScore, status, substatus" },
      { type: "db", label: "diagnostics", detail: "Industria, empleados, presupuesto, objetivos" },
      { type: "db", label: "sent_emails", detail: "Engagement stats (sent/opened/clicked/bounced)" },
      { type: "db", label: "contact_notes", detail: "Notas internas (últimas 5)" },
      { type: "db", label: "ai_insights_cache", detail: "Cachea resultado 7 días" },
    ],
    sourceFile: "server/email-ai.ts:523",
  },
  {
    name: "mini-audit",
    displayName: "Mini-Auditoría Post-Diagnóstico",
    kind: "ai",
    description: "Genera observaciones iniciales después del formulario",
    trigger: "webhook",
    criticality: "normal",
    longDescription:
      "Genera 3 observaciones iniciales tras completarse el formulario de diagnóstico. Cada insight: título (3-5 palabras), descripción consultiva (sugiere explorar, no promete), y estadística de fuente verificada (McKinsey, Gartner). Recopila contexto (Drive, notas, Gmail, casos de industria). Tono: consultor humano, no IA.",
    connections: [
      { type: "llm", label: "Claude Haiku 4.5", detail: "Genera 3 insights (temperatura 0.3)" },
      { type: "db", label: "diagnostics", detail: "Datos completos del diagnóstico" },
      { type: "db", label: "contact_files", detail: "Documentos del cliente (auto-sync Drive)" },
      { type: "db", label: "contact_notes", detail: "Notas de reuniones" },
      { type: "db", label: "gmail_emails", detail: "Historial Gmail (últimos 15)" },
      { type: "api", label: "Google Drive", detail: "Lee contenido de documentos del cliente" },
    ],
    sourceFile: "server/email-ai.ts:919",
  },
  {
    name: "whatsapp-intent",
    displayName: "Clasificador de Intención WhatsApp",
    kind: "ai",
    description: "Clasifica mensajes entrantes y auto-responde con templates",
    trigger: "webhook",
    criticality: "normal",
    longDescription:
      "Clasifica intención de mensajes WhatsApp entrantes (question/reschedule/interest/rejection/other) con score de confianza. Si es pregunta, genera auto-respuesta contextual con datos del diagnóstico. Notifica al admin con el mensaje clasificado. Disparado por whatsapp-webhook.",
    connections: [
      { type: "llm", label: "Claude Haiku 4.5", detail: "Clasificación intent (temperatura 0)" },
      { type: "llm", label: "Claude Haiku 4.5", detail: "Genera auto-respuesta WhatsApp (300 tokens)" },
      { type: "db", label: "contacts", detail: "Nombre, empresa, status para contexto" },
      { type: "db", label: "diagnostics", detail: "Industria/objetivos para personalización" },
      { type: "db", label: "notifications", detail: "Crea notificación con mensaje clasificado" },
      { type: "api", label: "Meta WhatsApp Cloud API", detail: "Recibe mensaje, envía respuesta" },
    ],
    sourceFile: "server/email-ai.ts:1193",
  },
  {
    name: "email-classifier",
    displayName: "Clasificador de Emails",
    kind: "ai",
    description: "Valida relevancia de emails sincronizados con Claude Haiku. Auto-desvincula irrelevantes y notifica",
    trigger: "cron",
    schedule: "*/15 * * * *",
    scheduleHuman: "cada 15 min (integrado en Gmail sync)",
    criticality: "normal",
    longDescription:
      "Valida relevancia de emails sincronizados desde Gmail (solo para matches por dominio, no email directo). Si Claude clasifica como irrelevante, auto-desvincula (contactId=null) y notifica al admin. Integrado dentro del ciclo de gmail-sync cada 15 min.",
    connections: [
      { type: "llm", label: "Claude Haiku 4.5", detail: "Clasificación relevancia (temperatura 0, 200 tokens)" },
      { type: "db", label: "gmail_emails", detail: "Lee email, set contactId=null si irrelevante" },
      { type: "db", label: "contacts", detail: "Contexto (nombre, empresa, email)" },
      { type: "db", label: "notifications", detail: "Notifica si email desvinculado" },
    ],
    sourceFile: "server/agents/email-classifier.ts:24",
  },
  {
    name: "error-supervisor",
    displayName: "Supervisor de Errores",
    kind: "ai",
    description: "Analiza errores con Claude, reintenta transientes y alerta sobre fallos críticos",
    trigger: "cron",
    schedule: "*/30 * * * *",
    scheduleHuman: "cada 30 minutos",
    criticality: "critical",
    runnable: runErrorSupervisor,
    longDescription:
      "Monitorea errores de los demás agentes (últimos 60 min) y los clasifica con Claude: transient (reintenta), bug/config (alerta), dead_record (ignora). Si es transient intenta reintento automático; si no, escala al admin con email + notificación. Marca cada run como supervisorAnalyzedAt para no re-analizar.",
    connections: [
      { type: "llm", label: "Claude Haiku 4.5", detail: "Clasificación error (temperatura 0.1, 500 tokens)" },
      { type: "db", label: "agent_runs", detail: "Lee errores sin supervisorAnalyzedAt; actualiza metadata" },
      { type: "db", label: "notifications", detail: "Crea notificación si severity=high o action=alert" },
      { type: "api", label: "Resend", detail: "Email de alerta al admin" },
      { type: "internal", label: "AGENT_REGISTRY", detail: "Busca agente y reintenta runnable() si transient" },
    ],
    sourceFile: "server/agents/error-supervisor.ts:28",
  },
  {
    name: "meeting-prep",
    displayName: "Preparador de Reuniones",
    kind: "ai",
    description: "Genera brief con talking points y objeciones 2-3h antes de cada reunión",
    trigger: "cron",
    schedule: "*/30 * * * *",
    scheduleHuman: "cada 30 minutos",
    criticality: "normal",
    runnable: runMeetingPrep,
    longDescription:
      "Genera brief 2-3 horas antes de cada reunión scheduled: resumen del contacto (quién/qué busca), propósito de la meeting, 3 talking points concretos, objeciones probables + respuestas, y 5 preguntas clave. Recopila contexto (contacto, diagnóstico, emails recientes, notas). Envía email al admin.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Genera brief completo (1500 tokens, temperatura 0.3)" },
      { type: "db", label: "appointments", detail: "Lee scheduled sin prepSentAt; marca flag" },
      { type: "db", label: "contacts", detail: "Nombre, empresa, leadScore, status" },
      { type: "db", label: "diagnostics", detail: "Industria, empleados, objetivos, herramientas" },
      { type: "db", label: "sent_emails", detail: "Emails recientes (últimos 10)" },
      { type: "db", label: "contact_notes", detail: "Notas internas (últimas 5)" },
      { type: "api", label: "Resend", detail: "Email de brief al admin" },
    ],
    sourceFile: "server/agents/meeting-prep.ts:31",
  },
  {
    name: "followup-writer",
    displayName: "Redactor de Follow-ups",
    kind: "ai",
    description: "Genera drafts de follow-up tras reuniones completadas y los envía al admin",
    trigger: "cron",
    schedule: "*/30 * * * *",
    scheduleHuman: "cada 30 minutos",
    criticality: "normal",
    runnable: runFollowupWriter,
    longDescription:
      "Genera drafts de follow-up email para reuniones completadas (1-24h atrás). Crea subject, body texto + HTML, y key points. Envía el draft al admin (NO al cliente) con un mailto: link para revisar/editar antes de enviar manualmente. Marca followupDraftedAt para no duplicar.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Genera draft follow-up (1500 tokens, temperatura 0.4)" },
      { type: "db", label: "appointments", detail: "Lee completadas sin followupDraftedAt; marca flag" },
      { type: "db", label: "contacts", detail: "Nombre, empresa, email, idioma" },
      { type: "db", label: "diagnostics", detail: "Industria, empleados, objetivos" },
      { type: "db", label: "sent_emails", detail: "Emails recientes (últimos 5)" },
      { type: "db", label: "contact_notes", detail: "Notas (últimas 5)" },
      { type: "api", label: "Resend", detail: "Envía draft al admin (no al cliente)" },
    ],
    sourceFile: "server/agents/followup-writer.ts:28",
  },
  {
    name: "org-preferences-extractor",
    displayName: "Memoria de Propuestas",
    kind: "ai",
    description: "Extrae lecciones de propuestas cerradas (accepted/rejected) y las guarda como preferencias org. Alimenta el chat y el generador con patrones aprendidos.",
    trigger: "cron",
    schedule: "30 8 * * *",
    scheduleHuman: "diario 3:30 AM COT",
    criticality: "low",
    runnable: runOrgPreferencesExtractor,
    longDescription:
      "Extrae lecciones de propuestas cerradas (accepted/rejected) en la última semana: qué funcionó, qué no, patrones de clientes exitosos vs rechazos. Guarda los insights como preferencias org en memoria del sistema, que luego alimentan al chat de propuestas y al generador con patrones aprendidos.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Análisis de patrones en propuestas cerradas" },
      { type: "db", label: "proposals", detail: "Lee status=accepted/rejected (última semana)" },
      { type: "db", label: "contacts", detail: "Contexto de clientes (industria, presupuesto)" },
      { type: "db", label: "org_preferences", detail: "Guarda insights extraídos como memoria org" },
    ],
    sourceFile: "server/org-preferences.ts:45",
  },
  {
    name: "newsletter-digest",
    displayName: "Newsletter Semanal",
    kind: "ai",
    description: "Scrapea RSS y genera newsletter con resumen IA (lunes 7:30am)",
    trigger: "cron",
    schedule: "30 12 * * 1",
    scheduleHuman: "lunes 7:30 AM COT",
    criticality: "normal",
    runnable: generateAndSendDailyNewsletter,
    longDescription:
      "Genera newsletter semanal cada lunes 7:30 AM: scrapea RSS de noticias tech, resume con Claude Haiku en 3 items principales. Crea blog post publicado + email HTML. Envía a todos los suscriptores activos. Evita duplicados verificando envío previo de la semana.",
    connections: [
      { type: "llm", label: "Claude Haiku 4.5", detail: "Genera digest de noticias tech" },
      { type: "db", label: "blog_posts", detail: "Crea post publicado en categoría Tendencias Tech" },
      { type: "db", label: "newsletter_subscribers", detail: "Lista de activos para envío" },
      { type: "db", label: "newsletter_sends", detail: "Registra envío (fecha, recipient count)" },
      { type: "api", label: "Resend", detail: "Envía email a cada suscriptor" },
    ],
    sourceFile: "server/email-scheduler.ts:743",
  },
  {
    name: "commit-analyzer",
    displayName: "Analizador de Commits",
    kind: "ai",
    description: "Análisis automático diario de commits con Claude (6 AM COT)",
    trigger: "cron",
    schedule: "0 11 * * *",
    scheduleHuman: "diario 6:00 AM COT",
    criticality: "normal",
    runnable: autoAnalyzeProjectCommits,
    longDescription:
      "Análisis diario (6 AM) de commits GitHub para proyectos con aiTrackingEnabled. Fetch últimos 10 commits (24h), evita duplicados checando commitShas previas, llama a project-ai para traducir y crea project_activity_entries con summaries de 3 niveles, categoría e isSignificant.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Vía project-ai: traduce commits a actividad" },
      { type: "db", label: "client_projects", detail: "Proyectos con aiTrackingEnabled=true" },
      { type: "db", label: "project_activity_entries", detail: "Crea entradas con commitShas deduplicadas" },
      { type: "api", label: "GitHub API", detail: "Fetch últimos 10 commits/proyecto (24h)" },
    ],
    sourceFile: "server/email-scheduler.ts:1051",
  },
  {
    name: "weekly-summaries",
    displayName: "Resúmenes Semanales de Proyecto",
    kind: "ai",
    description: "Genera resumen IA de progreso y lo envía a clientes (lunes 7:15am)",
    trigger: "cron",
    schedule: "15 12 * * 1",
    scheduleHuman: "lunes 7:15 AM COT",
    criticality: "normal",
    runnable: sendWeeklyProjectSummaries,
    longDescription:
      "Cada lunes 7:15 AM genera resumen de progreso para cada proyecto activo. Combina actividades IA + tareas cerradas + time logs de los últimos 7 días con Claude Sonnet 4. Envía email al cliente y publica el resumen como mensaje en el portal del proyecto. Actualiza lastWeeklySummaryAt.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Genera resumen semanal completo" },
      { type: "db", label: "client_projects", detail: "Proyectos activos (no completed)" },
      { type: "db", label: "project_activity_entries", detail: "Últimos 7 días de actividad" },
      { type: "db", label: "project_tasks", detail: "Tareas completadas esta semana" },
      { type: "db", label: "project_time_log", detail: "Horas registradas esta semana" },
      { type: "db", label: "project_messages", detail: "Publica el resumen como mensaje en portal" },
      { type: "api", label: "Resend", detail: "Envía email al cliente" },
    ],
    sourceFile: "server/email-scheduler.ts:1141",
  },
  {
    name: "phase-generator",
    displayName: "Generador de Fases con IA",
    kind: "ai",
    description: "Diseña 3-6 fases + tareas + entregables desde un brief, con doble agente y juez semántico",
    trigger: "manual",
    criticality: "critical",
    longDescription:
      "Pipeline en 2 etapas con auto-corrección: (1) Sonnet diseña fases con completionPercent + evidence del repo + description rica + keyOutcomes; (2) Sonnet genera 4-8 tareas por fase. Cada etapa se valida estructuralmente (parser + schema check) y semánticamente (un segundo agente Sonnet revisa cobertura del brief, orden lógico, especificidad, credibilidad de completionPercent). Si cualquier validación falla, inyecta el feedback puntual al system prompt y reintenta hasta 2 veces. Solo si todos los intentos fallan, cae al fallback skeleton (kickoff → core → tests → demo). Persiste en agent_runs.metadata: phasesScore, tasksScore, retries, summary del juez, fallbackUsed.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4.6", detail: "4 llamadas por gen exitosa: 2 generadores + 2 jueces" },
      { type: "api", label: "GitHub Contents API", detail: "Lee README, schema, app/api, server/*, 30 commits" },
      { type: "db", label: "project_phases", detail: "Crea fases con completionPercent + evidence + outcomes" },
      { type: "db", label: "project_tasks", detail: "Crea 4-8 tareas/fase con prioridades + milestones" },
      { type: "db", label: "project_deliverables", detail: "Crea entregables verificables por fase" },
      { type: "db", label: "agent_runs.metadata", detail: "Persiste scores del juez, retries, summary" },
    ],
    sourceFile: "server/project-ai.ts:791",
  },
  {
    name: "phase-appender",
    displayName: "Append de Fase con IA",
    kind: "ai",
    description: "Diseña UNA fase nueva al final del proyecto cuando aparece scope adicional",
    trigger: "manual",
    criticality: "normal",
    longDescription:
      "Cuando un proyecto ya está en marcha y aparece scope adicional (ej: 'también vamos a integrar pagos con Stripe'), este agente diseña UNA sola fase nueva al final con sus tareas + entregables, sin tocar las fases existentes. Lee fases actuales para no duplicar, calcula start_date después de la última fase existente, y extiende project.estimatedEndDate. Usa Sonnet para diseñar fase + Sonnet para tareas. Si AI falla, fallback a 'Completar [nombre]' como única tarea milestone.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4.6", detail: "2 llamadas: diseño de fase + tareas" },
      { type: "api", label: "GitHub Contents API", detail: "Opcional: contexto del repo si hay" },
      { type: "db", label: "project_phases", detail: "Lee fases existentes, append una nueva" },
      { type: "db", label: "project_tasks", detail: "Crea tareas para la nueva fase" },
      { type: "db", label: "project_deliverables", detail: "Crea entregables de la nueva fase" },
      { type: "db", label: "client_projects", detail: "Extiende estimatedEndDate" },
    ],
    sourceFile: "server/project-ai.ts:1271",
  },
  {
    name: "proposal-to-project",
    displayName: "Convertidor Propuesta → Proyecto",
    kind: "ai",
    description: "Convierte una propuesta aceptada en un proyecto con fases y tareas listas para ejecutar",
    trigger: "manual",
    criticality: "normal",
    longDescription:
      "Cuando una propuesta comercial es aceptada, este agente la convierte en un proyecto operativo: crea registro client_projects vinculado al contacto, deriva las fases del timelineData de la propuesta (si existe) o las genera con AI desde las sections del brief, y dispara phase-generator para llenarlas con tareas + entregables. Resultado: pasar de 'cliente firmó' a 'proyecto activo y trackeable' en un click.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4.6", detail: "Vía phase-generator si no hay timelineData" },
      { type: "db", label: "proposals", detail: "Lee la propuesta aceptada" },
      { type: "db", label: "client_projects", detail: "Crea el proyecto vinculado al contacto" },
      { type: "db", label: "project_phases / tasks / deliverables", detail: "Vía phase-generator interno" },
      { type: "internal", label: "phase-generator agent", detail: "Sub-agente para llenar fases" },
    ],
    sourceFile: "server/project-ai.ts:1488",
  },
  {
    name: "commit-analyzer-on-demand",
    displayName: "Analizador de Commits On-Demand",
    kind: "ai",
    description: "Analiza commits con Claude bajo demanda — disparado por webhook GitHub o botón 'Analizar commits'",
    trigger: "webhook",
    criticality: "normal",
    longDescription:
      "Versión on-demand del commit-analyzer (que también corre como cron diario 6 AM). Disparado por: (a) webhook push de GitHub cuando un proyecto tiene aiTrackingEnabled, (b) admin clickea 'Analizar commits' en el tab Actividad. Trae commits del repo (vía GitHub API con OAuth del admin para repos privados), los pasa por Claude Sonnet para traducir tech-jerga a updates client-facing en 3 niveles, y crea project_activity_entries con summaries + categoría + flag isSignificant. Distinto del cron porque puede correr varias veces al día con un volumen variable.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4.6", detail: "Vía project-ai: traduce commits a actividad" },
      { type: "api", label: "GitHub API (OAuth)", detail: "Fetch commits con scope a repos privados del admin" },
      { type: "webhook", label: "POST /api/webhooks/github/:projectId", detail: "Recibe push events de GitHub" },
      { type: "db", label: "project_activity_entries", detail: "Crea entradas con commitShas deduplicadas" },
      { type: "db", label: "client_projects", detail: "Recalcula health post-análisis" },
    ],
    sourceFile: "server/routes.ts:7691",
  },
  {
    name: "weekly-summary-on-demand",
    displayName: "Resumen Semanal On-Demand",
    kind: "ai",
    description: "Genera resumen semanal de un proyecto bajo demanda (botón 'Resumen semanal' en Actividad)",
    trigger: "manual",
    criticality: "low",
    longDescription:
      "Versión on-demand del weekly-summaries (cron lunes 7:15am). Cuando el admin quiere ver el resumen sin esperar al cron, este agente lo genera al instante usando los últimos 7 días de actividades + tareas completadas + time logs. Combina los 3 con Claude Sonnet en un mensaje narrativo para el cliente. NO envía email automáticamente — solo devuelve el texto al admin para revisar y decidir si publicar como mensaje en el portal.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4.6", detail: "Genera resumen narrativo" },
      { type: "db", label: "project_activity_entries", detail: "Últimos 7 días" },
      { type: "db", label: "project_tasks", detail: "Tareas completadas esta semana" },
      { type: "db", label: "project_time_log", detail: "Horas registradas esta semana" },
    ],
    sourceFile: "server/project-ai.ts:620",
  },

  // ─── Automatizaciones ────────────────────────────────────────
  {
    name: "email-queue",
    displayName: "Cola de Emails",
    kind: "automation",
    description: "Procesa emails pendientes de la secuencia y los envía vía Resend",
    trigger: "cron",
    schedule: "*/15 * * * *",
    scheduleHuman: "cada 15 minutos",
    criticality: "critical",
    runnable: processEmailQueue,
    longDescription:
      "Columna vertebral del nurturing. Procesa emails de sent_emails con status=pending y scheduledFor pasado, valida contacto y opt-out, envía vía Resend, y actualiza a sent/failed con reintentos automáticos (máx 3). Cancela follow-ups si la propuesta asociada ya fue aceptada/rechazada.",
    connections: [
      { type: "db", label: "sent_emails", detail: "Lee pending+scheduledFor<=now; escribe sent/failed/expired" },
      { type: "db", label: "contacts", detail: "Valida contacto y opt-out; status lead→contacted" },
      { type: "db", label: "email_templates", detail: "Lee template para generar contenido" },
      { type: "db", label: "diagnostics", detail: "Contexto reunión (fecha, hora, meetLink)" },
      { type: "db", label: "proposals", detail: "Cancela follow-ups si aceptada/rechazada" },
      { type: "db", label: "appointments", detail: "Inyecta follow-up dates en seguimiento_post" },
      { type: "db", label: "activity_log", detail: "Registra envíos de email" },
      { type: "api", label: "Resend", detail: "POST /v1/emails" },
    ],
    sourceFile: "server/email-scheduler.ts:24",
  },
  {
    name: "abandoned-followup",
    displayName: "Follow-up de Leads Abandonados",
    kind: "automation",
    description: "Re-engagement a leads sin actividad hace más de 7 días",
    trigger: "cron",
    schedule: "*/15 * * * *",
    scheduleHuman: "cada 15 minutos",
    criticality: "normal",
    runnable: processAbandonedEmails,
    longDescription:
      "Busca leads en abandoned_leads que completaron Fase 1 del diagnóstico hace >1 hora, sin convertir y sin email enviado. Les envía email de re-engagement generado con IA para traerlos de vuelta al flujo. Marca emailSent=true al enviar.",
    connections: [
      { type: "db", label: "abandoned_leads", detail: "Lee converted=false + emailSent=false + capturedAt>1h" },
      { type: "db", label: "email_templates", detail: "Lee template 'abandono'" },
      { type: "api", label: "Resend", detail: "POST /v1/emails" },
      { type: "internal", label: "email-ai.ts", detail: "generateEmailContent()" },
    ],
    sourceFile: "server/email-scheduler.ts:326",
  },
  {
    name: "whatsapp-queue",
    displayName: "Cola de WhatsApp",
    kind: "automation",
    description: "Envía mensajes WhatsApp programados vía Meta Cloud API",
    trigger: "cron",
    schedule: "*/15 * * * *",
    scheduleHuman: "cada 15 minutos",
    criticality: "critical",
    runnable: processWhatsAppQueue,
    longDescription:
      "Equivalente WhatsApp de email-queue. Procesa whatsapp_messages con status=pending. Evalúa condicionales (ej: if_email_not_opened — omite si el email vinculado fue abierto), envía vía Meta Cloud API (texto o template pre-aprobado), actualiza status. Soporta reintentos automáticos.",
    connections: [
      { type: "db", label: "whatsapp_messages", detail: "Lee pending+scheduledFor<=now; escribe sent/failed" },
      { type: "db", label: "contacts", detail: "Valida contacto y opt-out" },
      { type: "db", label: "sent_emails", detail: "Evalúa if_email_not_opened antes de enviar" },
      { type: "db", label: "diagnostics", detail: "Contexto si mensaje no pre-generado" },
      { type: "api", label: "Meta WhatsApp Cloud API", detail: "POST /v21.0/{phoneId}/messages" },
    ],
    sourceFile: "server/email-scheduler.ts:392",
  },
  {
    name: "substatus-updater",
    displayName: "Actualizador de Substatus",
    kind: "automation",
    description: "Auto-actualiza substatus del pipeline según eventos",
    trigger: "cron",
    schedule: "*/30 * * * *",
    scheduleHuman: "cada 30 minutos",
    criticality: "normal",
    runnable: updateContactSubstatuses,
    longDescription:
      "Analiza patrones de engagement (aperturas, clicks) por contacto activo y auto-clasifica en interested (1+ click o 2+ aperturas), warm (score>60), cold (3+ emails sin abrir) o no_response. Si pasa a cold, programa email de reengagement + WhatsApp condicional. Crea notificaciones y alerta al admin si es lead caliente.",
    connections: [
      { type: "db", label: "contacts", detail: "Lee activos; actualiza substatus" },
      { type: "db", label: "sent_emails", detail: "Cuenta aperturas/clicks por contacto" },
      { type: "db", label: "email_templates", detail: "Template 'reengagement'" },
      { type: "db", label: "diagnostics", detail: "Contexto para generar reengagement" },
      { type: "db", label: "notifications", detail: "Cold/warm leads" },
      { type: "db", label: "whatsapp_messages", detail: "Programa WA condicional" },
      { type: "api", label: "Resend", detail: "Alerta admin de lead caliente" },
    ],
    sourceFile: "server/email-scheduler.ts:532",
  },
  {
    name: "overdue-tasks",
    displayName: "Tareas Vencidas",
    kind: "automation",
    description: "Detecta tareas con dueDate pasado y crea notificaciones",
    trigger: "cron",
    schedule: "*/30 * * * *",
    scheduleHuman: "cada 30 minutos",
    criticality: "low",
    runnable: checkOverdueTasks,
    longDescription:
      "Busca tasks con status=pending y dueDate ya pasada. Crea una notificación en-app por cada una. Si la tarea es priority=high, además envía email al admin. Evita duplicados checando si ya existe notificación del mismo tipo para el contacto.",
    connections: [
      { type: "db", label: "tasks", detail: "Lee pending + dueDate<=now" },
      { type: "db", label: "notifications", detail: "type=task_overdue (anti-dup)" },
      { type: "api", label: "Resend", detail: "Email al admin si priority=high" },
    ],
    sourceFile: "server/email-scheduler.ts:684",
  },
  {
    name: "proposal-trash-purge",
    displayName: "Purga de Papelera de Propuestas",
    kind: "automation",
    description: "Elimina permanentemente propuestas con más de 30 días en la papelera",
    trigger: "cron",
    schedule: "0 8 * * *",
    scheduleHuman: "diario 3:00 AM COT",
    criticality: "low",
    runnable: purgeOldDeletedProposals,
    longDescription:
      "Limpia propuestas con deletedAt != null que tienen más de 30 días en la papelera. Primero elimina sus registros en proposal_views, después la propuesta misma. Una vez purgadas no hay forma de recuperarlas — es limpieza permanente.",
    connections: [
      { type: "db", label: "proposals", detail: "Elimina deletedAt!=null + deletedAt<=cutoff" },
      { type: "db", label: "proposal_views", detail: "Elimina vistas vinculadas antes" },
    ],
    sourceFile: "server/email-scheduler.ts:1218",
  },
  {
    name: "cost-reference-freshness",
    displayName: "Verificador de Frescura de Precios",
    kind: "automation",
    description: "Alerta si shared/proposal-cost-reference.md tiene >180 días sin actualizarse",
    trigger: "cron",
    schedule: "0 14 1 * *",
    scheduleHuman: "día 1 de cada mes, 9 AM COT",
    criticality: "low",
    runnable: runCostReferenceFreshness,
    longDescription:
      "Cada mes (día 1) revisa la fecha de modificación del archivo shared/proposal-cost-reference.md. Si tiene >180 días, alerta al admin porque los precios del stack (Railway, Claude, Resend, etc.) probablemente cambiaron. Crea notificación + email con checklist de proveedores a revisar.",
    connections: [
      { type: "db", label: "notifications", detail: "type=cost_reference_stale" },
      { type: "api", label: "Resend", detail: "Email con checklist al admin" },
      { type: "internal", label: "shared/proposal-cost-reference.md", detail: "Revisa mtime del archivo" },
    ],
    sourceFile: "server/agents/cost-reference-freshness.ts:16",
  },
  {
    name: "analytics-monthly-report",
    displayName: "Resumen Mensual de Analytics",
    kind: "automation",
    description: "Email mensual al cliente con resumen del mes anterior + magic link al dashboard (día 1, 9 AM COT)",
    trigger: "cron",
    schedule: "0 14 1 * *",
    scheduleHuman: "día 1 de cada mes, 9:00 AM COT",
    criticality: "normal",
    runnable: runAnalyticsMonthlyReport,
    longDescription:
      "Día 1 de cada mes: para cada proyecto con conexión GA4 connected, suma sesiones/usuarios/pageviews del mes anterior, calcula tendencia vs mes pre-anterior, identifica top página y fuente. Envía email a cada client_user vinculado con magic link al portal analytics y datos comparativos.",
    connections: [
      { type: "db", label: "client_analytics_connections", detail: "Proyectos con status=connected" },
      { type: "db", label: "client_analytics_daily", detail: "Datos del mes anterior y comparativo" },
      { type: "db", label: "client_user_projects", detail: "Identifica recipients" },
      { type: "db", label: "client_users", detail: "Email y nombre del usuario" },
      { type: "api", label: "Resend", detail: "POST /v1/emails con magic link" },
      { type: "internal", label: "createMagicToken", detail: "server/client-auth.ts" },
    ],
    sourceFile: "server/agents/analytics-monthly-report.ts:24",
  },
  {
    name: "admin-briefing",
    displayName: "Briefing Diario Admin",
    kind: "automation",
    description: "Resumen diario de leads, citas y métricas (7 AM COT)",
    trigger: "cron",
    schedule: "0 12 * * *",
    scheduleHuman: "diario 7:00 AM COT",
    criticality: "normal",
    runnable: sendAdminDailyBriefing,
    longDescription:
      "Cada mañana 7 AM (Bogotá) busca todas las reuniones diagnosticadas (meetingStatus=scheduled) que ocurren en las próximas 24h. Arma un email con la lista (contacto, empresa, horario, datos del diagnóstico) y links a Meet. Incluye botón directo al CRM para cada contacto.",
    connections: [
      { type: "db", label: "diagnostics", detail: "meetingStatus=scheduled con fechaCita+horaCita" },
      { type: "db", label: "contacts", detail: "Contacto asociado por diagnosticId" },
      { type: "api", label: "Resend", detail: "POST /v1/emails" },
    ],
    sourceFile: "server/email-scheduler.ts:958",
  },
  {
    name: "lead-scoring",
    displayName: "Lead Scoring",
    kind: "automation",
    description: "Calcula score 0-100 basado en engagement y perfil (algoritmo determinista)",
    trigger: "webhook",
    criticality: "normal",
    longDescription:
      "Algoritmo determinista (NO IA) que calcula score 0-100 por contacto. Suma puntos por: budget del diagnóstico (+5-25), tamaño empresa (+5-15), uso de IA (+10), nivel tech (+5-10), áreas de prioridad (+5-10), tiempo del formulario (+5), engagement (open rate +20, clicks +20), status scheduled/converted (+15-20), tags newsletter (+10). Resta por inactividad (-15 máx).",
    connections: [
      { type: "internal", label: "Función pura", detail: "Toma Contact + Diagnostic + EmailSummary, devuelve number" },
    ],
    sourceFile: "server/lead-scoring.ts:10",
  },

  // ─── Integraciones ───────────────────────────────────────────
  {
    name: "gmail-sync",
    displayName: "Sync Gmail",
    kind: "integration",
    description: "Sincroniza últimos 90 días de emails del inbox con CRM",
    trigger: "cron",
    schedule: "*/15 * * * *",
    scheduleHuman: "cada 15 minutos",
    criticality: "critical",
    runnable: syncGmailEmails,
    longDescription:
      "Cada 15 min sincroniza el inbox de info@im3systems.com (vía service account con domain-wide delegation). Intenta sync incremental con history API; si falla, hace full sync de últimos 90 días. Matchea emails contra contactos por: email exacto, emails asociados, o dominio compartido. Para matches por dominio, dispara email-classifier para validar relevancia con IA. Genera notificaciones para emails entrantes recientes (<24h, 1 por contacto/30min).",
    connections: [
      { type: "api", label: "Gmail API", detail: "Service account impersonando info@im3systems.com" },
      { type: "db", label: "gmail_emails", detail: "Inserta emails con headers, contenido, labels" },
      { type: "db", label: "gmail_sync_state", detail: "Persiste lastHistoryId para incremental" },
      { type: "db", label: "contacts", detail: "Match por email/dominio; actualiza lastActivityAt" },
      { type: "db", label: "contact_emails", detail: "Tabla auxiliar con emails alternativos" },
      { type: "db", label: "activity_log", detail: "gmail_received/gmail_sent" },
      { type: "db", label: "notifications", detail: "new_email para entrantes recientes" },
      { type: "internal", label: "email-classifier", detail: "Valida relevancia de matches por dominio" },
    ],
    sourceFile: "server/google-gmail.ts:465",
  },
  {
    name: "drive-file-sync",
    displayName: "Sync Drive → Proyectos",
    kind: "integration",
    description: "Sincroniza archivos de Google Drive a proyectos activos",
    trigger: "manual",
    criticality: "low",
    longDescription:
      "Sincroniza archivos de una carpeta Drive (por folderId) hacia project_files. Detecta tipo (recording, transcript, contract, design, document, image, other) por MIME + extensión. Inserta solo nuevos comparando URLs existentes. Disparada manualmente desde UI admin o tras crear diagnóstico con carpeta asignada.",
    connections: [
      { type: "api", label: "Google Drive API", detail: "Service account read-only; lista archivos no-trashed" },
      { type: "db", label: "project_files", detail: "Inserta archivos detectados con type, url, size" },
    ],
    sourceFile: "server/drive-file-sync.ts:40",
  },
  {
    name: "contact-drive-sync",
    displayName: "Sync Drive → Contactos",
    kind: "integration",
    description: "Sincroniza archivos de Drive de cada contacto activo cada 30 min",
    trigger: "cron",
    schedule: "*/30 * * * *",
    scheduleHuman: "cada 30 minutos",
    criticality: "low",
    runnable: runContactDriveSyncCron,
    longDescription:
      "Cada 30 min itera sobre contactos con driveFolderId y status en (contacted, scheduled, converted), y sincroniza nuevos archivos de su carpeta de Drive hacia contact_files. Deduplica por driveFileId. También se dispara manual desde el botón 'Sincronizar' del banner del perfil del cliente.",
    connections: [
      { type: "api", label: "Google Drive API", detail: "Service account; lista archivos no-trashed por contact.driveFolderId" },
      { type: "db", label: "contacts", detail: "Filtra status IN (contacted,scheduled,converted) AND drive_folder_id NOT NULL" },
      { type: "db", label: "contact_files", detail: "Inserta archivos detectados, deduplica por drive_file_id" },
    ],
    sourceFile: "server/drive-file-sync.ts:155",
  },
  {
    name: "analytics-sync",
    displayName: "Sync de Analytics (GA4)",
    kind: "integration",
    description: "Pulla métricas diarias de GA4 para cada proyecto conectado (6 AM COT)",
    trigger: "cron",
    schedule: "0 11 * * *",
    scheduleHuman: "diario 6:00 AM COT",
    criticality: "normal",
    runnable: runAnalyticsSync,
    longDescription:
      "Cada día (6 AM) itera sobre conexiones GA4 con status=connected, extrae métricas del día anterior en zona horaria de la propiedad, y upserts en client_analytics_daily. 4 queries paralelas: métricas (sessions/users/pageviews/bounce), top 5 páginas, top 5 fuentes, top 5 países. También dispara backfill de últimos 30 días al conectar propiedad nueva.",
    connections: [
      { type: "api", label: "Google Analytics 4 Data API", detail: "Service account; runReport por propiedad" },
      { type: "db", label: "client_analytics_connections", detail: "status=connected; actualiza lastSyncedAt" },
      { type: "db", label: "client_analytics_daily", detail: "Upsert por (clientProjectId, date)" },
    ],
    sourceFile: "server/agents/analytics-sync.ts:14",
  },
  {
    name: "post-meeting-recordings",
    displayName: "Procesador de Grabaciones",
    kind: "integration",
    description: "Descarga y procesa recordings de Google Meet post-reunión",
    trigger: "cron",
    schedule: "*/30 * * * *",
    scheduleHuman: "cada 30 minutos",
    criticality: "normal",
    runnable: processPostMeetingRecordings,
    longDescription:
      "Cada 30 min busca diagnósticos y appointments completados sin grabaciones procesadas. Extrae los archivos de Meet almacenados en la carpeta Drive del cliente, detecta recordings/transcripts por MIME y nombre, y los vincula. Registra URLs en activity_log y appointments.recordingUrl/transcriptUrl.",
    connections: [
      { type: "db", label: "diagnostics", detail: "meetingStatus=completed sin googleDriveUrl procesado" },
      { type: "db", label: "appointments", detail: "status=completed sin recordingUrl" },
      { type: "db", label: "contacts", detail: "Vincula activity_log al contacto" },
      { type: "api", label: "Google Drive API", detail: "Busca recordings/transcripts en carpeta cliente" },
      { type: "db", label: "activity_log", detail: "recording_saved, transcript_saved" },
    ],
    sourceFile: "server/email-scheduler.ts:849",
  },

  // ─── Webhooks ────────────────────────────────────────────────
  {
    name: "email-webhook",
    displayName: "Webhook Resend",
    kind: "webhook",
    description: "Recibe eventos de apertura, clic, rebote y queja de emails",
    trigger: "webhook",
    criticality: "critical",
    longDescription:
      "Endpoint POST /api/email-webhook recibe eventos de Resend (email.opened, email.clicked, email.bounced, email.complained). Mapea cada evento a sentEmails (busca por resendMessageId), actualiza status y openedAt. Dispara recálculo de leadScore. Crea notificaciones in-app (email_clicked) y alerta al admin por bounce/complaint.",
    connections: [
      { type: "api", label: "Resend", detail: "Webhook events: opened/clicked/bounced/complained" },
      { type: "db", label: "sent_emails", detail: "Busca por resendMessageId; actualiza status" },
      { type: "db", label: "contacts", detail: "Recalcula leadScore; registra activity" },
      { type: "db", label: "activity_log", detail: "email_opened/email_clicked/email_bounced" },
      { type: "db", label: "notifications", detail: "email_clicked y hot_lead si cruza threshold" },
      { type: "internal", label: "calculateLeadScore", detail: "server/lead-scoring.ts" },
    ],
    sourceFile: "server/routes.ts:921",
  },
  {
    name: "whatsapp-webhook",
    displayName: "Webhook WhatsApp",
    kind: "webhook",
    description: "Recibe mensajes entrantes y estados de entrega de Meta",
    trigger: "webhook",
    criticality: "critical",
    longDescription:
      "GET /api/whatsapp/webhook (verificación de token Meta) y POST /api/whatsapp/webhook (eventos). Status updates → actualiza whatsapp_messages (delivered/read/failed). Mensajes entrantes → busca contacto por teléfono normalizado, dispara whatsapp-intent para clasificar, envía respuesta automática si es pregunta, crea notificaciones según intent (reschedule/hot_lead/cold_lead).",
    connections: [
      { type: "api", label: "Meta WhatsApp Cloud API", detail: "Status updates + incoming messages" },
      { type: "db", label: "whatsapp_messages", detail: "Actualiza status, deliveredAt, readAt" },
      { type: "db", label: "contacts", detail: "Match por teléfono (con/sin 57, con/sin +)" },
      { type: "db", label: "diagnostics", detail: "Contexto para clasificación" },
      { type: "db", label: "activity_log", detail: "whatsapp_received/sent/rejection" },
      { type: "db", label: "notifications", detail: "new_whatsapp, reschedule_request, hot_lead, cold_lead" },
      { type: "internal", label: "whatsapp-intent", detail: "Clasifica intent del mensaje" },
    ],
    sourceFile: "server/routes.ts:1072",
  },
  {
    name: "github-webhook",
    displayName: "Webhook GitHub",
    kind: "webhook",
    description: "Recibe push events y dispara análisis de commits con IA",
    trigger: "webhook",
    criticality: "normal",
    longDescription:
      "Endpoint POST /api/webhooks/github/:projectId recibe push events de GitHub. Verifica firma HMAC-SHA256 (header x-hub-signature-256 vs githubWebhookSecret), almacena payload raw en github_webhook_events. Si el proyecto tiene aiTrackingEnabled=true, invoca project-ai-analyzer para los commits del push. Recalcula health score del proyecto.",
    connections: [
      { type: "api", label: "GitHub", detail: "Push webhook events; HMAC SHA-256 en x-hub-signature-256" },
      { type: "db", label: "client_projects", detail: "Lee githubWebhookSecret + aiTrackingEnabled" },
      { type: "db", label: "github_webhook_events", detail: "Almacena payload raw + flags processed" },
      { type: "db", label: "project_activity_entries", detail: "Inserta entries de IA" },
      { type: "internal", label: "project-ai-analyzer", detail: "Análisis IA de commits" },
      { type: "internal", label: "calculateProjectHealth", detail: "Recalcula health del proyecto" },
    ],
    sourceFile: "server/routes.ts:7420",
  },
  {
    name: "brief-generate",
    displayName: "Generador de Brief Técnico",
    kind: "ai",
    description: "Genera el brief técnico detallado a partir de una propuesta aprobada",
    trigger: "manual",
    criticality: "normal",
    longDescription:
      "Toma una propuesta inicial ya generada + todo el contexto del cliente (diagnóstico, emails, notas, docs Drive) y produce un brief técnico detallado: un módulo expandido por cada módulo de la propuesta, con problemSolved/howItWorks/meetingContext/whyThisChoice/withoutThis/examples. Sonnet 4, max_tokens 16k, validado con zod.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Generación principal (max_tokens 16000, temp 0.4)" },
      { type: "db", label: "proposals", detail: "Lee la propuesta inicial como fuente primaria" },
      { type: "db", label: "proposalBriefs", detail: "Persiste el brief generado" },
      { type: "db", label: "contacts/diagnostics", detail: "Contexto del cliente" },
      { type: "api", label: "Google Drive", detail: "Lectura de docs del cliente" },
    ],
    sourceFile: "server/proposal-brief-ai.ts:70",
  },
  {
    name: "brief-chat",
    displayName: "Asistente Conversacional del Brief",
    kind: "ai",
    description: "Refina el brief técnico conversacionalmente con Claude + tool use",
    trigger: "manual",
    criticality: "normal",
    longDescription:
      "Chat con tool use para refinar el brief: update_module (con preview/apply), update_intro, update_faqs, update_glossary, add_module/remove_module, audit_brief (checks mecánicos + análisis cualitativo), list_drive_folder, read_drive_file. Snapshots automáticos antes de cada cambio. System prompt particionado con cache_control para reducir costo en mensajes consecutivos.",
    connections: [
      { type: "llm", label: "Claude Sonnet 4", detail: "Chat + 11 tools" },
      { type: "db", label: "proposalBriefs", detail: "Brief actual + persistencia de cambios" },
      { type: "db", label: "proposalBriefChatMessages", detail: "Historial (últimos 30)" },
      { type: "db", label: "proposalBriefSnapshots", detail: "Snapshots antes de cada cambio (undo)" },
      { type: "db", label: "contacts/diagnostics", detail: "Contexto del cliente" },
      { type: "api", label: "Google Drive", detail: "Lectura de docs del cliente" },
    ],
    sourceFile: "server/proposal-brief-chat.ts:223",
  },
];

export function findAgent(name: string): AgentDefinition | undefined {
  return AGENT_REGISTRY.find((a) => a.name === name);
}
