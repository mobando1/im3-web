import { createContext, useContext } from "react";

// Idioma del template de propuesta. El contenido (ProposalData) se traduce con IA y se
// guarda en proposals.sections; estos son los rótulos FIJOS del template (eyebrows de
// sección, encabezados de tabla, footer, etc.) que no viven en los datos.
export type ProposalLang = "es" | "en";

export type ProposalStrings = {
  // Nav + footer (ProposalTemplate)
  commercialProposal: string;
  footerLocations: string;
  footerConfidential: string; // contiene el token {client}
  // Hero
  heroTag: string;
  heroSeeFull: string;
  heroScroll: string;
  // Summary
  summaryEyebrow: string;
  summaryProjectData: string;
  // Problem
  problemEyebrow: string;
  problemAccumulated: string;
  problemHowCalc: string;
  // Solution
  solutionEyebrow: string;
  // Tech
  techEyebrow: string;
  techStackPrefix: string;
  // Compartido (Tech + Pricing)
  optional: string;
  // Timeline
  timelineEyebrow: string;
  weeksAbbrev: string;
  timelineOutcome: string;
  // ROI
  roiEyebrow: string;
  roiComparison: string;
  // Authority
  authorityEyebrow: string;
  // Pricing
  pricingEyebrow: string;
  pricingHeadingLine1: string;
  pricingHeadingLine2: string;
  pricingIntro: string;
  pricingIncludes: string;
  pricingSavings: string; // prefijo de la línea de ahorro cuando hay descuento
  // Hardware
  hardwareEyebrow: string;
  hardwareColEquipo: string;
  hardwareColQty: string;
  hardwareColUnit: string;
  hardwareColTotal: string;
  hardwareSubtotal: string;
  hardwarePurchaseSupport: string;
  // Operational costs
  opcostsEyebrow: string;
  opcostsMonthlyRange: string;
  opcostsAnnualEstimate: string;
  opcostsAlternative: string;
  opcostsMarkupPrefix: string;
  opcostsDefaultGroup: string;
  billingLabels: Record<"fixed" | "passthrough" | "passthrough-with-cap" | "client-direct", string>;
  // CTA
  ctaEyebrow: string;
  // Flujo de aceptación (página pública: modal + pantalla de gracias)
  acceptModalTitle: string;
  acceptModalSubtitle: string;
  acceptNamePlaceholder: string;
  acceptTermsLabel: string;
  acceptConfirm: string;
  acceptProcessing: string;
  acceptCancel: string;
  acceptedTitle: string;
  acceptedBody: string;
  acceptedScheduleKickoff: string;
};

export const PROPOSAL_STRINGS: Record<ProposalLang, ProposalStrings> = {
  es: {
    commercialProposal: "Propuesta Comercial",
    footerLocations: "Colombia · España · Latinoamérica",
    footerConfidential: "Esta propuesta es confidencial y fue preparada exclusivamente para {client}.",
    heroTag: "Propuesta personalizada",
    heroSeeFull: "Ver la propuesta completa",
    heroScroll: "Desliza",
    summaryEyebrow: "Resumen Ejecutivo",
    summaryProjectData: "Datos del proyecto",
    problemEyebrow: "El Problema",
    problemAccumulated: "Pérdida acumulada desde que abriste esta propuesta",
    problemHowCalc: "Cómo calculamos esto",
    solutionEyebrow: "Nuestra Solución",
    techEyebrow: "Cómo funciona",
    techStackPrefix: "Stack:",
    optional: "Opcionales",
    timelineEyebrow: "Cronograma",
    weeksAbbrev: "sem.",
    timelineOutcome: "Al finalizar:",
    roiEyebrow: "Retorno de Inversión",
    roiComparison: "Comparativa: no actuar vs. implementar",
    authorityEyebrow: "Sobre IM3 Systems",
    pricingEyebrow: "Tu Inversión",
    pricingHeadingLine1: "Transparente",
    pricingHeadingLine2: "y sin sorpresas",
    pricingIntro: "La inversión se recupera rápido — no dejar de actuar es el verdadero costo.",
    pricingIncludes: "Tu inversión incluye",
    pricingSavings: "Ahorras",
    hardwareEyebrow: "Hardware",
    hardwareColEquipo: "Equipo",
    hardwareColQty: "Cant.",
    hardwareColUnit: "Unit.",
    hardwareColTotal: "Total",
    hardwareSubtotal: "Subtotal hardware",
    hardwarePurchaseSupport: "Acompañamiento en la compra",
    opcostsEyebrow: "Costos Operativos",
    opcostsMonthlyRange: "Rango mensual",
    opcostsAnnualEstimate: "Estimado anual",
    opcostsAlternative: "Opción alternativa",
    opcostsMarkupPrefix: "markup",
    opcostsDefaultGroup: "Servicios operativos",
    billingLabels: {
      "fixed": "Tarifa fija mensual",
      "passthrough": "Pass-through con markup",
      "passthrough-with-cap": "Pass-through con tope mensual",
      "client-direct": "Pago directo del cliente",
    },
    ctaEyebrow: "Próximos Pasos",
    acceptModalTitle: "¿Listo para empezar?",
    acceptModalSubtitle: "Acepta la propuesta y agendaremos la reunión de inicio para arrancar tu proyecto.",
    acceptNamePlaceholder: "Tu nombre completo",
    acceptTermsLabel: "Acepto los términos de esta propuesta comercial",
    acceptConfirm: "Confirmar aceptación",
    acceptProcessing: "Procesando...",
    acceptCancel: "Cancelar",
    acceptedTitle: "Propuesta aceptada",
    acceptedBody: "Gracias por confiar en IM3 Systems. Nos pondremos en contacto contigo pronto para dar inicio al proyecto.",
    acceptedScheduleKickoff: "Agendar reunión de inicio",
  },
  en: {
    commercialProposal: "Commercial Proposal",
    footerLocations: "Colombia · Spain · Latin America",
    footerConfidential: "This proposal is confidential and was prepared exclusively for {client}.",
    heroTag: "Personalized proposal",
    heroSeeFull: "See the full proposal",
    heroScroll: "Scroll",
    summaryEyebrow: "Executive Summary",
    summaryProjectData: "Project details",
    problemEyebrow: "The Problem",
    problemAccumulated: "Losses piling up since you opened this proposal",
    problemHowCalc: "How we calculated this",
    solutionEyebrow: "Our Solution",
    techEyebrow: "How it works",
    techStackPrefix: "Stack:",
    optional: "Optional",
    timelineEyebrow: "Timeline",
    weeksAbbrev: "wks.",
    timelineOutcome: "By the end:",
    roiEyebrow: "Return on Investment",
    roiComparison: "Comparison: doing nothing vs. implementing",
    authorityEyebrow: "About IM3 Systems",
    pricingEyebrow: "Your Investment",
    pricingHeadingLine1: "Transparent,",
    pricingHeadingLine2: "no surprises",
    pricingIntro: "The investment pays for itself fast — inaction is the real cost.",
    pricingIncludes: "Your investment includes",
    pricingSavings: "You save",
    hardwareEyebrow: "Hardware",
    hardwareColEquipo: "Equipment",
    hardwareColQty: "Qty",
    hardwareColUnit: "Unit",
    hardwareColTotal: "Total",
    hardwareSubtotal: "Hardware subtotal",
    hardwarePurchaseSupport: "Purchase guidance",
    opcostsEyebrow: "Operational Costs",
    opcostsMonthlyRange: "Monthly range",
    opcostsAnnualEstimate: "Annual estimate",
    opcostsAlternative: "Alternative option",
    opcostsMarkupPrefix: "markup",
    opcostsDefaultGroup: "Operational services",
    billingLabels: {
      "fixed": "Fixed monthly fee",
      "passthrough": "Pass-through with markup",
      "passthrough-with-cap": "Pass-through with monthly cap",
      "client-direct": "Client pays directly",
    },
    ctaEyebrow: "Next Steps",
    acceptModalTitle: "Ready to get started?",
    acceptModalSubtitle: "Accept the proposal and we'll schedule the kickoff meeting to start your project.",
    acceptNamePlaceholder: "Your full name",
    acceptTermsLabel: "I accept the terms of this commercial proposal",
    acceptConfirm: "Confirm acceptance",
    acceptProcessing: "Processing...",
    acceptCancel: "Cancel",
    acceptedTitle: "Proposal accepted",
    acceptedBody: "Thank you for trusting IM3 Systems. We'll be in touch soon to kick off your project.",
    acceptedScheduleKickoff: "Schedule kickoff meeting",
  },
};

// Contexto del idioma activo. ProposalTemplate lo provee; cada sección lee con useProposalStrings().
export const ProposalLangContext = createContext<ProposalLang>("es");

export function useProposalLang(): ProposalLang {
  return useContext(ProposalLangContext);
}

export function useProposalStrings(): ProposalStrings {
  return PROPOSAL_STRINGS[useContext(ProposalLangContext)];
}
