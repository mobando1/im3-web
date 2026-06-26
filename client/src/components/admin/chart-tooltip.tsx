// Tooltip único para todos los charts de Recharts (token bg, hairline, radius
// card, texto tabular). Uso: <Tooltip content={<ChartTooltip />} /> dentro de
// cualquier chart de recharts; recharts inyecta active/payload/label.
interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  fill?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatter?: (value: number | string | undefined, name: string | undefined) => React.ReactNode;
  labelFormatter?: (label: string | number | undefined) => React.ReactNode;
}

export function ChartTooltip({ active, payload, label, formatter, labelFormatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-popover px-3 py-2 text-popover-foreground shadow-[0_8px_24px_-8px_rgba(0,0,0,0.55)]">
      {label !== undefined && label !== "" && (
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-0.5">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: entry.color || entry.fill }} />
            {entry.name && <span className="text-muted-foreground">{entry.name}</span>}
            <span className="ml-auto pl-3 font-medium tabular-nums text-foreground">
              {formatter ? formatter(entry.value, entry.name) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
