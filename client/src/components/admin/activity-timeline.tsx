import { useQuery } from "@tanstack/react-query";
import {
  Send, Eye, MousePointerClick, UserPlus, Activity, FileText,
  CheckSquare, Mail, CalendarCheck, TrendingUp, UserX,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Timeline vertical unificado de actividad de un contacto (emails, status,
// notas, tareas, reuniones de Acta…). Fuente: /api/admin/contacts/:id/activity.
type ActivityItem = { id: string; type: string; description: string; metadata?: Record<string, any> | null; createdAt: string };

const TYPE_ICON: Record<string, { icon: typeof Send; tone: string }> = {
  form_submitted: { icon: UserPlus, tone: "text-primary" },
  status_changed: { icon: Activity, tone: "text-amber-500" },
  email_sent: { icon: Send, tone: "text-blue-500" },
  email_opened: { icon: Eye, tone: "text-emerald-500" },
  email_clicked: { icon: MousePointerClick, tone: "text-primary" },
  email_bounced: { icon: Mail, tone: "text-red-500" },
  note_added: { icon: FileText, tone: "text-muted-foreground" },
  note_deleted: { icon: FileText, tone: "text-muted-foreground" },
  contact_edited: { icon: Activity, tone: "text-muted-foreground" },
  task_created: { icon: CheckSquare, tone: "text-cyan-500" },
  task_completed: { icon: CheckSquare, tone: "text-emerald-500" },
  score_changed: { icon: TrendingUp, tone: "text-amber-500" },
  opted_out: { icon: UserX, tone: "text-red-500" },
  meeting: { icon: CalendarCheck, tone: "text-primary" },
};

function relTime(ts: string): string {
  const diffMin = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  return new Date(ts).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "2-digit" });
}

export function ActivityTimeline({ contactId, enabled = true, limit }: { contactId: string; enabled?: boolean; limit?: number }) {
  const { data: items = [], isLoading } = useQuery<ActivityItem[]>({
    queryKey: [`/api/admin/contacts/${contactId}/activity`],
    enabled,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="skeleton-shimmer h-7 w-7 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5 py-0.5">
              <div className="skeleton-shimmer h-3.5 w-3/4 rounded-[var(--radius-control)]" />
              <div className="skeleton-shimmer h-3 w-16 rounded-[var(--radius-control)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin actividad registrada.</p>;
  }

  const shown = limit ? items.slice(0, limit) : items;

  return (
    <ol className="space-y-0">
      {shown.map((it, i) => {
        const meta = TYPE_ICON[it.type] ?? { icon: Activity, tone: "text-muted-foreground" };
        const Icon = meta.icon;
        const last = i === shown.length - 1;
        return (
          <li key={it.id} className="relative flex gap-3">
            <div className="relative flex flex-col items-center">
              <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised">
                <Icon className={cn("h-3.5 w-3.5", meta.tone)} strokeWidth={1.5} />
              </span>
              {!last && <span className="absolute top-7 h-[calc(100%-0.5rem)] w-px bg-border" />}
            </div>
            <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-4")}>
              <p className="text-sm leading-snug text-foreground">{it.description}</p>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{relTime(it.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
