import { db } from "./db";
import { proposals, stackServices } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import type { OperationalCostsData, OperationalCostGroup, OperationalCostCategory, OperationalCostItem } from "@shared/proposal-template/types";

export type CalculatorInput = {
  serviceId: string;
  /** Mapa unidad → cantidad estimada de uso mensual. Ej { "GB storage": 5, "1M tokens (Sonnet input)": 0.4 } */
  usageEstimate?: Record<string, number>;
};

export type ServiceBreakdown = {
  serviceId: string;
  serviceName: string;
  category: string;
  billingModel: string;
  fixedMonthlyUSD: number;
  variableMonthlyUSD: number;
  totalCostUSD: number;        // costo real al proveedor
  markupPercent: number;
  clientPaysMonthlyUSD: number; // lo que IM3 le cobra al cliente
  units: Array<{
    unit: string;
    included: number;
    usage: number;
    overage: number;
    overageRate: number;
    overageCostUSD: number;
  }>;
  note?: string;
};

export type CalculatorOutput = {
  services: ServiceBreakdown[];
  totals: {
    totalFixedUSD: number;
    totalVariableUSD: number;
    monthlyClientPaysUSD: number;
    annualClientPaysUSD: number;
    monthlyLowUSD: number;   // estimación conservadora (uso típico)
    monthlyHighUSD: number;  // estimación con buffer +25%
  };
};

/**
 * Calcula el costo mensual exacto para un set de servicios con uso estimado.
 * NO persiste — el admin puede iterar la calculadora varias veces antes de aplicar.
 */
export async function calculateStackCost(items: CalculatorInput[]): Promise<CalculatorOutput | { error: string }> {
  if (!db) return { error: "DB no disponible" };
  if (!items || items.length === 0) {
    return {
      services: [],
      totals: { totalFixedUSD: 0, totalVariableUSD: 0, monthlyClientPaysUSD: 0, annualClientPaysUSD: 0, monthlyLowUSD: 0, monthlyHighUSD: 0 },
    };
  }

  const ids = items.map(i => i.serviceId);
  const services = await db.select().from(stackServices).where(inArray(stackServices.id, ids));
  const byId = new Map(services.map(s => [s.id, s]));

  const breakdowns: ServiceBreakdown[] = [];

  for (const item of items) {
    const svc = byId.get(item.serviceId);
    if (!svc) continue;

    const baseFee = parseFloat(svc.baseFeeUSD || "0");
    const markup = parseFloat(svc.markupPercent || "0");
    const isClientDirect = svc.billingModel === "client-direct";

    let variableCost = 0;
    const units: ServiceBreakdown["units"] = [];
    for (const pu of svc.pricingUnits || []) {
      const usage = item.usageEstimate?.[pu.unit] || 0;
      const overage = Math.max(0, usage - pu.includedQuantity);
      const overageCost = overage * pu.overageUnitCostUSD;
      variableCost += overageCost;
      units.push({
        unit: pu.unit,
        included: pu.includedQuantity,
        usage,
        overage,
        overageRate: pu.overageUnitCostUSD,
        overageCostUSD: overageCost,
      });
    }

    // Costo real al proveedor:
    // - fixed/tiered: baseFee + overage
    // - usage: solo overage (baseFee=0 típicamente)
    // - passthrough*: igual que tiered, IM3 paga al proveedor y reembolsa via markup
    // - client-direct: cliente paga directo, IM3 no incurre costo, NO sumamos al total IM3
    const totalCost = baseFee + variableCost;

    // Lo que IM3 le cobra al cliente final:
    // - client-direct: 0 (cliente paga directo al proveedor)
    // - passthrough*: totalCost * (1 + markup/100)
    // - fixed/tiered/usage: totalCost (sin markup, IM3 lo cobra como pass-through silencioso)
    let clientPays = totalCost;
    if (isClientDirect) {
      clientPays = 0;
    } else if (svc.billingModel === "passthrough" || svc.billingModel === "passthrough-with-cap") {
      clientPays = totalCost * (1 + markup / 100);
    }

    breakdowns.push({
      serviceId: svc.id,
      serviceName: svc.name,
      category: svc.category,
      billingModel: svc.billingModel,
      fixedMonthlyUSD: baseFee,
      variableMonthlyUSD: variableCost,
      totalCostUSD: totalCost,
      markupPercent: markup,
      clientPaysMonthlyUSD: clientPays,
      units,
      note: isClientDirect ? "Cliente paga directo al proveedor — no se incluye en total IM3" : undefined,
    });
  }

  const totalFixed = breakdowns.reduce((sum, b) => sum + (b.billingModel === "client-direct" ? 0 : b.fixedMonthlyUSD), 0);
  const totalVariable = breakdowns.reduce((sum, b) => sum + (b.billingModel === "client-direct" ? 0 : b.variableMonthlyUSD), 0);
  const monthlyClientPays = breakdowns.reduce((sum, b) => sum + b.clientPaysMonthlyUSD, 0);

  return {
    services: breakdowns,
    totals: {
      totalFixedUSD: round2(totalFixed),
      totalVariableUSD: round2(totalVariable),
      monthlyClientPaysUSD: round2(monthlyClientPays),
      annualClientPaysUSD: round2(monthlyClientPays * 12),
      monthlyLowUSD: round2(monthlyClientPays),
      monthlyHighUSD: round2(monthlyClientPays * 1.25), // buffer +25% para uso pico
    },
  };
}

/**
 * Toma el breakdown calculado y lo convierte al formato `operationalCostsSchema` existente,
 * agrupando los servicios por `billingModel` (un grupo por modelo de cobro).
 * Lo escribe en `proposal.sections.operationalCosts` reemplazando lo que haya.
 */
export async function applyStackCostToProposal(
  proposalId: string,
  output: CalculatorOutput,
): Promise<{ success: true } | { error: string }> {
  if (!db) return { error: "DB no disponible" };

  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) return { error: "Propuesta no encontrada" };

  // Agrupar servicios por billingModel
  const byBilling = new Map<string, ServiceBreakdown[]>();
  for (const svc of output.services) {
    const key = svc.billingModel;
    if (!byBilling.has(key)) byBilling.set(key, []);
    byBilling.get(key)!.push(svc);
  }

  const groupNameByBilling: Record<string, string> = {
    fixed: "Servicios con tarifa fija mensual",
    tiered: "Servicios con tier base + overage",
    usage: "Servicios cobrados por uso",
    passthrough: "Servicios pass-through con markup",
    "passthrough-with-cap": "Servicios pass-through con cap mensual",
    "client-direct": "Servicios que el cliente paga directo al proveedor",
  };
  const validBillingModels = new Set(["fixed", "passthrough", "passthrough-with-cap", "client-direct"]);

  const groups: OperationalCostGroup[] = [];
  for (const [billing, svcs] of byBilling.entries()) {
    const category: OperationalCostCategory = {
      name: "Servicios",
      items: svcs.map<OperationalCostItem>((s) => {
        const formattedCost = billing === "client-direct"
          ? `${formatUSD(s.clientPaysMonthlyUSD)}/mes — cliente paga directo`
          : `${formatUSD(s.clientPaysMonthlyUSD)}/mes`;
        const noteParts: string[] = [];
        if (s.fixedMonthlyUSD > 0) noteParts.push(`base ${formatUSD(s.fixedMonthlyUSD)}`);
        if (s.variableMonthlyUSD > 0) noteParts.push(`variable ${formatUSD(s.variableMonthlyUSD)}`);
        if (s.markupPercent > 0 && billing !== "client-direct") noteParts.push(`markup ${s.markupPercent}%`);
        return {
          service: s.serviceName,
          cost: formattedCost,
          note: noteParts.length > 0 ? noteParts.join(" + ") : undefined,
        };
      }),
    };

    // operationalCostsSchema billingModel enum: ["fixed", "passthrough", "passthrough-with-cap", "client-direct"]
    // Mapeamos los nuestros: tiered y usage los tratamos como "fixed" porque no son pass-through al cliente
    const mappedBilling = validBillingModels.has(billing) ? billing : "fixed";

    groups.push({
      name: groupNameByBilling[billing] || billing,
      billingModel: mappedBilling as OperationalCostGroup["billingModel"],
      description: undefined,
      categories: [category],
    });
  }

  const operationalCosts: OperationalCostsData = {
    heading: "Costos operativos mensuales",
    intro: "Servicios externos que el cliente asume mensualmente para mantener el sistema en producción. Las tarifas incluyen las unidades incluidas en cada plan; el overage solo aplica si el uso real supera lo incluido.",
    groups,
    monthlyRangeLow: formatUSD(output.totals.monthlyLowUSD),
    monthlyRangeHigh: formatUSD(output.totals.monthlyHighUSD),
    annualEstimate: formatUSD(output.totals.annualClientPaysUSD),
    disclaimer: "Estos valores son estimaciones basadas en el uso típico esperado. Tarifas reales pueden variar según el uso del CLIENTE — IM3 notifica con anticipación cualquier cambio significativo.",
  };

  const currentSections = (proposal.sections as Record<string, unknown>) || {};
  const newSections = { ...currentSections, operationalCosts };

  await db.update(proposals)
    .set({ sections: newSections, updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));

  return { success: true };
}

function formatUSD(n: number): string {
  if (n === 0) return "$0";
  if (n < 1) return `$${n.toFixed(2)}`;
  if (n >= 100) return `$${Math.round(n).toLocaleString("en-US")}`;
  return `$${n.toFixed(2)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
