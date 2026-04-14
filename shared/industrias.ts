export const INDUSTRIAS = [
  { value: "ecommerce", label: "E-commerce / Tienda online" },
  { value: "retail_fisico", label: "Retail físico / Distribución" },
  { value: "servicios_profesionales", label: "Servicios profesionales (abogados, contadores, consultores)" },
  { value: "salud_medicina", label: "Salud / Medicina / Clínicas" },
  { value: "educacion", label: "Educación / Capacitación" },
  { value: "manufactura", label: "Manufactura / Industria" },
  { value: "logistica_transporte", label: "Logística / Transporte" },
  { value: "construccion_inmobiliaria", label: "Construcción / Inmobiliaria" },
  { value: "fintech_servicios_financieros", label: "Fintech / Servicios financieros" },
  { value: "agroindustria", label: "Agroindustria / Agro" },
  { value: "alimentos_bebidas", label: "Alimentos y bebidas / HORECA" },
  { value: "turismo_hoteleria", label: "Turismo / Hotelería" },
  { value: "medios_contenido", label: "Medios / Contenido / Marketing" },
  { value: "tecnologia_software", label: "Tecnología / Software / SaaS" },
  { value: "consultoria_agencia", label: "Consultoría / Agencia" },
  { value: "ong_gobierno", label: "ONG / Gobierno / Sector público" },
  { value: "otro", label: "Otro (especificar)" },
] as const;

export type IndustriaValue = typeof INDUSTRIAS[number]["value"];

export const INDUSTRIA_VALUES = INDUSTRIAS.map((i) => i.value) as [IndustriaValue, ...IndustriaValue[]];

export const INDUSTRIA_LABELS: Record<IndustriaValue, string> = Object.fromEntries(
  INDUSTRIAS.map((i) => [i.value, i.label])
) as Record<IndustriaValue, string>;

export function getIndustriaLabel(value: string | null | undefined, fallback = "Industria no especificada"): string {
  if (!value) return fallback;
  return INDUSTRIA_LABELS[value as IndustriaValue] ?? value;
}

const B2B_INDUSTRIES: IndustriaValue[] = [
  "servicios_profesionales",
  "manufactura",
  "logistica_transporte",
  "construccion_inmobiliaria",
  "tecnologia_software",
  "consultoria_agencia",
  "agroindustria",
];

const B2C_INDUSTRIES: IndustriaValue[] = [
  "ecommerce",
  "retail_fisico",
  "salud_medicina",
  "educacion",
  "alimentos_bebidas",
  "turismo_hoteleria",
];

export function inferClientType(industria: string | null | undefined): "B2B" | "B2C" | "Mixto" {
  if (!industria) return "Mixto";
  if (B2B_INDUSTRIES.includes(industria as IndustriaValue)) return "B2B";
  if (B2C_INDUSTRIES.includes(industria as IndustriaValue)) return "B2C";
  return "Mixto";
}
