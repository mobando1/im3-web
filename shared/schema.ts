import { sql } from "drizzle-orm";
import { pgTable, text, varchar, json, timestamp, boolean, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  githubAccessToken: text("github_access_token"),
  githubUsername: text("github_username"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Diagnostic form submissions — "Commit progresivo" (Fase 1 obligatoria + Fase 2 opcional)
export const diagnostics = pgTable("diagnostics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // ── FASE 1 (obligatoria) ──
  // Booking
  fechaCita: text("fecha_cita").notNull(),
  horaCita: text("hora_cita").notNull(),
  // Empresa
  empresa: text("empresa").notNull(),
  industria: text("industria").notNull(), // IndustriaValue enum; "otro" habilita industriaOtro
  industriaOtro: text("industria_otro"),
  empleados: text("empleados").notNull(),
  participante: text("participante").notNull(),
  email: text("email").notNull(),
  telefono: text("telefono"),
  // Prioridades
  areaPrioridad: json("area_prioridad").$type<string[]>().notNull(),
  presupuesto: text("presupuesto").notNull(),

  // ── FASE 2 (opcional, completable post-booking vía PATCH) ──
  objetivos: json("objetivos").$type<string[]>(),
  productos: text("productos"),
  volumenMensual: text("volumen_mensual"),
  canalesAdquisicion: json("canales_adquisicion").$type<string[]>(),
  herramientas: text("herramientas"),
  conectadas: text("conectadas"),
  nivelTech: text("nivel_tech"), // Mantenido por compatibilidad; usar valores de MADUREZ_TECH
  usaIA: text("usa_ia"),
  phase2CompletedAt: timestamp("phase2_completed_at"),

  // ── Columnas legacy (ya no se escriben desde el nuevo form; pendiente drop en migración separada) ──
  anosOperacion: text("anos_operacion"),
  ciudades: text("ciudades"),
  resultadoEsperado: text("resultado_esperado"),
  clientePrincipal: text("cliente_principal"),
  clientePrincipalOtro: text("cliente_principal_otro"),
  canalAdquisicionOtro: text("canal_adquisicion_otro"),
  canalPrincipal: text("canal_principal"),
  conectadasDetalle: text("conectadas_detalle"),
  usaIAParaQue: text("usa_ia_para_que"),
  comodidadTech: text("comodidad_tech"),
  familiaridad: json("familiaridad").$type<{
    automatizacion: string;
    crm: string;
    ia: string;
    integracion: string;
    desarrollo: string;
  }>(),

  // ── Metadata ──
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentToGhl: boolean("sent_to_ghl").default(false).notNull(),
  googleDriveUrl: text("google_drive_url"),
  meetLink: text("meet_link"),
  googleCalendarEventId: text("google_calendar_event_id"),
  meetingStatus: text("meeting_status").default("scheduled"), // scheduled | completed | no_show | cancelled
  meetingCompletedAt: timestamp("meeting_completed_at"),
  formDurationMinutes: integer("form_duration_minutes"),
});

export type Diagnostic = typeof diagnostics.$inferSelect;
export type InsertDiagnostic = typeof diagnostics.$inferInsert;

// Contacts (normalized from diagnostics for email sequences)
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  diagnosticId: varchar("diagnostic_id"),
  email: text("email").notNull(),
  nombre: text("nombre").notNull(),
  apellido: text("apellido"),
  empresa: text("empresa").notNull(),
  telefono: text("telefono"),
  status: text("status").notNull().default("lead"), // lead | contacted | scheduled | converted
  substatus: text("substatus"), // warm, cold, interested, no_response, proposal_sent, delivering, completed
  tags: json("tags").$type<string[]>().default([]),
  optedOut: boolean("opted_out").default(false).notNull(),
  idioma: varchar("idioma", { length: 5 }).default("es").notNull(),
  leadScore: integer("lead_score").default(0).notNull(),
  lastActivityAt: timestamp("last_activity_at"),
  driveFolderId: text("drive_folder_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// Additional email addresses associated with a contact (stakeholders, team members)
export const contactEmails = pgTable("contact_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull(),
  email: text("email").notNull(),
  nombre: text("nombre"), // name of the person (e.g. "Carlos - CTO")
  role: text("role"), // e.g. "CTO", "Gerente de Proyecto", "Asistente"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ContactEmail = typeof contactEmails.$inferSelect;
export type InsertContactEmail = typeof contactEmails.$inferInsert;

// Email templates (prompts for Claude API)
export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nombre: text("nombre").notNull(),
  subjectPrompt: text("subject_prompt").notNull(),
  bodyPrompt: text("body_prompt").notNull(),
  sequenceOrder: integer("sequence_order").notNull(),
  delayDays: integer("delay_days").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;

// Sent emails (tracking every email sent)
// contactId is nullable: admin notifications (template_id="admin-notification") may not be tied to a contact
export const sentEmails = pgTable("sent_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id"),
  templateId: varchar("template_id").notNull(),
  subject: text("subject"),
  body: text("body"),
  status: text("status").notNull().default("pending"), // pending | sent | opened | clicked | bounced | failed
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  resendMessageId: text("resend_message_id"),
  retryCount: integer("retry_count").default(0).notNull(),
});

export type SentEmail = typeof sentEmails.$inferSelect;
export type InsertSentEmail = typeof sentEmails.$inferInsert;

// Abandoned leads (email captured but form not completed)
export const abandonedLeads = pgTable("abandoned_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
  converted: boolean("converted").default(false).notNull(),
  emailSent: boolean("email_sent").default(false).notNull(),
});

export type AbandonedLead = typeof abandonedLeads.$inferSelect;

// Newsletter subscribers
export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"),
  isActive: boolean("is_active").default(true).notNull(),
});

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;

// Newsletter sends (tracks daily digest emails)
export const newsletterSends = pgTable("newsletter_sends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  blogPostId: varchar("blog_post_id"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  recipientCount: integer("recipient_count").default(0),
  status: text("status").notNull().default("sent"),
});

export type NewsletterSend = typeof newsletterSends.$inferSelect;

// Contact notes (internal CRM notes)
export const contactNotes = pgTable("contact_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull(),
  content: text("content").notNull(),
  authorId: varchar("author_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ContactNote = typeof contactNotes.$inferSelect;
export type InsertContactNote = typeof contactNotes.$inferInsert;

// Tasks (follow-up reminders)
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id"),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  priority: text("priority").notNull().default("medium"), // low | medium | high
  status: text("status").notNull().default("pending"), // pending | completed
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// Activity log (audit trail for contact journey)
export const activityLog = pgTable("activity_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull(),
  type: text("type").notNull(), // form_submitted | status_changed | email_sent | email_opened | email_clicked | email_bounced | note_added | note_deleted | contact_edited | task_created | task_completed | score_changed | opted_out
  description: text("description").notNull(),
  metadata: json("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ActivityLogEntry = typeof activityLog.$inferSelect;

// AI insights cache (per-contact AI analysis)
export const aiInsightsCache = pgTable("ai_insights_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().unique(),
  insight: json("insight").$type<{
    summary: string;
    nextActions: string[];
    talkingPoints: string[];
    riskLevel: string;
    riskReason: string;
    estimatedValue: string;
  }>().notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export type AiInsightCache = typeof aiInsightsCache.$inferSelect;

// Deals / Opportunities (revenue tracking)
export const deals = pgTable("deals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull(),
  title: text("title").notNull(),
  value: integer("value"), // in USD
  stage: text("stage").notNull().default("qualification"), // qualification | proposal | negotiation | closed_won | closed_lost
  lostReason: text("lost_reason"),
  expectedCloseDate: timestamp("expected_close_date"),
  closedAt: timestamp("closed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Deal = typeof deals.$inferSelect;
export type InsertDeal = typeof deals.$inferInsert;

// In-app notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // new_lead | email_opened | hot_lead | task_overdue | deal_stage_changed | email_clicked
  title: text("title").notNull(),
  description: text("description"),
  contactId: varchar("contact_id"),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;

// Appointments (manually created meetings)
export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id"),
  clientProjectId: varchar("client_project_id"), // vincula reuniones recurrentes a un proyecto del portal del cliente
  title: text("title").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  time: text("time").notNull(), // HH:MM or HH:MM AM/PM
  duration: integer("duration").notNull().default(45), // minutes
  notes: text("notes"),
  meetLink: text("meet_link"),
  googleCalendarEventId: text("google_calendar_event_id"),
  status: text("status").default("scheduled"), // scheduled | completed | no_show | cancelled
  completedAt: timestamp("completed_at"),
  recordingUrl: text("recording_url"),
  transcriptUrl: text("transcript_url"),
  appointmentType: text("appointment_type").default("manual"), // initial | follow_up | manual | project_meeting
  parentAppointmentId: varchar("parent_appointment_id"),
  prepSentAt: timestamp("prep_sent_at"),
  followupDraftedAt: timestamp("followup_drafted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

// Blog categories
export const blogCategories = pgTable("blog_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BlogCategory = typeof blogCategories.$inferSelect;
export type InsertBlogCategory = typeof blogCategories.$inferInsert;

export const insertBlogCategorySchema = createInsertSchema(blogCategories).pick({
  name: true,
  slug: true,
  description: true,
});

// Blog posts
export const blogPosts = pgTable("blog_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(),
  categoryId: varchar("category_id"),
  tags: json("tags").$type<string[]>().default([]),
  references: json("references").$type<Array<{ title: string; url: string; author?: string; date?: string }>>().default([]),
  featuredImageUrl: text("featured_image_url"),
  authorName: text("author_name").notNull().default("Equipo IM3"),
  status: text("status").notNull().default("draft"),
  language: text("language").notNull().default("es"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  readTimeMinutes: integer("read_time_minutes").default(5),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// WhatsApp messages (automated sequence + manual sends)
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull(),
  phone: text("phone").notNull(),
  message: text("message").notNull(),
  templateName: text("template_name"), // Meta-approved template name (null = free-form within 24h window)
  templateParams: json("template_params").$type<Record<string, string>>(),
  mediaUrl: text("media_url"), // Voice note or image URL
  mediaType: text("media_type"), // audio | image | document
  status: text("status").notNull().default("pending"), // pending | sent | delivered | read | failed
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  whatsappMessageId: text("whatsapp_message_id"), // Meta API message ID
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0).notNull(),
  conditionType: text("condition_type"), // null | "if_email_not_opened" — skip this WA if linked email was opened
  conditionEmailTemplate: text("condition_email_template"), // template name to check (e.g., "mini_auditoria", "reengagement")
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WhatsAppMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsAppMessage = typeof whatsappMessages.$inferInsert;

// ───────────────────────────────────────────────────────────────
// Portal del Cliente — Proyectos de desarrollo
// ───────────────────────────────────────────────────────────────

export const clientProjects = pgTable("client_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id"), // FK contacts (nullable)
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("planning"), // planning | in_progress | paused | completed | cancelled
  startDate: timestamp("start_date"),
  estimatedEndDate: timestamp("estimated_end_date"),
  actualEndDate: timestamp("actual_end_date"),
  totalBudget: integer("total_budget"), // in USD
  currency: varchar("currency", { length: 3 }).default("USD"),
  accessToken: varchar("access_token").default(sql`gen_random_uuid()`).notNull().unique(),
  // Project type — distingue scope fijo (cliente) vs evolutivo (interno IM3)
  projectType: text("project_type").default("client").notNull(), // client | internal
  // Health & AI tracking
  healthStatus: text("health_status").default("on_track"), // on_track | at_risk | behind | ahead
  healthNote: text("health_note"),
  githubRepoUrl: text("github_repo_url"),
  githubWebhookSecret: text("github_webhook_secret"),
  aiTrackingEnabled: boolean("ai_tracking_enabled").default(false).notNull(),
  lastWeeklySummaryAt: timestamp("last_weekly_summary_at"),
  driveFolderId: text("drive_folder_id"),
  // Origen del proyecto — para auditar bulk imports y diferenciarlos de creaciones manuales
  createdFrom: text("created_from").default("manual").notNull(), // manual | proposal | import
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ClientProject = typeof clientProjects.$inferSelect;
export type InsertClientProject = typeof clientProjects.$inferInsert;

export const insertClientProjectSchema = createInsertSchema(clientProjects).omit({
  id: true,
  accessToken: true,
  createdAt: true,
  updatedAt: true,
});

export const projectPhases = pgTable("project_phases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | in_progress | completed
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  estimatedHours: integer("estimated_hours"),
  // Soft delete: nulls = active; timestamp = removed but recoverable via /restore endpoint.
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ProjectPhase = typeof projectPhases.$inferSelect;
export type InsertProjectPhase = typeof projectPhases.$inferInsert;

export const insertProjectPhaseSchema = createInsertSchema(projectPhases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const projectTasks = pgTable("project_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phaseId: varchar("phase_id").notNull(),
  projectId: varchar("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  clientFacingTitle: text("client_facing_title"), // shown to client instead of title
  clientFacingDescription: text("client_facing_description"), // plain-language explanation
  status: text("status").notNull().default("pending"), // pending | in_progress | completed | blocked
  priority: text("priority").notNull().default("medium"), // low | medium | high
  assigneeName: text("assignee_name"), // free-text owner (no relation to users table)
  startDate: timestamp("start_date"),
  dueDate: timestamp("due_date"),
  isMilestone: boolean("is_milestone").default(false).notNull(),
  estimatedHours: integer("estimated_hours"),
  actualHours: numeric("actual_hours", { precision: 6, scale: 2 }),
  orderIndex: integer("order_index").notNull().default(0),
  completedAt: timestamp("completed_at"),
  // Soft delete: cascaded from phase delete or set independently when a task is removed.
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ProjectTask = typeof projectTasks.$inferSelect;
export type InsertProjectTask = typeof projectTasks.$inferInsert;

export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const projectDeliverables = pgTable("project_deliverables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  phaseId: varchar("phase_id"),
  taskId: varchar("task_id"),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("feature"), // feature | bugfix | design | document | video | other
  status: text("status").notNull().default("pending"), // pending | delivered | approved | rejected
  deliveredAt: timestamp("delivered_at"),
  approvedAt: timestamp("approved_at"),
  clientComment: text("client_comment"),
  clientRating: integer("client_rating"), // 1-5 stars
  screenshotUrl: text("screenshot_url"),
  demoUrl: text("demo_url"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProjectDeliverable = typeof projectDeliverables.$inferSelect;
export type InsertProjectDeliverable = typeof projectDeliverables.$inferInsert;

export const insertProjectDeliverableSchema = createInsertSchema(projectDeliverables).omit({
  id: true,
  createdAt: true,
});

export const projectTimeLog = pgTable("project_time_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  taskId: varchar("task_id"),
  description: text("description").notNull(),
  hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  category: text("category").notNull().default("development"), // development | design | meeting | support | planning
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProjectTimeLogEntry = typeof projectTimeLog.$inferSelect;
export type InsertProjectTimeLog = typeof projectTimeLog.$inferInsert;

export const insertProjectTimeLogSchema = createInsertSchema(projectTimeLog).omit({
  id: true,
  createdAt: true,
});

export const projectMessages = pgTable("project_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  senderType: text("sender_type").notNull(), // team | client
  senderName: text("sender_name").notNull(),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProjectMessage = typeof projectMessages.$inferSelect;
export type InsertProjectMessage = typeof projectMessages.$inferInsert;

export const insertProjectMessageSchema = createInsertSchema(projectMessages).omit({
  id: true,
  createdAt: true,
});

// Project activity entries (AI-generated from GitHub webhooks)
export const projectActivityEntries = pgTable("project_activity_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  taskId: varchar("task_id"),
  phaseId: varchar("phase_id"),
  source: text("source").notNull().default("manual"), // manual | github_webhook | system
  commitShas: json("commit_shas").$type<string[]>().default([]),
  summaryLevel1: text("summary_level1").notNull(), // 1 line, always visible
  summaryLevel2: text("summary_level2"), // paragraph, visible on expand
  summaryLevel3: text("summary_level3"), // full detail, hidden by default
  category: text("category").notNull().default("feature"), // feature | bugfix | improvement | infrastructure | meeting | milestone
  aiGenerated: boolean("ai_generated").default(false).notNull(),
  isSignificant: boolean("is_significant").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProjectActivityEntry = typeof projectActivityEntries.$inferSelect;
export type InsertProjectActivityEntry = typeof projectActivityEntries.$inferInsert;

// GitHub webhook events (raw storage for audit trail)
export const githubWebhookEvents = pgTable("github_webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  processed: boolean("processed").default(false).notNull(),
  activityEntryId: varchar("activity_entry_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type GithubWebhookEvent = typeof githubWebhookEvents.$inferSelect;

// Project sessions (meeting recordings & transcriptions)
export const projectSessions = pgTable("project_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  contactId: varchar("contact_id"),
  title: text("title").notNull(),
  date: timestamp("date").notNull(),
  duration: integer("duration"), // minutes
  recordingUrl: text("recording_url"),
  transcription: text("transcription"),
  summary: text("summary"),
  actionItems: json("action_items").$type<string[]>().default([]),
  speakers: json("speakers").$type<string[]>().default([]),
  status: text("status").notNull().default("ready"), // recording|processing|ready
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProjectSession = typeof projectSessions.$inferSelect;

// Project files (documents, contracts, designs, etc.)
export const projectFiles = pgTable("project_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  sessionId: varchar("session_id"),
  name: text("name").notNull(),
  type: text("type").notNull().default("other"), // document|contract|image|recording|transcript|design|other
  url: text("url").notNull(),
  size: integer("size"), // bytes
  uploadedBy: text("uploaded_by").default("team"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProjectFile = typeof projectFiles.$inferSelect;

// Project ideas (feature suggestions & voting)
export const projectIdeas = pgTable("project_ideas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").default("medium"), // low|medium|high
  status: text("status").default("suggested"), // suggested|considering|planned|implemented|dismissed
  suggestedBy: text("suggested_by").default("team"), // team|client
  votes: integer("votes").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProjectIdea = typeof projectIdeas.$inferSelect;

// ───────────────────────────────────────────────────────────────
// Commercial Proposals
// ───────────────────────────────────────────────────────────────

export const proposals = pgTable("proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"), // draft | sent | viewed | accepted | rejected | expired
  // sections puede ser:
  //  - Legacy: Record<string, string> (HTML strings)
  //  - Nuevo: ProposalData completo (ver shared/proposal-template/types.ts)
  sections: json("sections").$type<Record<string, unknown>>().default({}),
  pricing: json("pricing").$type<{
    options: Array<{ name: string; price: number; features: string[]; recommended: boolean }>;
    currency: string;
    paymentOptions: string[];
  }>(),
  timelineData: json("timeline_data").$type<{
    phases: Array<{ name: string; weeks: number; deliverables: string[] }>;
    totalWeeks: number;
  }>(),
  notes: text("notes"), // internal admin notes
  aiSourcesReport: json("ai_sources_report").$type<Record<string, string[]>>(), // AI traceability: section → sources
  accessToken: varchar("access_token").default(sql`gen_random_uuid()`).notNull().unique(),
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  acceptedAt: timestamp("accepted_at"),
  acceptedBy: text("accepted_by"),
  acceptedOption: text("accepted_option"),
  acceptanceDetails: json("acceptance_details").$type<Record<string, unknown>>(),
  expiresAt: timestamp("expires_at"),
  // Soft-delete: si tiene valor, la propuesta está en la papelera. Se purga después de 30 días.
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;

// Memoria global del chat de propuestas — hechos extraídos de TODAS las
// conversaciones, cross-proposal y cross-client. Cada vez que el admin habla
// con el chat de cualquier propuesta, un extractor saca insights ("cuando
// el cliente es de logística, prefiere X", "no usamos Y nunca", etc.) y los
// guarda aquí. Se inyectan como contexto en TODOS los chats futuros.
export const chatGlobalMemory = pgTable("chat_global_memory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Categoría: "preference" (ej. "preferimos Drizzle"), "constraint" (ej. "no usamos Firebase"),
  // "pattern" (ej. "para logística, módulos de asistencia siempre primero"),
  // "person" (ej. "Carlos prefiere comunicación directa"),
  // "client_history" (ej. "APP Logistics aceptó timeline de 16 sem"), "other".
  category: text("category").notNull(),
  // Texto natural del aprendizaje (1-2 oraciones). Es lo que se inyecta al prompt.
  fact: text("fact").notNull(),
  // 0-100. Sube cuando se reitera, baja cuando contradice.
  confidence: integer("confidence").default(50).notNull(),
  // De qué propuesta(s) y mensaje(s) salió este hecho — auditoría.
  sourceProposalIds: json("source_proposal_ids").$type<string[]>().default([]),
  // Cuántas veces se ha mencionado/reiterado en distintos chats.
  reinforcedCount: integer("reinforced_count").default(1).notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ChatGlobalMemory = typeof chatGlobalMemory.$inferSelect;
export type InsertChatGlobalMemory = typeof chatGlobalMemory.$inferInsert;

// Preferencias y aprendizajes de la organización (memoria entre propuestas).
// Después de cada propuesta cerrada (accepted/rejected), un agente extrae
// lecciones: stack preferido, rangos de precios que funcionan, frases que
// el cliente apreció. Se inyectan como contexto en el chat y generador.
export const orgPreferences = pgTable("org_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull(), // ej. "preferred_stack", "winning_price_range_smb"
  value: text("value").notNull(),
  source: text("source").notNull(), // "explicit" (admin la fijó) | "inferred" (extraída de propuestas)
  confidence: integer("confidence").default(50).notNull(), // 0-100
  // De qué propuesta(s) salió esta preferencia (para auditoría)
  derivedFromProposalIds: json("derived_from_proposal_ids").$type<string[]>().default([]),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type OrgPreference = typeof orgPreferences.$inferSelect;
export type InsertOrgPreference = typeof orgPreferences.$inferInsert;

// Snapshots de propuesta antes de cada cambio del chat — permite undo del chat
export const proposalSnapshots = pgTable("proposal_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id").notNull(),
  // Snapshot completo del campo `sections` antes del cambio
  sections: json("sections").$type<Record<string, unknown>>().notNull(),
  // Mensaje del chat que disparó este cambio (para mostrar "deshacer este cambio del chat")
  triggeredByMessageId: varchar("triggered_by_message_id"),
  // Resumen humano del cambio aplicado (de toolCall.summary)
  changeSummary: text("change_summary"),
  // Sección que se modificó (si fue update_section específico)
  sectionKey: text("section_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProposalSnapshot = typeof proposalSnapshots.$inferSelect;
export type InsertProposalSnapshot = typeof proposalSnapshots.$inferInsert;

// Chat de refinamiento por propuesta (Fase 1: assistant para ajustar secciones)
export const proposalChatMessages = pgTable("proposal_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  // Si Claude usó tools, registra las modificaciones aplicadas (para mostrar al usuario)
  toolCalls: json("tool_calls").$type<Array<{ tool: string; section?: string; summary: string }>>(),
  // Archivos adjuntos por el usuario en este mensaje. Si están en Drive, driveFileId
  // permite re-fetchear en turnos siguientes para que Claude los siga viendo.
  attachments: json("attachments").$type<Array<{
    name: string;
    mime: string;
    size: number;
    driveFileId?: string;
    url?: string;
  }>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProposalChatMessage = typeof proposalChatMessages.$inferSelect;
export type InsertProposalChatMessage = typeof proposalChatMessages.$inferInsert;

export const proposalViews = pgTable("proposal_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id").notNull(),
  section: text("section"),
  timeSpent: integer("time_spent"), // seconds
  device: text("device"), // mobile | desktop
  ip: text("ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProposalView = typeof proposalViews.$inferSelect;

// ───────────────────────────────────────────────────────────────
// Proposal Briefs — material de soporte detallado post-reunión
// Documento hermano de proposals (1:1) que se envía DESPUÉS de la
// presentación de la propuesta inicial. Profundiza cada módulo con:
// qué problema resuelve, cómo funciona, en qué parte de la reunión
// surgió, ejemplos concretos, qué pasaría si no se hace.
// La inicial vive corta y vendedora; el brief vive largo y didáctico.
// ───────────────────────────────────────────────────────────────
export const proposalBriefs = pgTable("proposal_briefs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id").notNull().unique(), // 1:1 con proposals
  contactId: varchar("contact_id").notNull(),            // redundante para queries directas
  title: text("title"),
  // ProposalBriefData (ver shared/proposal-template/types.ts)
  sections: json("sections").$type<Record<string, unknown>>().default({}),
  status: text("status").notNull().default("not_generated"), // not_generated | draft | ready | sent
  accessToken: varchar("access_token").default(sql`gen_random_uuid()`).notNull().unique(),
  aiSourcesReport: json("ai_sources_report").$type<Record<string, string[]>>(),
  notes: text("notes"),
  // Marca el brief como desactualizado si la propuesta inicial cambia tras generarlo
  outdatedSinceProposalUpdate: timestamp("outdated_since_proposal_update"),
  generatedAt: timestamp("generated_at"),
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  expiresAt: timestamp("expires_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ProposalBrief = typeof proposalBriefs.$inferSelect;
export type InsertProposalBrief = typeof proposalBriefs.$inferInsert;

// Snapshots del brief antes de cada cambio del chat — undo del chat IA
export const proposalBriefSnapshots = pgTable("proposal_brief_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  briefId: varchar("brief_id").notNull(),
  sections: json("sections").$type<Record<string, unknown>>().notNull(),
  triggeredByMessageId: varchar("triggered_by_message_id"),
  changeSummary: text("change_summary"),
  moduleKey: text("module_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProposalBriefSnapshot = typeof proposalBriefSnapshots.$inferSelect;
export type InsertProposalBriefSnapshot = typeof proposalBriefSnapshots.$inferInsert;

// Chat IA del brief — historial separado del chat de proposals
export const proposalBriefChatMessages = pgTable("proposal_brief_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  briefId: varchar("brief_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  toolCalls: json("tool_calls").$type<Array<{ tool: string; module?: string; summary: string }>>(),
  attachments: json("attachments").$type<Array<{
    name: string;
    mime: string;
    size: number;
    driveFileId?: string;
    url?: string;
  }>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProposalBriefChatMessage = typeof proposalBriefChatMessages.$inferSelect;
export type InsertProposalBriefChatMessage = typeof proposalBriefChatMessages.$inferInsert;

// Analytics de visualización del brief público
export const proposalBriefViews = pgTable("proposal_brief_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  briefId: varchar("brief_id").notNull(),
  module: text("module"),
  timeSpent: integer("time_spent"),
  device: text("device"),
  ip: text("ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProposalBriefView = typeof proposalBriefViews.$inferSelect;

// ───────────────────────────────────────────────────────────────
// Gmail Email Sync
// ───────────────────────────────────────────────────────────────

export const gmailEmails = pgTable("gmail_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gmailMessageId: text("gmail_message_id").notNull().unique(),
  gmailThreadId: text("gmail_thread_id"),
  contactId: varchar("contact_id"), // nullable — unmatched emails still stored
  direction: text("direction").notNull(), // "inbound" | "outbound"
  fromEmail: text("from_email").notNull(),
  toEmails: json("to_emails").$type<string[]>().default([]),
  subject: text("subject"),
  bodyText: text("body_text"), // plain text for AI context
  bodyHtml: text("body_html"), // HTML for UI rendering
  snippet: text("snippet"),
  labelIds: json("label_ids").$type<string[]>().default([]),
  hasAttachments: boolean("has_attachments").default(false).notNull(),
  gmailDate: timestamp("gmail_date").notNull(),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
  matchMethod: text("match_method"), // "exact" | "associated" | "domain" | "manual" | null
  manuallyUnlinked: boolean("manually_unlinked").default(false).notNull(),
});

export type GmailEmail = typeof gmailEmails.$inferSelect;
export type InsertGmailEmail = typeof gmailEmails.$inferInsert;

export const gmailSyncState = pgTable("gmail_sync_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  lastHistoryId: text("last_history_id"),
  lastSyncAt: timestamp("last_sync_at"),
  lastFullSyncAt: timestamp("last_full_sync_at"),
});

export type GmailSyncState = typeof gmailSyncState.$inferSelect;

// ───────────────────────────────────────────────────────────────
// Contact Files / Documents
// ───────────────────────────────────────────────────────────────

export const contactFiles = pgTable("contact_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("documento"), // contrato | propuesta | auditoria | documento | imagen | otro
  url: text("url").notNull(),
  size: integer("size"), // bytes
  content: text("content"), // text content for AI context (pasted or synced from Drive)
  driveFileId: text("drive_file_id"), // Google Drive file ID for auto-sync
  uploadedBy: text("uploaded_by").default("team"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ContactFile = typeof contactFiles.$inferSelect;
export type InsertContactFile = typeof contactFiles.$inferInsert;

// ───────────────────────────────────────────────────────────────
// Agent Runs — ejecución de cron jobs, servicios IA, webhooks
// ───────────────────────────────────────────────────────────────

export const agentRuns = pgTable("agent_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentName: text("agent_name").notNull(),
  status: text("status").notNull(), // running | success | error
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  recordsProcessed: integer("records_processed").default(0),
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  triggeredBy: text("triggered_by").default("cron").notNull(), // cron | manual | webhook | startup
  supervisorAnalyzedAt: timestamp("supervisor_analyzed_at"),
});

export type AgentRun = typeof agentRuns.$inferSelect;
export type InsertAgentRun = typeof agentRuns.$inferInsert;

// ───────────────────────────────────────────────────────────────
// Portal de Clientes — Auth (login + reset password + invite)
// ───────────────────────────────────────────────────────────────

// Cuentas de cliente que pueden loguearse al portal
export const clientUsers = pgTable("client_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(), // siempre lowercase
  passwordHash: text("password_hash"), // null hasta que acepte invite
  name: text("name"),
  status: text("status").notNull().default("invited"), // invited | active | disabled
  invitedAt: timestamp("invited_at").defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ClientUser = typeof clientUsers.$inferSelect;
export type InsertClientUser = typeof clientUsers.$inferInsert;

// Junction M:N entre cuentas de cliente y proyectos
export const clientUserProjects = pgTable("client_user_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientUserId: varchar("client_user_id").notNull(),
  clientProjectId: varchar("client_project_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientUserProject = typeof clientUserProjects.$inferSelect;
export type InsertClientUserProject = typeof clientUserProjects.$inferInsert;

// Invites enviadas por admin a clientes
export const clientInvites = pgTable("client_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(), // lowercase
  token: varchar("token").notNull().unique().default(sql`gen_random_uuid()`),
  clientProjectId: varchar("client_project_id"), // proyecto a auto-vincular al aceptar
  invitedByUserId: varchar("invited_by_user_id"), // FK -> users.id (admin que invitó)
  expiresAt: timestamp("expires_at").notNull(), // default now() + 7 días, set en runtime
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientInvite = typeof clientInvites.$inferSelect;
export type InsertClientInvite = typeof clientInvites.$inferInsert;

// Tokens de reset de password
export const clientPasswordResets = pgTable("client_password_resets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientUserId: varchar("client_user_id").notNull(),
  token: varchar("token").notNull().unique().default(sql`gen_random_uuid()`),
  expiresAt: timestamp("expires_at").notNull(), // default now() + 1 hora, set en runtime
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientPasswordReset = typeof clientPasswordResets.$inferSelect;
export type InsertClientPasswordReset = typeof clientPasswordResets.$inferInsert;

// Reportes / sugerencias del cliente — bugs, cambios solicitados, ideas con attachments
// Se diferencia de project_messages (chat) y project_ideas (suggestions con voto)
// porque permite triage formal (status, priority) + adjuntos + conversión a task.
export const projectFeedback = pgTable("project_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  type: text("type").notNull(), // bug | request | improvement | question
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: text("priority").default("normal").notNull(), // low | normal | high | urgent
  status: text("status").default("open").notNull(), // open | triaged | in_progress | resolved | wont_fix
  attachmentUrls: json("attachment_urls").$type<string[]>().default([]),
  createdBy: text("created_by"), // "client" | "admin"
  reporterName: text("reporter_name"), // nombre opcional para identificar quién reportó
  adminResponse: text("admin_response"),
  resolvedTaskId: varchar("resolved_task_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export type ProjectFeedback = typeof projectFeedback.$inferSelect;
export type InsertProjectFeedback = typeof projectFeedback.$inferInsert;

// ───────────────────────────────────────────────────────────────
// Portal del Cliente — Analytics (Google Analytics 4)
// ───────────────────────────────────────────────────────────────

// Conexión 1:1 entre proyecto y propiedad GA4 del cliente.
// El cliente es propietario del GA4; nuestro service account está agregado como Viewer.
export const clientAnalyticsConnections = pgTable("client_analytics_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientProjectId: varchar("client_project_id").notNull().unique(),
  ga4PropertyId: varchar("ga4_property_id").notNull(), // solo el ID numérico, ej "535230812"
  propertyTimezone: varchar("property_timezone", { length: 64 }), // ej "America/Bogota" — devuelto por GA en metadata
  status: text("status").notNull().default("pending"), // pending | connected | error
  lastSyncedAt: timestamp("last_synced_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ClientAnalyticsConnection = typeof clientAnalyticsConnections.$inferSelect;
export type InsertClientAnalyticsConnection = typeof clientAnalyticsConnections.$inferInsert;

// Métricas agregadas por día — la fuente de verdad para el dashboard del portal.
// El sync diario inserta una row por (project, date). Backfill al conectar pulla 30 días.
export const clientAnalyticsDaily = pgTable("client_analytics_daily", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientProjectId: varchar("client_project_id").notNull(),
  date: text("date").notNull(), // formato YYYY-MM-DD (zona horaria de la propiedad GA4)
  sessions: integer("sessions").default(0).notNull(),
  users: integer("users").default(0).notNull(),
  newUsers: integer("new_users").default(0).notNull(),
  pageviews: integer("pageviews").default(0).notNull(),
  avgSessionDuration: numeric("avg_session_duration", { precision: 10, scale: 2 }).default("0").notNull(), // segundos
  bounceRate: numeric("bounce_rate", { precision: 5, scale: 4 }).default("0").notNull(), // 0..1
  topPages: json("top_pages").$type<Array<{ path: string; pageviews: number }>>().default([]),
  topSources: json("top_sources").$type<Array<{ source: string; sessions: number }>>().default([]),
  topCountries: json("top_countries").$type<Array<{ country: string; users: number }>>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientAnalyticsDaily = typeof clientAnalyticsDaily.$inferSelect;
export type InsertClientAnalyticsDaily = typeof clientAnalyticsDaily.$inferInsert;

// Magic-link tokens — acceso passwordless desde notificaciones / "enviarme un link"
// Single-use, TTL corto. El token se genera con gen_random_uuid() y se valida contra DB.
export const clientMagicTokens = pgTable("client_magic_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientUserId: varchar("client_user_id").notNull(),
  clientProjectId: varchar("client_project_id"), // proyecto al que redirigir tras login (opcional)
  token: varchar("token").notNull().unique().default(sql`gen_random_uuid()`),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientMagicToken = typeof clientMagicTokens.$inferSelect;
export type InsertClientMagicToken = typeof clientMagicTokens.$inferInsert;
