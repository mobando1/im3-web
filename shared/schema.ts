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
  diagnosticId: varchar("diagnostic_id").notNull(),
  email: text("email").notNull(),
  nombre: text("nombre").notNull(),
  empresa: text("empresa").notNull(),
  telefono: text("telefono"),
  status: text("status").notNull().default("lead"), // lead | contacted | scheduled | converted
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
