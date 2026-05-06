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

export type AgentKind = "ai" | "automation" | "integration" | "webhook";

export type AgentTrigger = "cron" | "webhook" | "manual";

export type AgentCriticality = "critical" | "normal" | "low";

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
  },
  {
    name: "proposal-section-regen",
    displayName: "Reescritor de Sección de Propuesta",
    kind: "ai",
    description: "Reescribe una sección de propuesta con instrucción del admin (~3-5s)",
    trigger: "manual",
    criticality: "normal",
  },
  {
    name: "proposal-chat",
    displayName: "Asistente Conversacional de Propuestas",
    kind: "ai",
    description: "Refina propuestas conversacionalmente con Claude Sonnet 4 + tool use para editar secciones",
    trigger: "manual",
    criticality: "normal",
  },
  {
    name: "project-ai-analyzer",
    displayName: "Analizador de Proyectos",
    kind: "ai",
    description: "Traduce commits técnicos a actividad para clientes",
    trigger: "manual",
    criticality: "normal",
  },
  {
    name: "blog-ai",
    displayName: "Generador de Blog",
    kind: "ai",
    description: "Crea y mejora artículos de blog con Claude",
    trigger: "manual",
    criticality: "low",
  },
  {
    name: "blog-generator",
    displayName: "Generador de Blog",
    kind: "ai",
    description: "Crea artículos nuevos desde un prompt/idea",
    trigger: "manual",
    criticality: "low",
  },
  {
    name: "blog-improver",
    displayName: "Mejorador de Blog",
    kind: "ai",
    description: "Mejora contenido existente según instrucciones",
    trigger: "manual",
    criticality: "low",
  },
  {
    name: "contact-insight",
    displayName: "Insight de Contacto",
    kind: "ai",
    description: "Mini-auditoría de 3 insights por contacto (cache 7 días)",
    trigger: "manual",
    criticality: "normal",
  },
  {
    name: "mini-audit",
    displayName: "Mini-Auditoría Post-Diagnóstico",
    kind: "ai",
    description: "Genera observaciones iniciales después del formulario",
    trigger: "webhook",
    criticality: "normal",
  },
  {
    name: "whatsapp-intent",
    displayName: "Clasificador de Intención WhatsApp",
    kind: "ai",
    description: "Clasifica mensajes entrantes y auto-responde con templates",
    trigger: "webhook",
    criticality: "normal",
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
  },
  {
    name: "lead-scoring",
    displayName: "Lead Scoring",
    kind: "automation",
    description: "Calcula score 0-100 basado en engagement y perfil (algoritmo determinista)",
    trigger: "webhook",
    criticality: "normal",
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
  },
  {
    name: "drive-file-sync",
    displayName: "Sync Drive → Proyectos",
    kind: "integration",
    description: "Sincroniza archivos de Google Drive a proyectos activos",
    trigger: "manual",
    criticality: "low",
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
  },

  // ─── Webhooks ────────────────────────────────────────────────
  {
    name: "email-webhook",
    displayName: "Webhook Resend",
    kind: "webhook",
    description: "Recibe eventos de apertura, clic, rebote y queja de emails",
    trigger: "webhook",
    criticality: "critical",
  },
  {
    name: "whatsapp-webhook",
    displayName: "Webhook WhatsApp",
    kind: "webhook",
    description: "Recibe mensajes entrantes y estados de entrega de Meta",
    trigger: "webhook",
    criticality: "critical",
  },
  {
    name: "github-webhook",
    displayName: "Webhook GitHub",
    kind: "webhook",
    description: "Recibe push events y dispara análisis de commits con IA",
    trigger: "webhook",
    criticality: "normal",
  },
];

export function findAgent(name: string): AgentDefinition | undefined {
  return AGENT_REGISTRY.find((a) => a.name === name);
}
