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

export type AgentDomain =
  | "communication"
  | "ai"
  | "sync"
  | "projects"
  | "content"
  | "analysis";

export type AgentTrigger = "cron" | "webhook" | "manual";

export type AgentCriticality = "critical" | "normal" | "low";

export type AgentDefinition = {
  name: string;
  displayName: string;
  domain: AgentDomain;
  description: string;
  trigger: AgentTrigger;
  schedule?: string;
  scheduleHuman?: string;
  criticality: AgentCriticality;
  runnable?: () => Promise<unknown>;
};

export const AGENT_DOMAINS: Record<AgentDomain, { label: string; description: string }> = {
  communication: {
    label: "Comunicación",
    description: "Emails, WhatsApp, newsletter y secuencias de contacto",
  },
  ai: {
    label: "Inteligencia Artificial",
    description: "Servicios Claude: propuestas, análisis, clasificación",
  },
  sync: {
    label: "Sincronización",
    description: "Gmail, Drive, calendario y actualizaciones automáticas",
  },
  projects: {
    label: "Proyectos",
    description: "GitHub, commits, resúmenes y portal cliente",
  },
  content: {
    label: "Contenido",
    description: "Blog, artículos y generación de contenido",
  },
  analysis: {
    label: "Análisis",
    description: "Scoring, insights, briefings y métricas",
  },
};

export const AGENT_REGISTRY: AgentDefinition[] = [
  // ─── Comunicación ────────────────────────────────────────────
  {
    name: "email-queue",
    displayName: "Cola de Emails",
    domain: "communication",
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
    domain: "communication",
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
    domain: "communication",
    description: "Envía mensajes WhatsApp programados vía Meta Cloud API",
    trigger: "cron",
    schedule: "*/15 * * * *",
    scheduleHuman: "cada 15 minutos",
    criticality: "critical",
    runnable: processWhatsAppQueue,
  },
  {
    name: "newsletter-digest",
    displayName: "Newsletter Semanal",
    domain: "communication",
    description: "Scrapea RSS y genera newsletter con resumen IA (lunes 7:30am)",
    trigger: "cron",
    schedule: "30 12 * * 1",
    scheduleHuman: "lunes 7:30 AM COT",
    criticality: "normal",
    runnable: generateAndSendDailyNewsletter,
  },
  {
    name: "email-webhook",
    displayName: "Webhook Resend",
    domain: "communication",
    description: "Recibe eventos de apertura, clic, rebote y queja de emails",
    trigger: "webhook",
    criticality: "critical",
  },
  {
    name: "whatsapp-webhook",
    displayName: "Webhook WhatsApp",
    domain: "communication",
    description: "Recibe mensajes entrantes y estados de entrega de Meta",
    trigger: "webhook",
    criticality: "critical",
  },

  // ─── IA ──────────────────────────────────────────────────────
  {
    name: "proposal-ai",
    displayName: "Generador de Propuestas",
    domain: "ai",
    description: "Genera propuestas comerciales completas con Claude",
    trigger: "manual",
    criticality: "normal",
  },
  {
    name: "proposal-section-regen",
    displayName: "Reescritor de Sección de Propuesta",
    domain: "ai",
    description: "Reescribe una sección de propuesta con instrucción del admin (~3-5s)",
    trigger: "manual",
    criticality: "normal",
  },
  {
    name: "cost-reference-freshness",
    displayName: "Verificador de Frescura de Precios",
    domain: "analysis",
    description: "Alerta si shared/proposal-cost-reference.md tiene >180 días sin actualizarse",
    trigger: "cron",
    schedule: "0 14 1 * *",
    scheduleHuman: "día 1 de cada mes, 9 AM COT",
    criticality: "low",
    runnable: runCostReferenceFreshness,
  },
  {
    name: "project-ai-analyzer",
    displayName: "Analizador de Proyectos",
    domain: "ai",
    description: "Traduce commits técnicos a actividad para clientes",
    trigger: "manual",
    criticality: "normal",
  },
  {
    name: "blog-ai",
    displayName: "Generador de Blog",
    domain: "ai",
    description: "Crea y mejora artículos de blog con Claude",
    trigger: "manual",
    criticality: "low",
  },
  {
    name: "contact-insight",
    displayName: "Insight de Contacto",
    domain: "ai",
    description: "Mini-auditoría de 3 insights por contacto (cache 7 días)",
    trigger: "manual",
    criticality: "normal",
  },
  {
    name: "whatsapp-intent",
    displayName: "Clasificador de Intención WhatsApp",
    domain: "ai",
    description: "Clasifica mensajes entrantes y auto-responde con templates",
    trigger: "webhook",
    criticality: "normal",
  },
  {
    name: "mini-audit",
    displayName: "Mini-Auditoría Post-Diagnóstico",
    domain: "ai",
    description: "Genera observaciones iniciales después del formulario",
    trigger: "webhook",
    criticality: "normal",
  },

  // ─── Análisis ────────────────────────────────────────────────
  {
    name: "lead-scoring",
    displayName: "Lead Scoring",
    domain: "analysis",
    description: "Calcula score 0-100 basado en engagement y perfil",
    trigger: "webhook",
    criticality: "normal",
  },
  {
    name: "admin-briefing",
    displayName: "Briefing Diario Admin",
    domain: "analysis",
    description: "Resumen diario de leads, citas y métricas (7 AM COT)",
    trigger: "cron",
    schedule: "0 12 * * *",
    scheduleHuman: "diario 7:00 AM COT",
    criticality: "normal",
    runnable: sendAdminDailyBriefing,
  },

  // ─── Sincronización ──────────────────────────────────────────
  {
    name: "gmail-sync",
    displayName: "Sync Gmail",
    domain: "sync",
    description: "Sincroniza últimos 90 días de emails del inbox con CRM",
    trigger: "cron",
    schedule: "*/15 * * * *",
    scheduleHuman: "cada 15 minutos",
    criticality: "critical",
    runnable: syncGmailEmails,
  },
  {
    name: "substatus-updater",
    displayName: "Actualizador de Substatus",
    domain: "sync",
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
    domain: "sync",
    description: "Detecta tareas con dueDate pasado y crea notificaciones",
    trigger: "cron",
    schedule: "*/30 * * * *",
    scheduleHuman: "cada 30 minutos",
    criticality: "low",
    runnable: checkOverdueTasks,
  },
  {
    name: "post-meeting-recordings",
    displayName: "Procesador de Grabaciones",
    domain: "sync",
    description: "Descarga y procesa recordings de Google Meet post-reunión",
    trigger: "cron",
    schedule: "*/30 * * * *",
    scheduleHuman: "cada 30 minutos",
    criticality: "normal",
    runnable: processPostMeetingRecordings,
  },
  {
    name: "drive-file-sync",
    displayName: "Sync Drive → Proyectos",
    domain: "sync",
    description: "Sincroniza archivos de Google Drive a proyectos activos",
    trigger: "manual",
    criticality: "low",
  },

  // ─── Proyectos ───────────────────────────────────────────────
  {
    name: "github-webhook",
    displayName: "Webhook GitHub",
    domain: "projects",
    description: "Recibe push events y dispara análisis de commits con IA",
    trigger: "webhook",
    criticality: "normal",
  },
  {
    name: "commit-analyzer",
    displayName: "Analizador de Commits",
    domain: "projects",
    description: "Análisis automático diario de commits (6 AM COT)",
    trigger: "cron",
    schedule: "0 11 * * *",
    scheduleHuman: "diario 6:00 AM COT",
    criticality: "normal",
    runnable: autoAnalyzeProjectCommits,
  },
  {
    name: "weekly-summaries",
    displayName: "Resúmenes Semanales de Proyecto",
    domain: "projects",
    description: "Genera y envía resumen de progreso a clientes (lunes 7:15am)",
    trigger: "cron",
    schedule: "15 12 * * 1",
    scheduleHuman: "lunes 7:15 AM COT",
    criticality: "normal",
    runnable: sendWeeklyProjectSummaries,
  },

  // ─── Supervisores & Agentes IA avanzados (Fase 2) ────────────
  {
    name: "error-supervisor",
    displayName: "Supervisor de Errores",
    domain: "analysis",
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
    domain: "ai",
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
    domain: "ai",
    description: "Genera drafts de follow-up tras reuniones completadas y los envía al admin",
    trigger: "cron",
    schedule: "*/30 * * * *",
    scheduleHuman: "cada 30 minutos",
    criticality: "normal",
    runnable: runFollowupWriter,
  },

  {
    name: "email-classifier",
    displayName: "Clasificador de Emails",
    domain: "ai",
    description: "Valida relevancia de emails sincronizados con Claude Haiku. Auto-desvincula irrelevantes y notifica",
    trigger: "cron",
    schedule: "*/15 * * * *",
    scheduleHuman: "cada 15 min (integrado en Gmail sync)",
    criticality: "normal",
  },
  {
    name: "proposal-trash-purge",
    displayName: "Purga de Papelera de Propuestas",
    domain: "sync",
    description: "Elimina permanentemente propuestas con más de 30 días en la papelera",
    trigger: "cron",
    schedule: "0 8 * * *",
    scheduleHuman: "diario 3:00 AM COT",
    criticality: "low",
    runnable: purgeOldDeletedProposals,
  },

  // ─── Portal Analytics ────────────────────────────────────────
  {
    name: "analytics-sync",
    displayName: "Sync de Analytics (GA4)",
    domain: "analysis",
    description: "Pulla métricas diarias de GA4 para cada proyecto conectado (6 AM COT)",
    trigger: "cron",
    schedule: "0 11 * * *",
    scheduleHuman: "diario 6:00 AM COT",
    criticality: "normal",
    runnable: runAnalyticsSync,
  },
  {
    name: "analytics-monthly-report",
    displayName: "Resumen Mensual de Analytics",
    domain: "analysis",
    description: "Email mensual al cliente con resumen del mes anterior + magic link al dashboard (día 1, 9 AM COT)",
    trigger: "cron",
    schedule: "0 14 1 * *",
    scheduleHuman: "día 1 de cada mes, 9:00 AM COT",
    criticality: "normal",
    runnable: runAnalyticsMonthlyReport,
  },

  // ─── Contenido ───────────────────────────────────────────────
  {
    name: "blog-generator",
    displayName: "Generador de Blog",
    domain: "content",
    description: "Crea artículos nuevos desde un prompt/idea",
    trigger: "manual",
    criticality: "low",
  },
  {
    name: "blog-improver",
    displayName: "Mejorador de Blog",
    domain: "content",
    description: "Mejora contenido existente según instrucciones",
    trigger: "manual",
    criticality: "low",
  },
];

export function findAgent(name: string): AgentDefinition | undefined {
  return AGENT_REGISTRY.find((a) => a.name === name);
}
