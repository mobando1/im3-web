import { sql } from "drizzle-orm";
import { pgTable, text, varchar, json, timestamp, boolean } from "drizzle-orm/pg-core";
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
});

export type Diagnostic = typeof diagnostics.$inferSelect;
export type InsertDiagnostic = typeof diagnostics.$inferInsert;
