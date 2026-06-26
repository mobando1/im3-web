import { cn } from "@/lib/utils";

// Sistema de estado unificado del admin. ÚNICA fuente de verdad para colores de
// estado — reemplaza los 12+ mapas inline (statusColors/STATUS_COLORS/STAGES…)
// dispersos por contacts, pipeline, projects, auditorias, proposals, contracts,
// tasks, agents. Tinte tenue (pill), nunca fill saturado; theme-aware vía dark:.

export type Tone =
  | "neutral"
  | "blue"
  | "amber"
  | "orange"
  | "emerald"
  | "red"
  | "purple"
  | "teal";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25",
  amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25",
  orange: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/25",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25",
  red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/25",
  purple: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/25",
  teal: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/25",
};

// Color saturado para puntos sueltos (densidad alta: salud de agentes, leyendas).
const DOT_CLASSES: Record<Tone, string> = {
  neutral: "bg-muted-foreground/50",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  emerald: "bg-emerald-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  teal: "bg-teal-500",
};

type StatusDef = { tone: Tone; label: string };

// Vocabulario completo extraído de los mapas existentes en todo el CRM.
const STATUS_MAP: Record<string, StatusDef> = {
  // Ciclo de vida del contacto
  lead: { tone: "blue", label: "Lead" },
  contacted: { tone: "amber", label: "Contactado" },
  scheduled: { tone: "orange", label: "Agendado" },
  converted: { tone: "emerald", label: "Convertido" },
  // Etapas de deal (pipeline)
  qualification: { tone: "blue", label: "Calificación" },
  proposal: { tone: "amber", label: "Propuesta" },
  negotiation: { tone: "purple", label: "Negociación" },
  closed_won: { tone: "emerald", label: "Ganado" },
  closed_lost: { tone: "red", label: "Perdido" },
  won: { tone: "emerald", label: "Ganado" },
  lost: { tone: "red", label: "Perdido" },
  // Documentos (propuestas / contratos)
  draft: { tone: "neutral", label: "Borrador" },
  sent: { tone: "blue", label: "Enviada" },
  viewed: { tone: "amber", label: "Vista" },
  accepted: { tone: "emerald", label: "Aceptada" },
  rejected: { tone: "red", label: "Rechazada" },
  expired: { tone: "neutral", label: "Expirada" },
  locked: { tone: "amber", label: "Bloqueado" },
  signed: { tone: "emerald", label: "Firmado" },
  cancelled: { tone: "red", label: "Cancelado" },
  // Proyectos / auditorías / jobs
  planning: { tone: "blue", label: "Planeación" },
  in_progress: { tone: "emerald", label: "En curso" },
  paused: { tone: "amber", label: "Pausado" },
  completed: { tone: "neutral", label: "Completado" },
  queued: { tone: "amber", label: "En cola" },
  processing: { tone: "blue", label: "Procesando" },
  ready: { tone: "emerald", label: "Listo" },
  error: { tone: "red", label: "Error" },
  // Engagement de email
  pending: { tone: "neutral", label: "Pendiente" },
  opened: { tone: "emerald", label: "Abierto" },
  clicked: { tone: "teal", label: "Click" },
  bounced: { tone: "red", label: "Rebotado" },
  failed: { tone: "red", label: "Falló" },
  // Salud de agentes
  healthy: { tone: "emerald", label: "Saludable" },
  warning: { tone: "amber", label: "Alerta" },
  degraded: { tone: "amber", label: "Degradado" },
  down: { tone: "red", label: "Caído" },
  ok: { tone: "emerald", label: "OK" },
  // Prioridad de tareas
  high: { tone: "red", label: "Alta" },
  medium: { tone: "amber", label: "Media" },
  low: { tone: "neutral", label: "Baja" },
};

export function statusTone(status?: string | null): Tone {
  if (!status) return "neutral";
  return STATUS_MAP[status]?.tone ?? "neutral";
}

export function statusLabel(status?: string | null): string {
  if (!status) return "—";
  return STATUS_MAP[status]?.label ?? status.replace(/_/g, " ");
}

interface StatusBadgeProps {
  /** Clave de estado conocida; auto-mapea tono + etiqueta. */
  status?: string | null;
  /** Override del tono (para estados ambiguos o ad-hoc). */
  tone?: Tone;
  /** Override de la etiqueta. */
  label?: React.ReactNode;
  /** Mostrar punto guía a la izquierda. */
  dot?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({ status, tone, label, dot = true, size = "md", className }: StatusBadgeProps) {
  const resolvedTone = tone ?? statusTone(status);
  const resolvedLabel = label ?? statusLabel(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] border font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        TONE_CLASSES[resolvedTone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />}
      {resolvedLabel}
    </span>
  );
}

/** Solo el punto de color (para densidades altas: filas de agentes, leyendas). */
export function StatusDot({ status, tone, className, title }: { status?: string | null; tone?: Tone; className?: string; title?: string }) {
  const resolvedTone = tone ?? statusTone(status);
  return (
    <span
      title={title ?? (status ? statusLabel(status) : undefined)}
      className={cn("inline-block h-2 w-2 rounded-full", DOT_CLASSES[resolvedTone], className)}
    >
      <span className="sr-only">{status ? statusLabel(status) : ""}</span>
    </span>
  );
}
