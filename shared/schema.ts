import { sql } from "drizzle-orm";
import { pgTable, text, varchar, json, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Diagnostic form submissions
export const diagnostics = pgTable("diagnostics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Step 0 — Cita
  fechaCita: text("fecha_cita").notNull(),
  horaCita: text("hora_cita").notNull(),
  // Step 1 — Información General
  empresa: text("empresa").notNull(),
  industria: text("industria").notNull(),
  anosOperacion: text("anos_operacion").notNull(),
  empleados: text("empleados").notNull(),
  ciudades: text("ciudades").notNull(),
  participante: text("participante").notNull(),
  email: text("email").notNull(),
  telefono: text("telefono"),
  // Step 2 — Contexto
  objetivos: json("objetivos").$type<string[]>().notNull(),
  resultadoEsperado: text("resultado_esperado").notNull(),
  // Step 3 — Modelo de negocio
  productos: text("productos").notNull(),
  volumenMensual: text("volumen_mensual").notNull(),
  clientePrincipal: text("cliente_principal").notNull(),
  clientePrincipalOtro: text("cliente_principal_otro"),
  // Step 4 — Adquisición
  canalesAdquisicion: json("canales_adquisicion").$type<string[]>().notNull(),
  canalAdquisicionOtro: text("canal_adquisicion_otro"),
  canalPrincipal: text("canal_principal").notNull(),
  // Step 5 — Herramientas
  herramientas: text("herramientas").notNull(),
  conectadas: text("conectadas").notNull(),
  conectadasDetalle: text("conectadas_detalle"),
  // Step 6 — Madurez tecnológica
  nivelTech: text("nivel_tech").notNull(),
  usaIA: text("usa_ia").notNull(),
  usaIAParaQue: text("usa_ia_para_que"),
  comodidadTech: text("comodidad_tech").notNull(),
  familiaridad: json("familiaridad").$type<{
    automatizacion: string;
    crm: string;
    ia: string;
    integracion: string;
    desarrollo: string;
  }>().notNull(),
  // Step 7 — Prioridades
  areaPrioridad: json("area_prioridad").$type<string[]>().notNull(),
  presupuesto: text("presupuesto").notNull(),
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentToGhl: boolean("sent_to_ghl").default(false).notNull(),
  googleDriveUrl: text("google_drive_url"),
  meetLink: text("meet_link"),
});

export type Diagnostic = typeof diagnostics.$inferSelect;
export type InsertDiagnostic = typeof diagnostics.$inferInsert;

// Contacts (normalized from diagnostics for email sequences)
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  diagnosticId: varchar("diagnostic_id"),
  email: text("email").notNull(),
  nombre: text("nombre").notNull(),
  empresa: text("empresa").notNull(),
  telefono: text("telefono"),
  status: text("status").notNull().default("lead"), // lead | contacted | scheduled | converted
  substatus: text("substatus"), // warm, cold, interested, no_response, proposal_sent, delivering, completed
  tags: json("tags").$type<string[]>().default([]),
  optedOut: boolean("opted_out").default(false).notNull(),
  leadScore: integer("lead_score").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

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
export const sentEmails = pgTable("sent_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull(),
  templateId: varchar("template_id").notNull(),
  subject: text("subject"),
  body: text("body"),
  status: text("status").notNull().default("pending"), // pending | sent | opened | clicked | bounced | failed
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
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
  title: text("title").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  time: text("time").notNull(), // HH:MM or HH:MM AM/PM
  duration: integer("duration").notNull().default(45), // minutes
  notes: text("notes"),
  meetLink: text("meet_link"),
  googleCalendarEventId: text("google_calendar_event_id"),
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
