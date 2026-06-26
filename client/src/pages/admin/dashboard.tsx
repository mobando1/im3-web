import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Users, Mail, Calendar, Eye, Clock, CheckSquare, Flame,
  AlertTriangle, DollarSign, Briefcase, ArrowUpRight,
  Activity, Send, MousePointerClick, UserPlus, FileText, Target, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  PageHeader, MetricCard, ConversionFunnel, ChartTooltip, StatusDot,
  EmptyState, SkeletonCard, SeedDemoButton,
} from "@/components/admin";
import { listContainer, listItem } from "@/lib/motion";

type UpcomingTask = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: string;
  status: string;
};

type DashboardData = {
  kpis: {
    totalContacts: number;
    conversionRate: number;
    emailsThisWeek: number;
    upcomingAppointments: number;
    openRate: number;
    pendingTasks: number;
    overdueTasks: number;
    hotLeads: number;
    pipelineValue: number;
    dealsWonThisMonth: number;
    dealsWonValue: number;
    winRate: number;
    avgDealSize: number;
    unreadNotifications: number;
  };
  pipeline: { lead: number; contacted: number; scheduled: number; converted: number };
  emailPerformance: Array<{ template: string; sent: number; opened: number; rate: number }>;
  recentActivity: Array<{
    type: string;
    contactName: string;
    contactId: string;
    detail: string;
    timestamp: string;
  }>;
  upcomingTasks: UpcomingTask[];
  attentionItems: Array<{
    type: string;
    contactId?: string;
    nombre?: string;
    empresa?: string;
    score?: number;
    taskId?: string;
    title?: string;
    dueDate?: string;
  }>;
  staleDeals: Array<{
    id: string;
    title: string;
    value: number | null;
    stage: string;
    contactId: string;
    createdAt: string;
  }>;
};

// Paleta de charts (literal — recharts no resuelve var() en SVG). 3 roles máx.
const CHART = { teal: "#2FA4A9", emerald: "#10b981", slate: "#94a3b8" };
const GRID = "rgba(148,163,184,0.18)";

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `hace ${diffDays}d`;
  return `hace ${Math.floor(diffDays / 30)}mes`;
}

function getGreeting(): string {
  return new Date().getHours() < 12 ? "Buenos días" : "Buenas tardes";
}

const STAGE_LABELS: Record<string, string> = {
  qualification: "Calificación",
  proposal: "Propuesta",
  negotiation: "Negociación",
  closed_won: "Ganado",
  closed_lost: "Perdido",
};

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
const fmtPct = (n: number) => `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;

function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="skeleton-shimmer h-7 w-48 rounded-[var(--radius-control)]" />
        <div className="skeleton-shimmer h-4 w-64 rounded-[var(--radius-control)]" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="skeleton-shimmer h-72 rounded-[var(--radius-card)] lg:col-span-2" />
        <div className="skeleton-shimmer h-72 rounded-[var(--radius-card)] lg:col-span-3" />
      </div>
    </div>
  );
}

function activityIcon(type: string) {
  switch (type) {
    case "email_sent": return { icon: Send, tone: "text-blue-500" };
    case "email_opened": return { icon: Eye, tone: "text-emerald-500" };
    case "email_clicked": return { icon: MousePointerClick, tone: "text-primary" };
    case "form_submitted": return { icon: UserPlus, tone: "text-primary" };
    case "status_changed": return { icon: Activity, tone: "text-amber-500" };
    case "note_added": return { icon: FileText, tone: "text-muted-foreground" };
    case "task_created": return { icon: CheckSquare, tone: "text-cyan-500" };
    default: return { icon: Activity, tone: "text-muted-foreground" };
  }
}

function activityLabel(type: string, contactName: string, detail: string) {
  const who = <span className="font-medium text-foreground">{contactName}</span>;
  switch (type) {
    case "email_sent": return <>{who} — email enviado: "{detail}"</>;
    case "email_opened": return <>{who} abrió "{detail}"</>;
    case "email_clicked": return <>{who} hizo click en "{detail}"</>;
    case "form_submitted": return <>Nuevo lead: {who}</>;
    default: return <>{who} — {detail}</>;
  }
}

export default function Dashboard() {
  const [, navigate] = useLocation();

  const { data, isLoading, isError, refetch } = useQuery<DashboardData>({
    queryKey: ["/api/admin/dashboard"],
  });

  if (isLoading) return <SkeletonDashboard />;

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title={getGreeting()} subtitle="Aquí tienes el resumen de tu CRM" />
        <EmptyState
          icon={<AlertTriangle />}
          title="No se pudo cargar el dashboard"
          description="Hubo un problema al traer los datos."
          action={
            <button
              onClick={() => refetch()}
              className="rounded-[var(--radius-control)] bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Reintentar
            </button>
          }
        />
      </div>
    );
  }

  const { kpis, pipeline, emailPerformance, recentActivity, upcomingTasks, attentionItems, staleDeals } = data;

  const funnelStages = [
    { key: "lead", label: "Lead", value: pipeline.lead },
    { key: "contacted", label: "Contactado", value: pipeline.contacted },
    { key: "scheduled", label: "Agendado", value: pipeline.scheduled },
    { key: "converted", label: "Convertido", value: pipeline.converted },
  ];
  const hasPipeline = funnelStages.some((s) => s.value > 0);

  const secondaryKpis = [
    { label: "Emails (sem)", value: kpis.emailsThisWeek, icon: Mail },
    { label: "Apertura", value: fmtPct(kpis.openRate), icon: Eye },
    { label: "Citas", value: kpis.upcomingAppointments, icon: Calendar },
    { label: "Win rate", value: fmtPct(kpis.winRate), icon: TrendingUp },
    { label: "Ticket prom.", value: fmtMoney(kpis.avgDealSize), icon: Briefcase },
    {
      label: "Tareas",
      value: kpis.pendingTasks,
      icon: CheckSquare,
      danger: kpis.overdueTasks > 0,
    },
  ];

  const chartData = emailPerformance.map((ep) => ({
    name: ep.template.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    Enviados: ep.sent,
    Abiertos: ep.opened,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={getGreeting()}
        subtitle={`Resumen de tu CRM — ${new Date().toLocaleDateString("es-CO", { weekday: "long", month: "long", day: "numeric" })}`}
        actions={
          <>
            {kpis.unreadNotifications > 0 && (
              <span className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-amber-50 px-3 py-1.5 text-sm text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                <Flame className="h-4 w-4" />
                {kpis.unreadNotifications} sin leer
              </span>
            )}
            <SeedDemoButton variant="outline" />
          </>
        }
      />

      {/* Banner de atención */}
      {attentionItems && attentionItems.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-red-200/60 bg-red-50/60 p-4 dark:border-red-500/20 dark:bg-red-500/10">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-semibold text-red-700 dark:text-red-300">
              Requiere atención ({attentionItems.length})
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {attentionItems.slice(0, 4).map((item, idx) => (
              <button
                key={idx}
                onClick={() => item.contactId && navigate(`/admin/contacts/${item.contactId}`)}
                className="flex items-center gap-2.5 rounded-[var(--radius-control)] bg-card/70 px-3 py-2 text-left transition-colors hover:bg-card"
              >
                {item.type === "hot_no_followup" ? (
                  <>
                    <Flame className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                    <span className="truncate text-sm text-foreground">
                      <span className="font-medium">{item.nombre}</span> — score {item.score}
                    </span>
                  </>
                ) : (
                  <>
                    <Clock className="h-3.5 w-3.5 shrink-0 text-red-500" />
                    <span className="truncate text-sm text-foreground">
                      <span className="font-medium">{item.title}</span>
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MetricCards primarias */}
      <motion.div
        variants={listContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {[
          <MetricCard key="c" label="Contactos" value={kpis.totalContacts} icon={<Users />} hint={`${kpis.hotLeads} hot leads`} />,
          <MetricCard key="cv" label="Conversión" value={kpis.conversionRate} format={fmtPct} icon={<Target />} hint={`${pipeline.converted} convertidos`} />,
          <MetricCard key="p" label="Pipeline" value={kpis.pipelineValue} format={fmtMoney} icon={<DollarSign />} hint={`${kpis.dealsWonThisMonth} deals este mes`} />,
          <MetricCard key="w" label="Ganado este mes" value={kpis.dealsWonValue} format={fmtMoney} icon={<Briefcase />} hint={`${kpis.dealsWonThisMonth} cerrados`} />,
        ].map((card, i) => (
          <motion.div key={i} variants={listItem}>{card}</motion.div>
        ))}
      </motion.div>

      {/* Strip secundario */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {secondaryKpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-card px-4 py-3">
              <Icon className={`h-4 w-4 shrink-0 ${kpi.danger ? "text-red-500" : "text-muted-foreground"}`} strokeWidth={1.5} />
              <div className="min-w-0">
                <p className={`text-lg font-semibold leading-tight tabular-nums ${kpi.danger ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>{kpi.value}</p>
                <p className="mono-tag text-muted-foreground/70">{kpi.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts: funnel + email */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader className="px-6 pt-5 pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Funnel de conversión</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-2">
            {hasPipeline ? (
              <ConversionFunnel stages={funnelStages} />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Sin datos de pipeline</div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="px-6 pt-5 pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">Rendimiento de emails</CardTitle>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CHART.slate }} /> Enviados</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CHART.teal }} /> Abiertos</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-2 pt-2">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: CHART.slate, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fill: CHART.slate, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                  <Bar dataKey="Enviados" fill={CHART.slate} radius={[4, 4, 0, 0]} barSize={18} />
                  <Bar dataKey="Abiertos" fill={CHART.teal} radius={[4, 4, 0, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center">
                <div className="text-center">
                  <Mail className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Sin datos de email aún</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actividad + Tareas + Stale */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="px-6 pt-5 pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentActivity.length > 0 ? (
              <motion.ul variants={listContainer} initial="hidden" animate="visible" className="divide-y divide-border">
                {recentActivity.slice(0, 8).map((event, idx) => {
                  const ai = activityIcon(event.type);
                  const Icon = ai.icon;
                  return (
                    <motion.li
                      key={idx}
                      variants={listItem}
                      className="flex cursor-pointer items-center gap-3 px-6 py-3 transition-colors hover:bg-surface-hover"
                      onClick={() => navigate(`/admin/contacts/${event.contactId}`)}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${ai.tone}`} strokeWidth={1.5} />
                      <span className="flex-1 truncate text-sm leading-snug text-muted-foreground">
                        {activityLabel(event.type, event.contactName, event.detail)}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/60">
                        {relativeTime(event.timestamp)}
                      </span>
                    </motion.li>
                  );
                })}
              </motion.ul>
            ) : (
              <div className="py-10 text-center">
                <Activity className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Sin actividad reciente</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="px-6 pt-5 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  Tareas pendientes
                  {kpis.overdueTasks > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-300">
                      {kpis.overdueTasks} vencida{kpis.overdueTasks > 1 ? "s" : ""}
                    </span>
                  )}
                </CardTitle>
                <button onClick={() => navigate("/admin/tasks")} className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
                  Ver todas <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {upcomingTasks && upcomingTasks.length > 0 ? (
                <ul className="divide-y divide-border">
                  {upcomingTasks.slice(0, 5).map((task) => {
                    const overdue = task.dueDate && new Date(task.dueDate) < new Date();
                    return (
                      <li key={task.id} className="flex items-center gap-3 px-6 py-2.5 transition-colors hover:bg-surface-hover">
                        <StatusDot status={task.priority} />
                        <span className={`flex-1 truncate text-sm ${overdue ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>{task.title}</span>
                        {task.dueDate && (
                          <span className={`shrink-0 text-[11px] tabular-nums ${overdue ? "font-medium text-red-500" : "text-muted-foreground"}`}>
                            {new Date(task.dueDate).toLocaleDateString("es-CO", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="py-8 text-center">
                  <CheckSquare className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Sin tareas pendientes</p>
                </div>
              )}
            </CardContent>
          </Card>

          {staleDeals && staleDeals.length > 0 && (
            <Card className="border-amber-200/70 dark:border-amber-500/20">
              <CardHeader className="px-6 pt-5 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                  <Clock className="h-4 w-4" /> Deals estancados
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {staleDeals.slice(0, 4).map((deal) => {
                    const daysSince = Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / 86400000);
                    return (
                      <li
                        key={deal.id}
                        className="flex cursor-pointer items-center gap-3 px-6 py-2.5 transition-colors hover:bg-surface-hover"
                        onClick={() => navigate(`/admin/contacts/${deal.contactId}`)}
                      >
                        <StatusDot tone="amber" />
                        <span className="flex-1 truncate text-sm text-foreground">
                          {deal.title}
                          {deal.value && <span className="ml-1.5 font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtMoney(deal.value)}</span>}
                        </span>
                        <span className="shrink-0 text-[11px] font-medium tabular-nums text-amber-600 dark:text-amber-400">
                          {STAGE_LABELS[deal.stage] || deal.stage} · {daysSince}d
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
