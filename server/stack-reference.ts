import { db } from "./db";
import { stackServices, type StackService } from "@shared/schema";
import { eq, asc } from "drizzle-orm";

/**
 * Lee el catálogo `stack_services` (servicios activos) de la DB y lo serializa
 * como texto estructurado para inyectar en el system prompt de Claude.
 *
 * Reemplaza al archivo `shared/proposal-cost-reference.md` que era el contexto
 * de precios para la generación de propuestas y el chat de refinamiento.
 *
 * Ventajas:
 *  - Cuando el admin edita un precio en /admin/stack-catalog, Claude lo usa al instante
 *    en la siguiente generación (sin necesidad de redeploy ni editar archivos).
 *  - Una sola fuente de verdad: lo que ve el admin = lo que ve Claude.
 *
 * Si la DB no está disponible o el catálogo está vacío, devuelve string vacío
 * (Claude usará el VOICE_GUIDE + contexto del cliente solamente).
 */

const CATEGORY_LABELS: Record<string, string> = {
  database: "Bases de datos",
  storage: "Almacenamiento",
  ai: "IA / LLMs",
  messaging: "Mensajería",
  hosting: "Hosting / Compute",
  payments: "Pagos",
  email: "Email",
  other: "Otros",
};

const BILLING_LABELS: Record<string, string> = {
  fixed: "Tarifa fija mensual",
  tiered: "Tier base + overage",
  usage: "Solo uso (pago por consumo)",
  passthrough: "Pass-through con markup",
  "passthrough-with-cap": "Pass-through con tope mensual",
  "client-direct": "Cliente paga directo al proveedor",
};

let cached: { text: string; ts: number } | null = null;
const TTL_MS = 60_000; // 1 min — refresca casi en tiempo real pero evita query por mensaje

export async function buildStackReferenceFromDB(opts?: { skipCache?: boolean }): Promise<string> {
  if (!db) return "";

  if (!opts?.skipCache && cached && Date.now() - cached.ts < TTL_MS) {
    return cached.text;
  }

  let services: StackService[] = [];
  try {
    services = await db.select().from(stackServices)
      .where(eq(stackServices.isActive, true))
      .orderBy(asc(stackServices.category), asc(stackServices.name));
  } catch (err) {
    return "";
  }

  if (services.length === 0) return "";

  // Agrupar por categoría
  const byCategory = new Map<string, StackService[]>();
  for (const s of services) {
    if (!byCategory.has(s.category)) byCategory.set(s.category, []);
    byCategory.get(s.category)!.push(s);
  }

  const lines: string[] = [];
  lines.push("CATÁLOGO DE STACK & COSTOS — fuente de verdad de IM3");
  lines.push("(Editado en /admin/stack-catalog. Precios sacados de páginas oficiales de cada vendor.)");
  lines.push("");
  lines.push("Cuando incluyas un servicio en operationalCosts, USA los precios EXACTOS de aquí. NO inventes.");
  lines.push("Modelos de cobro:");
  lines.push("  fixed/tiered/usage = IM3 cobra el costo real al cliente (sin markup) como pass-through silencioso");
  lines.push("  passthrough        = IM3 cobra costo + markup%");
  lines.push("  passthrough-with-cap = igual + tope mensual con alertas");
  lines.push("  client-direct      = cliente paga DIRECTO al proveedor — informativo, NO sumar al total IM3");
  lines.push("");

  for (const [category, list] of byCategory.entries()) {
    lines.push(`═══ ${CATEGORY_LABELS[category] || category.toUpperCase()} ═══`);
    for (const s of list) {
      lines.push("");
      lines.push(`▸ ${s.name}${s.vendor ? ` (${s.vendor})` : ""}`);
      if (s.description) lines.push(`  ${s.description}`);
      lines.push(`  Modelo: ${BILLING_LABELS[s.billingModel] || s.billingModel}`);
      const baseFee = parseFloat(s.baseFeeUSD || "0");
      if (baseFee > 0) {
        lines.push(`  Tarifa base: $${baseFee.toFixed(2)} USD/mes`);
      }
      const markup = parseFloat(s.markupPercent || "0");
      if (markup > 0) {
        lines.push(`  Markup IM3: +${markup}%`);
      }
      const units = s.pricingUnits || [];
      if (units.length > 0) {
        lines.push(`  Tarifas variables (overage):`);
        for (const pu of units) {
          const incluido = pu.includedQuantity > 0 ? `${pu.includedQuantity} incluidas, ` : "";
          lines.push(`    • ${pu.unit}: ${incluido}$${pu.overageUnitCostUSD}/unidad extra${pu.note ? ` (${pu.note})` : ""}`);
        }
      }
      if (s.url) lines.push(`  Pricing oficial: ${s.url}`);
      if (s.internalNotes) lines.push(`  [interno] ${s.internalNotes}`);
    }
    lines.push("");
  }

  lines.push("REGLAS DE USO:");
  lines.push("- Para operationalCosts, agrupa los servicios por billingModel (un grupo por modelo).");
  lines.push("- Cada item dentro de un grupo usa el costo EXACTO derivado del catálogo (base fee + overage estimado).");
  lines.push("- Si un servicio es 'client-direct', menciónalo como informativo pero NO lo sumes al monthly range.");
  lines.push("- monthlyRangeLow = suma de bases + overages conservadores. monthlyRangeHigh = + buffer 25%.");
  lines.push("- annualEstimate = monthlyRangeHigh × 12.");
  lines.push("- Si un módulo de la solución NO necesita un servicio del catálogo, NO lo incluyas (no metas servicios 'ghost').");

  const text = lines.join("\n");
  cached = { text, ts: Date.now() };
  return text;
}

/** Invalida el cache — útil tras editar un servicio en /admin/stack-catalog */
export function invalidateStackReferenceCache() {
  cached = null;
}
