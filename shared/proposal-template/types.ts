import { z } from "zod";

export const proposalMetaSchema = z.object({
  clientName: z.string(),
  contactName: z.string(),
  proposalDate: z.string(),
  validUntil: z.string(),
  industry: z.string(),
});

export const heroSchema = z.object({
  painHeadline: z.string(),
  painAmount: z.string(),
  subtitle: z.string(),
  diagnosisRef: z.string(),
});

export const summaryStatSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const summarySchema = z.object({
  commitmentQuote: z.string().optional(),
  paragraphs: z.array(z.string()).min(1),
  stats: z.array(summaryStatSchema).optional(),
});

export const problemCardSchema = z.object({
  icon: z.string(),
  title: z.string(),
  description: z.string(),
});

export const problemSchema = z.object({
  intro: z.string(),
  // Widget de pérdida mensual (todo el bloque del contador animado).
  // Si monthlyLossCOP es undefined/null, el widget completo no se renderiza.
  monthlyLossCOP: z.number().nonnegative().optional(),
  counterDescription: z.string().optional(),
  calculationBreakdown: z.string().optional(),
  problemCards: z.array(problemCardSchema).min(1),
});

export const moduleSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  solves: z.string(),
});

export const solutionSchema = z.object({
  heading: z.string(),
  intro: z.string(),
  modules: z.array(moduleSchema).min(1),
});

export const techSchema = z.object({
  heading: z.string(),
  intro: z.string(),
  features: z.array(z.string()).min(1),
  // Features opcionales — se renderizan en una fila separada con etiqueta "Opcionales"
  optionalFeatures: z.array(z.string()).optional(),
  stack: z.string(),
});

export const phaseSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  durationWeeks: z.number().int().positive(),
  items: z.array(z.string()).min(1),
  outcome: z.string().optional(),
});

export const timelineSchema = z.object({
  heading: z.string(),
  phases: z.array(phaseSchema).min(1),
});

export const roiRecoverySchema = z.object({
  amount: z.string(),
  currency: z.string(),
  label: z.string(),
});

export const roiComparisonSchema = z.object({
  withoutLabel: z.string(),
  withoutAmount: z.string(),
  withoutWeight: z.number().min(0).max(100),
  investmentLabel: z.string(),
  investmentAmount: z.string(),
  investmentWeight: z.number().min(0).max(100),
  caption: z.string(),
});

export const roiSchema = z.object({
  heading: z.string(),
  recoveries: z.array(roiRecoverySchema).min(1),
  comparison: roiComparisonSchema,
  heroTitle: z.string(),
  heroDescription: z.string(),
  roiPercent: z.string(),
  paybackMonths: z.string(),
});

export const authorityStatSchema = z.object({
  num: z.string(),
  label: z.string(),
});

export const differentiatorSchema = z.object({
  icon: z.string(),
  title: z.string(),
  description: z.string(),
});

export const authoritySchema = z.object({
  heading: z.string(),
  intro: z.string(),
  stats: z.array(authorityStatSchema).min(1),
  differentiators: z.array(differentiatorSchema).min(1),
});

export const testimonialSchema = z.object({
  text: z.string(),
  author: z.string(),
  role: z.string(),
});

export const milestoneSchema = z.object({
  step: z.number().int().positive(),
  name: z.string(),
  desc: z.string(),
  amount: z.string(),
});

export const pricingSchema = z.object({
  label: z.string(),
  amount: z.string(),
  amountPrefix: z.string(),
  amountSuffix: z.string(),
  priceFootnote: z.string(),
  scarcityMessage: z.string(),
  milestones: z.array(milestoneSchema).min(1),
  includes: z.array(z.string()).min(1),
  // Entregables/checkpoints opcionales — se renderizan en bloque separado con título "Opcionales"
  optionalIncludes: z.array(z.string()).optional(),
});

export const ctaSchema = z.object({
  heading: z.string(),
  painHighlight: z.string(),
  description: z.string(),
  acceptLabel: z.string(),
  fallbackCtaLabel: z.string(),
  deadlineMessage: z.string(),
  guarantees: z.array(z.string()),
});

// Hardware físico requerido para que el proyecto funcione (OPCIONAL — solo si aplica)
export const hardwareItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  quantity: z.number().int().positive(),
  unitPriceUSD: z.string(),
  totalPriceUSD: z.string(),
  notes: z.string().optional(),
  paidBy: z.enum(["cliente-compra", "im3-incluye", "im3-asesora"]).default("cliente-compra"),
});

export const hardwareSchema = z.object({
  heading: z.string(),
  intro: z.string(),
  items: z.array(hardwareItemSchema).min(1),
  subtotalUSD: z.string(),
  recommendationNote: z.string().optional(),
  disclaimer: z.string(),
});

// Operational costs (gastos mensuales recurrentes que el cliente paga aparte del desarrollo)
export const operationalCostItemSchema = z.object({
  service: z.string(),
  cost: z.string(),
  note: z.string().optional(),
});

export const operationalCostCategorySchema = z.object({
  name: z.string(),
  items: z.array(operationalCostItemSchema).min(1),
});

// Modelo de cobro por grupo:
// - "fixed":              tarifa fija mensual de "operaciones" (servicios predecibles)
// - "passthrough":        IM3 paga y cobra al cliente con markup
// - "passthrough-with-cap": pass-through con cap mensual + alertas (típico LLMs)
// - "client-direct":      el cliente paga directo al proveedor (montos grandes, BYO API key)
export const operationalCostGroupSchema = z.object({
  name: z.string(),
  billingModel: z.enum(["fixed", "passthrough", "passthrough-with-cap", "client-direct"]),
  description: z.string().optional(),
  monthlyFee: z.string().optional(), // tarifa fija que IM3 cobra (para billingModel="fixed")
  markup: z.string().optional(),     // ej. "10%" (para passthrough)
  categories: z.array(operationalCostCategorySchema).min(1),
});

export const operationalCostsSchema = z.object({
  // null = campo ocultado por el usuario (no aparece en el render). string vacío = campo visible pero sin contenido.
  heading: z.string().nullable(),
  intro: z.string().nullable(),
  // Nuevo formato: grupos por modelo de cobro (predecibles vs. uso). Recomendado.
  groups: z.array(operationalCostGroupSchema).optional(),
  // Formato legacy: categorías sueltas. Si está presente y `groups` no, se renderiza como antes.
  categories: z.array(operationalCostCategorySchema).optional(),
  monthlyRangeLow: z.string().nullable(),
  monthlyRangeHigh: z.string().nullable(),
  annualEstimate: z.string().nullable(),
  paidBy: z.enum(["cliente-directo", "im3-managed", "hibrido"]).optional(),
  managedServicesUpsell: z.string().optional(),
  disclaimer: z.string(),
});

// Secciones obligatorias: meta, hero, solution, pricing, cta — el resto son opcionales
// y pueden eliminarse desde el editor si no aplican o no hay datos.
// `sectionTitles` permite renombrar el header de cualquier sección (override del label por defecto).
export const proposalDataSchema = z.object({
  meta: proposalMetaSchema,
  hero: heroSchema,
  summary: summarySchema.optional(),
  problem: problemSchema.optional(),
  solution: solutionSchema,
  tech: techSchema.optional(),
  timeline: timelineSchema.optional(),
  roi: roiSchema.optional(),
  authority: authoritySchema.optional(),
  testimonials: z.array(testimonialSchema).optional(),
  pricing: pricingSchema,
  hardware: hardwareSchema.optional(),
  operationalCosts: operationalCostsSchema.optional(),
  cta: ctaSchema,
  sectionTitles: z.record(z.string()).optional(),
});

export type ProposalData = z.infer<typeof proposalDataSchema>;
export type ProposalMeta = z.infer<typeof proposalMetaSchema>;
export type HeroData = z.infer<typeof heroSchema>;
export type SummaryData = z.infer<typeof summarySchema>;
export type ProblemData = z.infer<typeof problemSchema>;
export type SolutionData = z.infer<typeof solutionSchema>;
export type TechData = z.infer<typeof techSchema>;
export type TimelineData = z.infer<typeof timelineSchema>;
export type ROIData = z.infer<typeof roiSchema>;
export type AuthorityData = z.infer<typeof authoritySchema>;
export type TestimonialData = z.infer<typeof testimonialSchema>;
export type PricingData = z.infer<typeof pricingSchema>;
export type CTAData = z.infer<typeof ctaSchema>;
export type HardwareData = z.infer<typeof hardwareSchema>;
export type HardwareItem = z.infer<typeof hardwareItemSchema>;
export type OperationalCostsData = z.infer<typeof operationalCostsSchema>;
export type OperationalCostItem = z.infer<typeof operationalCostItemSchema>;
export type OperationalCostCategory = z.infer<typeof operationalCostCategorySchema>;
export type OperationalCostGroup = z.infer<typeof operationalCostGroupSchema>;
export type ProposalSectionKey = keyof ProposalData;

export type ProposalSourcesReport = Partial<Record<ProposalSectionKey, string[]>>;

// ───────────────────────────────────────────────────────────────
// Proposal Brief — material de soporte detallado post-reunión
// Estructura completamente diferente a ProposalData: por módulo
// se profundiza en problema/funcionamiento/contexto/ejemplos.
// ───────────────────────────────────────────────────────────────

export const briefModuleSchema = z.object({
  // Referencia al módulo equivalente en la propuesta inicial (slug). Permite vincular ambos.
  key: z.string(),
  title: z.string(),
  // Qué problema concreto del cliente resuelve este módulo
  problemSolved: z.string(),
  // Cómo funciona técnicamente, en lenguaje accesible
  howItWorks: z.string(),
  // De qué momento o tema de la reunión surgió este requerimiento
  meetingContext: z.string(),
  // Por qué esta solución y no otra (alternativas descartadas, criterio)
  whyThisChoice: z.string(),
  // Qué pasaría si NO se hace este módulo (costo de oportunidad)
  withoutThis: z.string(),
  // Ejemplos concretos de uso
  examples: z.array(z.string()),
  // Detalles técnicos opcionales para mayor profundidad (stack, integraciones, etc.)
  technicalDetails: z.string().optional(),
});

export const briefFAQSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const briefGlossaryTermSchema = z.object({
  term: z.string(),
  definition: z.string(),
});

export const briefIntroSchema = z.object({
  // Contexto: por qué existe este documento (complemento a la propuesta inicial)
  context: z.string(),
  // Cómo leer el documento (estructura, qué esperar)
  howToRead: z.string(),
});

export const proposalBriefDataSchema = z.object({
  intro: briefIntroSchema,
  modules: z.array(briefModuleSchema).min(1),
  faqs: z.array(briefFAQSchema).optional(),
  glossary: z.array(briefGlossaryTermSchema).optional(),
});

export type BriefModule = z.infer<typeof briefModuleSchema>;
export type BriefFAQ = z.infer<typeof briefFAQSchema>;
export type BriefGlossaryTerm = z.infer<typeof briefGlossaryTermSchema>;
export type BriefIntro = z.infer<typeof briefIntroSchema>;
export type ProposalBriefData = z.infer<typeof proposalBriefDataSchema>;

export type ProposalBriefSourcesReport = Partial<Record<"intro" | "modules" | "faqs" | "glossary", string[]>>;
