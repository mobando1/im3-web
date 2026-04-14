import { z } from "zod";
import { INDUSTRIA_VALUES } from "@shared/industrias";

// ═══════════════════════════════════════════════════════════════
// FASE 1 — Obligatoria (booking)
// ═══════════════════════════════════════════════════════════════

// Step 0 — Email + Agendar Cita
export const phase1Step0Schema = z.object({
  email: z.string().email("Ingrese un email válido"),
  fechaCita: z.string().min(1, "Seleccione una fecha"),
  horaCita: z.string().min(1, "Seleccione un horario"),
});

// Step 1 — Tu empresa
export const phase1Step1Schema = z
  .object({
    participante: z.string().min(1, "Requerido"),
    empresa: z.string().min(1, "Requerido"),
    telefono: z.string().min(1, "El teléfono es obligatorio"),
    industria: z.enum(INDUSTRIA_VALUES, { errorMap: () => ({ message: "Seleccione una industria" }) }),
    industriaOtro: z.string().optional(),
    empleados: z.string().min(1, "Seleccione una opción"),
  })
  .refine(
    (data) => data.industria !== "otro" || (data.industriaOtro && data.industriaOtro.trim().length > 0),
    { message: "Especifique cuál", path: ["industriaOtro"] }
  );

// Step 2 — Qué buscas
export const phase1Step2Schema = z.object({
  areaPrioridad: z.array(z.string()).min(1, "Seleccione al menos una opción"),
  presupuesto: z.string().min(1, "Seleccione una opción"),
});

// ═══════════════════════════════════════════════════════════════
// FASE 2 — Opcional (profundización post-booking)
// ═══════════════════════════════════════════════════════════════

// Phase 2 Step 0 — Tu operación (todos opcionales)
export const phase2Step0Schema = z.object({
  objetivos: z.array(z.string()).optional().default([]),
  productos: z.string().optional().default(""),
  volumenMensual: z.string().optional().default(""),
  canalesAdquisicion: z.array(z.string()).optional().default([]),
});

// Phase 2 Step 1 — Tu stack y madurez (todos opcionales)
export const phase2Step1Schema = z.object({
  herramientas: z.array(z.string()).optional().default([]),
  herramientasOtras: z.string().optional().default(""),
  conectadas: z.string().optional().default(""),
  madurezTech: z.string().optional().default(""),
  usaIA: z.string().optional().default(""),
});

// ═══════════════════════════════════════════════════════════════
// Combined types
// ═══════════════════════════════════════════════════════════════

export const phase1Schema = z.object({
  ...phase1Step0Schema.shape,
  ...phase1Step1Schema._def.schema.shape,
  ...phase1Step2Schema.shape,
});

export const phase2Schema = z.object({
  ...phase2Step0Schema.shape,
  ...phase2Step1Schema.shape,
});

export const diagnosticFormSchema = z.object({
  ...phase1Step0Schema.shape,
  ...phase1Step1Schema._def.schema.shape,
  ...phase1Step2Schema.shape,
  ...phase2Step0Schema.shape,
  ...phase2Step1Schema.shape,
});

export type Phase1Data = z.infer<typeof phase1Schema>;
export type Phase2Data = z.infer<typeof phase2Schema>;
export type DiagnosticFormData = z.infer<typeof diagnosticFormSchema>;

// ═══════════════════════════════════════════════════════════════
// Step registry (para validación por paso en el orquestador)
// ═══════════════════════════════════════════════════════════════

export const phase1Steps = [phase1Step0Schema, phase1Step1Schema, phase1Step2Schema] as const;
export const phase2Steps = [phase2Step0Schema, phase2Step1Schema] as const;

export const phase1Meta = [
  { title: "Agendar cita", icon: "CalendarDays" },
  { title: "Tu empresa", icon: "Building2" },
  { title: "Qué buscas", icon: "TrendingUp" },
] as const;

export const phase2Meta = [
  { title: "Tu operación", icon: "Briefcase" },
  { title: "Tu stack", icon: "Cpu" },
] as const;
