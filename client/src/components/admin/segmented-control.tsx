import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Control segmentado (ej. rango 7d/30d/90d). Glide teal del seleccionado vía layoutId.
interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** id único para el layoutId del indicador (evita colisiones si hay varios). */
  layoutId?: string;
  className?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, layoutId = "seg", className }: SegmentedControlProps<T>) {
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-[var(--radius-control)] border border-border bg-surface p-0.5", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative rounded-[calc(var(--radius-control)-2px)] px-3 py-1 text-xs font-medium transition-colors",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[calc(var(--radius-control)-2px)] bg-primary"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10 tabular-nums">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
