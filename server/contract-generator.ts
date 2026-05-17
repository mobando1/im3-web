import { db } from "./db";
import { proposals, contacts, contracts, contractTemplates, stackServices } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { ProposalData, OperationalCostsData } from "@shared/proposal-template/types";

/**
 * Resuelve las variables `{{namespace.key}}` en un template Markdown.
 * Si una variable no tiene valor, queda como `{{namespace.key}}` para que el admin la vea.
 */
export function resolveVariables(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g, (match, path: string) => {
    const value = getNested(variables, path);
    if (value === undefined || value === null) return match; // deja la variable visible
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "Sí" : "No";
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  });
}

function getNested(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Construye el objeto de variables disponibles para un contrato, derivado de la propuesta + contacto.
 * Devuelve estructura anidada que `resolveVariables` puede acceder con notación punto.
 */
export type ContractVariables = {
  fecha: { hoy: string; firma: string };
  cliente: { nombre: string; empresa: string; email: string; telefono: string };
  im3: { nombre: string; email: string; representante: string };
  proposal: { titulo: string; alcance: string };
  pricing: { totalUSD: string; milestones: string };
  costos: { totalMensualUSD: string; totalAnualUSD: string; desglose: string };
  timeline: { semanas: string; fechaInicio: string; fechaFin: string };
};

export async function buildVariablesForContract(proposalId: string): Promise<ContractVariables | { error: string }> {
  if (!db) return { error: "DB no disponible" };

  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) return { error: "Propuesta no encontrada" };

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
  if (!contact) return { error: "Contacto no encontrado" };

  const sections = (proposal.sections as Partial<ProposalData> | null) || {};
  const pricing = sections.pricing;
  const operationalCosts = sections.operationalCosts as OperationalCostsData | undefined;
  const timeline = sections.timeline;

  const today = new Date();
  const fechaHoy = today.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  // Total de semanas y fechas estimadas desde el timeline
  const totalWeeks = (timeline?.phases || []).reduce((sum, p) => sum + (p.durationWeeks || 0), 0);
  const fechaInicio = today.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const fechaFin = totalWeeks > 0
    ? new Date(today.getTime() + totalWeeks * 7 * 24 * 60 * 60 * 1000).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })
    : "(por definir)";

  // Alcance: resumen de los módulos de la solución
  const alcance = sections.solution?.modules
    ? sections.solution.modules.map(m => `- **${m.title}**: ${m.description}`).join("\n")
    : "(Ver propuesta adjunta para el detalle del alcance.)";

  // Pricing
  const pricingAmount = pricing?.amount || "0";
  const pricingPrefix = pricing?.amountPrefix || "$";
  const pricingSuffix = pricing?.amountSuffix || "USD";
  const totalUSDFormatted = `${pricingPrefix}${pricingAmount} ${pricingSuffix}`.trim();

  const milestonesStr = pricing?.milestones?.length
    ? pricing.milestones.map(m => `${m.step}. **${m.name}** — ${m.desc} (${m.amount})`).join("\n")
    : "(Forma de pago por definir con EL CLIENTE)";

  // Operational costs: derivar totales y desglose en tabla markdown.
  // Enriquecemos cada item consultando el catálogo `stack_services` por nombre
  // para incluir vendor, billing model, unidades incluidas y overage rates reales.
  let totalMensualUSD = "(por calcular)";
  let totalAnualUSD = "(por calcular)";
  let costosDesglose = "(Sin desglose registrado. Genera la propuesta primero para que se autollene desde el catálogo Stack & Costos.)";

  if (operationalCosts) {
    totalMensualUSD = `${operationalCosts.monthlyRangeLow || "0"} a ${operationalCosts.monthlyRangeHigh || "0"}`;
    totalAnualUSD = operationalCosts.annualEstimate || "(por calcular)";

    // Cargar catálogo completo (solo activos) — para hacer match por nombre
    const catalogServices = await db.select().from(stackServices)
      .where(eq(stackServices.isActive, true))
      .catch(() => []);
    const catalogByName = new Map(catalogServices.map(s => [s.name.toLowerCase(), s]));

    // Tabla enriquecida: Servicio | Vendor | Modelo | Incluido | Overage | Costo mensual
    const lines: string[] = [
      "| Servicio | Vendor | Modelo | Incluido en plan base | Costo si excede | Costo mensual |",
      "|---|---|---|---|---|---|",
    ];

    for (const group of operationalCosts.groups || []) {
      for (const cat of group.categories || []) {
        for (const item of cat.items || []) {
          // Buscar en catálogo por nombre (case-insensitive, prefijo si no match exacto)
          const exact = catalogByName.get(item.service.toLowerCase());
          const fuzzy = exact || catalogServices.find(s =>
            item.service.toLowerCase().includes(s.name.toLowerCase()) ||
            s.name.toLowerCase().includes(item.service.toLowerCase())
          );

          const vendor = fuzzy?.vendor || "—";
          const billing = fuzzy ? translateBillingModel(fuzzy.billingModel) : translateBillingModel(group.billingModel);

          // Construir columnas Incluido y Overage desde pricingUnits del catálogo
          let incluidoCell = "—";
          let overageCell = "—";
          const units = fuzzy?.pricingUnits || [];
          if (units.length > 0) {
            const incluidoParts: string[] = [];
            const overageParts: string[] = [];
            for (const pu of units) {
              if (pu.includedQuantity > 0) incluidoParts.push(`${pu.includedQuantity} ${pu.unit}`);
              overageParts.push(`$${pu.overageUnitCostUSD}/${pu.unit}${pu.note ? ` (${pu.note})` : ""}`);
            }
            if (incluidoParts.length) incluidoCell = incluidoParts.join("; ");
            if (overageParts.length) overageCell = overageParts.join("; ");
          }

          const noteSuffix = item.note ? ` _${item.note}_` : "";
          lines.push(`| ${item.service}${noteSuffix} | ${vendor} | ${billing} | ${incluidoCell} | ${overageCell} | ${item.cost} |`);
        }
      }
    }
    if (lines.length > 2) costosDesglose = lines.join("\n");
  }

  return {
    fecha: {
      hoy: fechaHoy,
      firma: "_________________",
    },
    cliente: {
      nombre: contact.nombre + (contact.apellido ? ` ${contact.apellido}` : ""),
      empresa: contact.empresa,
      email: contact.email,
      telefono: contact.telefono || "(no proporcionado)",
    },
    im3: {
      nombre: "IM3 Systems S.A.S.",
      email: "info@im3systems.com",
      representante: process.env.IM3_REPRESENTANTE || "Mateo Obando Ángel",
    },
    proposal: {
      titulo: proposal.title,
      alcance,
    },
    pricing: {
      totalUSD: totalUSDFormatted,
      milestones: milestonesStr,
    },
    costos: {
      totalMensualUSD,
      totalAnualUSD,
      desglose: costosDesglose,
    },
    timeline: {
      semanas: totalWeeks > 0 ? String(totalWeeks) : "(por definir)",
      fechaInicio,
      fechaFin,
    },
  };
}

/**
 * Genera un contrato desde una propuesta + template, resuelve variables y persiste.
 * Si ya existe un contrato para la propuesta (1:1 unique), retorna error — usar PATCH para actualizar.
 */
export async function generateContractFromProposal(
  proposalId: string,
  templateId?: string,
): Promise<{ contractId: string } | { error: string }> {
  if (!db) return { error: "DB no disponible" };

  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) return { error: "Propuesta no encontrada" };

  // Validar status — solo propuestas aceptadas (o vistas, con override)
  const allowed = ["accepted", "viewed", "sent"];
  if (!allowed.includes(proposal.status)) {
    return { error: `Solo propuestas con status accepted/viewed/sent pueden generar contrato (actual: ${proposal.status})` };
  }

  // Verificar que no exista ya
  const [existing] = await db.select().from(contracts)
    .where(eq(contracts.proposalId, proposalId)).limit(1);
  if (existing && !existing.deletedAt) {
    return { error: "Ya existe un contrato para esta propuesta. Edítalo o elimínalo primero." };
  }

  // Obtener template — si no se especifica, usa el default
  let template;
  if (templateId) {
    [template] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, templateId)).limit(1);
  } else {
    [template] = await db.select().from(contractTemplates)
      .where(eq(contractTemplates.isDefault, true)).limit(1);
  }
  if (!template) return { error: "No se encontró plantilla de contrato" };

  // Resolver variables
  const varsResult = await buildVariablesForContract(proposalId);
  if ("error" in varsResult) return varsResult;
  const variables = varsResult;

  const bodyMarkdown = resolveVariables(template.bodyMarkdown, variables);

  const [contact] = await db.select({ empresa: contacts.empresa, nombre: contacts.nombre })
    .from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);

  const [created] = await db.insert(contracts).values({
    proposalId,
    contactId: proposal.contactId,
    templateId: template.id,
    title: `Contrato — ${contact?.empresa || contact?.nombre || proposal.title}`,
    bodyMarkdown,
    resolvedVariables: variables,
    status: "draft",
  }).returning();

  return { contractId: created.id };
}

/**
 * Re-resuelve variables desde la propuesta actual y reescribe el bodyMarkdown del contrato.
 * Solo permitido si status === "draft" (no se puede modificar un contrato locked/signed).
 */
export async function regenerateContractBody(contractId: string): Promise<{ success: true } | { error: string }> {
  if (!db) return { error: "DB no disponible" };

  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  if (!contract) return { error: "Contrato no encontrado" };
  if (contract.status !== "draft") return { error: "Solo contratos en draft pueden regenerarse" };

  const [template] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, contract.templateId)).limit(1);
  if (!template) return { error: "Template no encontrado" };

  const varsResult = await buildVariablesForContract(contract.proposalId);
  if ("error" in varsResult) return varsResult;

  const bodyMarkdown = resolveVariables(template.bodyMarkdown, varsResult);

  await db.update(contracts)
    .set({ bodyMarkdown, resolvedVariables: varsResult, updatedAt: new Date() })
    .where(eq(contracts.id, contractId));

  return { success: true };
}

function translateBillingModel(model: string): string {
  const map: Record<string, string> = {
    fixed: "Tarifa fija mensual",
    tiered: "Tier base + overage",
    usage: "Solo uso",
    passthrough: "Pass-through con markup",
    "passthrough-with-cap": "Pass-through con tope",
    "client-direct": "Cliente paga directo",
  };
  return map[model] || model;
}
