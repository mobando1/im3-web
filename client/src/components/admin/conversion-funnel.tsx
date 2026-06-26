import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE } from "@/lib/motion";

// Funnel de conversión horizontal con ramp teal (claro→marca) y % entre etapas.
// Reemplaza el donut de etapas: comunica la conversión, no solo la distribución.
const TEAL_RAMP = ["#8fd3d6", "#5bbcbf", "#3aabaf", "#2FA4A9"];

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
}

export function ConversionFunnel({ stages, className }: { stages: FunnelStage[]; className?: string }) {
  const max = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className={cn("space-y-4", className)}>
      {stages.map((s, i) => {
        const pct = (s.value / max) * 100;
        const prev = i > 0 ? stages[i - 1].value : null;
        const conv = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null;
        return (
          <div key={s.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{s.label}</span>
              <div className="flex items-center gap-2">
                {conv !== null && <span className="tabular-nums text-muted-foreground/70">{conv}% conv.</span>}
                <span className="font-medium tabular-nums text-foreground">{s.value.toLocaleString("es-CO")}</span>
              </div>
            </div>
            <div className="h-7 overflow-hidden rounded-[var(--radius-control)] bg-surface">
              <motion.div
                className="h-full rounded-[var(--radius-control)]"
                style={{ background: TEAL_RAMP[i] ?? TEAL_RAMP[TEAL_RAMP.length - 1] }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(pct, 3)}%` }}
                transition={{ duration: 0.5, ease: EASE.entrance, delay: i * 0.05 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
