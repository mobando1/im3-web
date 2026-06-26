import { useEffect, useState } from "react";
import { animate, useMotionValue, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { EASE } from "@/lib/motion";

// Paleta de charts (literal — recharts no resuelve var() en atributos SVG).
const CHART_TEAL = "#2FA4A9";

/** Sparkline minimal (sin ejes/grid/tooltip) para tendencia en MetricCard. */
export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (!data || data.length < 2) return null;
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <div className={cn("h-10 w-full", className)} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="im3-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_TEAL} stopOpacity={0.28} />
              <stop offset="100%" stopColor={CHART_TEAL} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={CHART_TEAL} strokeWidth={1.5} fill="url(#im3-spark)" isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Número con count-up al montar (respeta reduced-motion). */
function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(mv, value, {
      duration: 0.6,
      ease: EASE.entrance,
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);

  return <>{format ? format(display) : Math.round(display).toLocaleString("es-CO")}</>;
}

type Delta = { value: string; direction: "up" | "down" | "neutral" };

interface MetricCardProps {
  label: string;
  /** Valor numérico (se anima con count-up) o nodo pre-formateado. */
  value: number | React.ReactNode;
  /** Formateador aplicado al número animado (ej. moneda, %). */
  format?: (n: number) => string;
  delta?: Delta;
  /** Subtítulo muted (cuando no hay delta): ej. "12 hot leads". */
  hint?: string;
  /** Serie de tendencia (8–12 puntos) → sparkline. */
  trend?: number[];
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({ label, value, format, delta, hint, trend, icon, className }: MetricCardProps) {
  const deltaColor =
    delta?.direction === "down"
      ? "text-red-600 dark:text-red-400"
      : delta?.direction === "neutral"
        ? "text-muted-foreground"
        : "text-emerald-600 dark:text-emerald-400";
  const DeltaIcon = delta?.direction === "down" ? ArrowDownRight : ArrowUpRight;

  return (
    <div className={cn("rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-[var(--rim)]", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground/60 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
      </div>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {typeof value === "number" ? <CountUp value={value} format={format} /> : value}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        {delta ? (
          <span className={cn("inline-flex items-center gap-0.5 text-xs tabular-nums", deltaColor)}>
            {delta.direction !== "neutral" && <DeltaIcon className="h-3 w-3" />}
            {delta.value}
          </span>
        ) : hint ? (
          <span className="text-xs text-muted-foreground truncate">{hint}</span>
        ) : (
          <span />
        )}
        {trend && trend.length >= 2 && <Sparkline data={trend} className="h-8 max-w-[7rem]" />}
      </div>
    </div>
  );
}
