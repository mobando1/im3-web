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
  commitmentQuote: z.string(),
  paragraphs: z.array(z.string()).min(1),
  stats: z.array(summaryStatSchema).min(1),
});

export const problemCardSchema = z.object({
  icon: z.string(),
  title: z.string(),
  description: z.string(),
});

export const problemSchema = z.object({
  intro: z.string(),
  monthlyLossCOP: z.number().nonnegative(),
  counterDescription: z.string(),
  // Cómo se calculó el monthlyLossCOP — si está vacío Claude debe explicarlo en counterDescription
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
  stack: z.string(),
});

export const phaseSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  durationWeeks: z.number().int().positive(),
  items: z.array(z.string()).min(1),
  outcome: z.string(),
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

export const operationalCostsSchema = z.object({
  heading: z.string(),
  intro: z.string(),
  categories: z.array(operationalCostCategorySchema).min(1),
  monthlyRangeLow: z.string(),
  monthlyRangeHigh: z.string(),
  annualEstimate: z.string(),
  paidBy: z.enum(["cliente-directo", "im3-managed", "hibrido"]),
  managedServicesUpsell: z.string().optional(),
  disclaimer: z.string(),
});

export const proposalDataSchema = z.object({
  meta: proposalMetaSchema,
  hero: heroSchema,
  summary: summarySchema,
  problem: problemSchema,
  solution: solutionSchema,
  tech: techSchema,
  timeline: timelineSchema,
  roi: roiSchema,
  authority: authoritySchema,
  testimonials: z.array(testimonialSchema).optional(), // Omitir si no hay testimonios reales
  pricing: pricingSchema,
  hardware: hardwareSchema.optional(), // solo si aplica
  operationalCosts: operationalCostsSchema,
  cta: ctaSchema,
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
export type ProposalSectionKey = keyof ProposalData;

export type ProposalSourcesReport = Partial<Record<ProposalSectionKey, string[]>>;
