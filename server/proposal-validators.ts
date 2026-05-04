/**
 * Validators matemáticos puros para propuestas.
 * No usan IA — son chequeos deterministas basados en reglas de negocio.
 * Devuelven warnings legibles que se pueden mostrar al usuario o feedbackear a Claude.
 */

export type ValidationIssue = {
  severity: "error" | "warning" | "info";
  section: string;
  message: string;
};

/**
 * Parsea un string de moneda como "$140.000.000 COP" o "USD 25,000" o "85M COP" → number.
 * Heurística simple para los formatos típicos de las propuestas IM3.
 */
function parseAmount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const s = raw.toString().trim();
  if (!s) return null;

  // Detectar sufijo M (millones)
  const millionsMatch = s.match(/(\d+(?:[.,]\d+)?)\s*M\b/i);
  if (millionsMatch) {
    const n = parseFloat(millionsMatch[1].replace(",", "."));
    if (!isNaN(n)) return n * 1_000_000;
  }

  // Quitar símbolos de moneda y letras → quedan solo dígitos/separadores
  const cleaned = s.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  // Si tiene tanto "." como ",", asumir que el último es decimal
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let normalized: string;
  if (lastDot > -1 && lastComma > -1) {
    if (lastDot > lastComma) {
      // "1,234,567.89" — comas son miles, punto decimal
      normalized = cleaned.replace(/,/g, "");
    } else {
      // "1.234.567,89" — puntos son miles, coma decimal
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    }
  } else if (lastComma > -1) {
    // Solo coma: si hay 3 dígitos después, son miles. Si no, decimal.
    const after = cleaned.substring(lastComma + 1);
    normalized = after.length === 3 ? cleaned.replace(",", "") : cleaned.replace(",", ".");
  } else {
    // Solo punto: si hay 3 dígitos después, son miles. Si no, decimal.
    const after = cleaned.substring(lastDot + 1);
    normalized = lastDot > -1 && after.length === 3 ? cleaned.replace(".", "") : cleaned;
  }

  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

/**
 * Valida que la suma de milestones[].amount esté cerca del pricing.amount total.
 * Tolerancia: 1% (puede haber redondeos en milestones porcentuales).
 */
export function validateMilestoneSum(pricing: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!pricing || typeof pricing !== "object") return issues;
  const p = pricing as { amount?: string; milestones?: Array<{ amount?: string; name?: string }> };

  const total = parseAmount(p.amount);
  if (total === null) return issues;

  const milestones = p.milestones || [];
  if (milestones.length === 0) return issues;

  const sum = milestones.reduce((acc, m) => acc + (parseAmount(m.amount) ?? 0), 0);
  if (sum === 0) return issues;

  const diff = Math.abs(sum - total);
  const tolerance = total * 0.01; // 1%

  if (diff > tolerance) {
    issues.push({
      severity: "warning",
      section: "pricing",
      message: `Suma de milestones (${sum.toLocaleString()}) ≠ amount total (${total.toLocaleString()}). Diferencia: ${diff.toLocaleString()} (${((diff / total) * 100).toFixed(1)}%)`,
    });
  }
  return issues;
}

/**
 * Valida que cada module mencionado en solution aparezca en alguna phase del timeline.
 * Si timeline no está, no es error — es opcional.
 */
export function validateTimelineCoversSolution(solution: unknown, timeline: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!solution || !timeline) return issues;
  const s = solution as { modules?: Array<{ title?: string }> };
  const t = timeline as { phases?: Array<{ items?: string[] }> };

  const modules = s.modules || [];
  const phases = t.phases || [];
  if (modules.length === 0 || phases.length === 0) return issues;

  const allTimelineText = phases.flatMap(p => p.items || []).join(" ").toLowerCase();

  for (const mod of modules) {
    if (!mod.title) continue;
    // Heurística: el título del module o sus 2 primeras palabras significativas deben aparecer en el timeline
    const titleWords = mod.title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const found = titleWords.some(w => allTimelineText.includes(w));
    if (!found && titleWords.length > 0) {
      issues.push({
        severity: "warning",
        section: "timeline",
        message: `Módulo "${mod.title}" no aparece en ninguna fase del timeline`,
      });
    }
  }
  return issues;
}

/**
 * Valida coherencia entre roi.recoveries[] y roi.heroDescription / roiPercent.
 * Más laxo: solo chequea que recoveries no sume 0 si hay roiPercent.
 */
export function validateRoiInternal(roi: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!roi || typeof roi !== "object") return issues;
  const r = roi as { recoveries?: Array<{ amount?: string; label?: string }>; roiPercent?: string };

  const recoveries = r.recoveries || [];
  if (recoveries.length === 0 && r.roiPercent) {
    issues.push({
      severity: "warning",
      section: "roi",
      message: `roiPercent está definido pero no hay recoveries — la sección quedará vacía`,
    });
  }

  for (const rec of recoveries) {
    const amount = parseAmount(rec.amount);
    if (amount === null) {
      issues.push({
        severity: "info",
        section: "roi",
        message: `Recovery "${rec.label || "(sin label)"}" tiene amount no parseable: "${rec.amount}"`,
      });
    }
  }

  return issues;
}

/**
 * Valida operationalCosts: si hay groups con tarifas fijas, sumar y comparar
 * con monthlyRangeLow/High.
 */
export function validateOpCostsRanges(opCosts: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!opCosts || typeof opCosts !== "object") return issues;
  const o = opCosts as {
    monthlyRangeLow?: string | null;
    monthlyRangeHigh?: string | null;
    groups?: Array<{ monthlyFee?: string; billingModel?: string }>;
  };

  const low = parseAmount(o.monthlyRangeLow);
  const high = parseAmount(o.monthlyRangeHigh);

  if (low !== null && high !== null && low > high) {
    issues.push({
      severity: "error",
      section: "operationalCosts",
      message: `monthlyRangeLow (${low.toLocaleString()}) es mayor que monthlyRangeHigh (${high.toLocaleString()})`,
    });
  }

  // Sumar tarifas fijas y verificar que estén dentro del rango
  const groups = o.groups || [];
  const fixedSum = groups
    .filter(g => g.billingModel === "fixed")
    .reduce((acc, g) => acc + (parseAmount(g.monthlyFee) ?? 0), 0);

  if (fixedSum > 0 && low !== null && fixedSum > low * 1.5) {
    issues.push({
      severity: "info",
      section: "operationalCosts",
      message: `Suma de tarifas fijas (${fixedSum.toLocaleString()}) excede 1.5× monthlyRangeLow (${low.toLocaleString()})`,
    });
  }

  return issues;
}

/**
 * Corre TODOS los validators sobre una propuesta completa y devuelve los issues encontrados.
 */
export function runAllValidators(sections: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (sections.pricing) issues.push(...validateMilestoneSum(sections.pricing));
  if (sections.solution && sections.timeline) issues.push(...validateTimelineCoversSolution(sections.solution, sections.timeline));
  if (sections.roi) issues.push(...validateRoiInternal(sections.roi));
  if (sections.operationalCosts) issues.push(...validateOpCostsRanges(sections.operationalCosts));

  return issues;
}

/**
 * Formatea issues como texto legible para mostrar a Claude o al usuario.
 */
export function formatIssuesAsText(issues: ValidationIssue[]): string {
  if (issues.length === 0) return "✓ No se detectaron inconsistencias matemáticas.";

  const grouped: Record<string, ValidationIssue[]> = {};
  for (const issue of issues) {
    if (!grouped[issue.section]) grouped[issue.section] = [];
    grouped[issue.section].push(issue);
  }

  const lines: string[] = [];
  for (const [section, sectionIssues] of Object.entries(grouped)) {
    lines.push(`\n📍 ${section}:`);
    for (const issue of sectionIssues) {
      const icon = issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "ℹ️";
      lines.push(`  ${icon} ${issue.message}`);
    }
  }
  return lines.join("\n");
}
