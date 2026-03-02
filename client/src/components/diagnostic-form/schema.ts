import { z } from "zod";

// Step 1 — Información General
export const step1Schema = z.object({
  empresa: z.string().min(1, "Requerido"),
  industria: z.string().min(1, "Requerido"),
  anosOperacion: z.string().min(1, "Requerido"),
  empleados: z.string().min(1, "Seleccione una opción"),
  ciudades: z.string().min(1, "Requerido"),
  participante: z.string().min(1, "Requerido"),
});

// Step 2 — Contexto de la auditoría
export const step2Schema = z.object({
  objetivos: z.array(z.string()).min(1, "Seleccione al menos una opción"),
  resultadoEsperado: z.string().min(10, "Mínimo 10 caracteres"),
});

// Step 3 — Modelo de negocio
export const step3Schema = z.object({
  productos: z.string().min(10, "Mínimo 10 caracteres"),
  volumenMensual: z.string().min(1, "Requerido"),
  clientePrincipal: z.string().min(1, "Seleccione una opción"),
  clientePrincipalOtro: z.string().optional(),
}).refine(
  (data) => data.clientePrincipal !== "Otro" || (data.clientePrincipalOtro && data.clientePrincipalOtro.length > 0),
  { message: "Especifique cuál", path: ["clientePrincipalOtro"] }
);

// Step 4 — Adquisición de clientes
export const step4Schema = z.object({
  canalesAdquisicion: z.array(z.string()).min(1, "Seleccione al menos una opción"),
  canalAdquisicionOtro: z.string().optional(),
  canalPrincipal: z.string().min(1, "Requerido"),
}).refine(
  (data) => !data.canalesAdquisicion.includes("Otro") || (data.canalAdquisicionOtro && data.canalAdquisicionOtro.length > 0),
  { message: "Especifique cuál", path: ["canalAdquisicionOtro"] }
);

// Step 5 — Sistemas y Herramientas
export const step5Schema = z.object({
  herramientas: z.string().min(10, "Mínimo 10 caracteres"),
  conectadas: z.string().min(1, "Seleccione una opción"),
  conectadasDetalle: z.string().optional(),
});

// Step 6 — Madurez tecnológica
export const step6Schema = z.object({
  nivelTech: z.string().min(1, "Seleccione una opción"),
  usaIA: z.string().min(1, "Seleccione una opción"),
  usaIAParaQue: z.string().optional(),
  comodidadTech: z.string().min(1, "Seleccione una opción"),
  familiaridad: z.object({
    automatizacion: z.string().min(1, "Requerido"),
    crm: z.string().min(1, "Requerido"),
    ia: z.string().min(1, "Requerido"),
    integracion: z.string().min(1, "Requerido"),
    desarrollo: z.string().min(1, "Requerido"),
  }),
}).refine(
  (data) => data.usaIA !== "Sí, regularmente" || (data.usaIAParaQue && data.usaIAParaQue.length > 0),
  { message: "Especifique para qué", path: ["usaIAParaQue"] }
);

// Step 7 — Prioridades e Inversión
export const step7Schema = z.object({
  areaPrioridad: z.array(z.string()).min(1, "Seleccione al menos una opción"),
  presupuesto: z.string().min(1, "Seleccione una opción"),
});

// Full form schema
export const diagnosticFormSchema = z.object({
  ...step1Schema.shape,
  ...step2Schema.shape,
  ...step3Schema.shape,
  ...step4Schema._def.schema.shape,
  ...step5Schema.shape,
  ...step6Schema._def.schema.shape,
  ...step7Schema.shape,
});

export type DiagnosticFormData = z.infer<typeof step1Schema> &
  z.infer<typeof step2Schema> &
  z.infer<typeof step3Schema> &
  z.infer<typeof step4Schema> &
  z.infer<typeof step5Schema> &
  z.infer<typeof step6Schema> &
  z.infer<typeof step7Schema>;

// Step schemas array for easy access by index
export const stepSchemas = [
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  step6Schema,
  step7Schema,
] as const;

// Step metadata
export const stepMeta = [
  { title: "Información General", icon: "Building2" },
  { title: "Contexto de la Auditoría", icon: "Target" },
  { title: "Modelo de Negocio", icon: "Briefcase" },
  { title: "Adquisición de Clientes", icon: "Users" },
  { title: "Sistemas y Herramientas", icon: "Wrench" },
  { title: "Madurez Tecnológica", icon: "Cpu" },
  { title: "Prioridades e Inversión", icon: "TrendingUp" },
  { title: "Resumen", icon: "FileCheck" },
] as const;
