import { cn } from "@/lib/utils";

// Encabezado de página estándar. Unifica el ritmo superior (título Manrope +
// subtítulo + acciones a la derecha) que hoy está duplicado ad-hoc por página.
interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Acciones alineadas a la derecha (botones, controles de rango, etc.). */
  actions?: React.ReactNode;
  /** Migas o tabs opcionales debajo del título. */
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, children, icon, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent text-primary">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
