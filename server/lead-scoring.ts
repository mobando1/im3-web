import type { Contact, Diagnostic } from "@shared/schema";

type EmailSummary = {
  sent: number;
  opened: number;
  clicked: number;
  firstOpenDelayMinutes?: number; // minutes between first email sent and first open
};

export function calculateLeadScore(
  contact: Contact,
  diagnostic: Partial<Diagnostic> | null,
  emails: EmailSummary
): number {
  let score = 0;

  if (diagnostic) {
    // Budget
    const budget = (diagnostic.presupuesto || "").toLowerCase();
    if (budget.includes("5000") || budget.includes("10000") || budget.includes("más de") || budget.includes("alto")) {
      score += 25;
    } else if (budget.includes("1000") || budget.includes("2000") || budget.includes("3000") || budget.includes("medio")) {
      score += 15;
    } else if (budget) {
      score += 5;
    }

    // Company size
    const employees = (diagnostic.empleados || "").toLowerCase();
    if (employees.includes("50") || employees.includes("100") || employees.includes("más de")) {
      score += 15;
    } else if (employees.includes("10") || employees.includes("20") || employees.includes("30")) {
      score += 10;
    } else if (employees) {
      score += 5;
    }

    // Uses AI
    const usesAI = (diagnostic.usaIA || "").toLowerCase();
    if (usesAI === "sí" || usesAI === "si" || usesAI === "yes") {
      score += 10;
    }

    // Tech level
    const techLevel = (diagnostic.nivelTech || "").toLowerCase();
    if (techLevel.includes("alto") || techLevel.includes("avanzado")) {
      score += 10;
    } else if (techLevel.includes("medio") || techLevel.includes("intermedio")) {
      score += 5;
    }

    // Priority areas (more = more engaged)
    const areas = diagnostic.areaPrioridad;
    if (Array.isArray(areas) && areas.length >= 3) {
      score += 10;
    } else if (Array.isArray(areas) && areas.length >= 1) {
      score += 5;
    }

    // Form duration — serious leads spend time filling it out
    if (diagnostic.formDurationMinutes && diagnostic.formDurationMinutes > 8) {
      score += 5;
    }
  }

  // Email engagement — open rate instead of raw count
  if (emails.sent > 0) {
    const openRate = emails.opened / emails.sent;
    score += Math.round(openRate * 20); // Max 20 pts for 100% open rate
  }

  // Speed of engagement — opened within 1 hour
  if (emails.firstOpenDelayMinutes !== undefined && emails.firstOpenDelayMinutes < 60) {
    score += 5;
  }

  // Clicks
  score += Math.min(emails.clicked * 10, 20); // Max 20 from clicks

  // Status-based
  if (contact.status === "scheduled") score += 15;
  if (contact.status === "converted") score += 20;

  // Newsletter subscriber who booked = warmer lead
  const tags = (contact as any).tags as string[] || [];
  if (tags.includes("newsletter") && contact.status === "scheduled") {
    score += 10;
  }

  // Decay — inactive leads lose points over time
  if (contact.lastActivityAt) {
    const daysSince = Math.floor((Date.now() - new Date(contact.lastActivityAt).getTime()) / 86400000);
    if (daysSince > 7) {
      score -= Math.min(Math.floor(daysSince / 7), 15);
    }
  }

  return Math.max(0, Math.min(score, 100));
}
