import { cn } from "@/lib/utils";

// Estado vacío consistente: icono teal-tinted + value prop + CTA opcional.
// Reemplaza los "Sin datos" planos y paneles en blanco por todo el CRM.
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Acción primaria (botón). */
  action?: React.ReactNode;
  /** Acción secundaria (ej. "Cargar datos de ejemplo"). */
  secondaryAction?: React.ReactNode;
  /** Compacto para columnas de kanban / paneles pequeños. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon, title, description, action, secondaryAction, compact, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-border text-center",
        compact ? "gap-2 p-6" : "gap-3 p-10",
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-accent text-primary",
            compact ? "h-10 w-10 [&_svg]:h-5 [&_svg]:w-5" : "h-14 w-14 [&_svg]:h-7 [&_svg]:w-7",
          )}
        >
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className={cn("font-medium text-foreground", compact ? "text-sm" : "text-base")}>{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
