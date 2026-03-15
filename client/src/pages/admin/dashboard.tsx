import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Users, TrendingUp, Mail, Calendar, Eye, Clock, CheckSquare, Flame,
  AlertTriangle, DollarSign, Briefcase, ArrowUpRight, ArrowDownRight,
  Activity, Send, MousePointerClick, UserPlus, FileText, Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid,
} from "recharts";

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

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `hace ${diffDays}d`;
  const diffMonths = Math.floor(diffDays / 30);
  return `hace ${diffMonths}mes`;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos dias";
  return "Buenas tardes";
}

const STAGE_LABELS: Record<string, string> = {
  qualification: "Calificacion",
  proposal: "Propuesta",
  negotiation: "Negociacion",
  closed_won: "Ganado",
  closed_lost: "Perdido",
};

const COLORS = {
  teal: "#2FA4A9",
  tealDark: "#238b8f",
  blue: "#3b82f6",
  emerald: "#10b981",
  amber: "#f59e0b",
  orange: "#f97316",
  red: "#ef4444",
  purple: "#8b5cf6",
  cyan: "#06b6d4",
  green: "#22c55e",
};

const PIE_COLORS = [COLORS.blue, COLORS.amber, COLORS.orange, COLORS.emerald];

function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-48 bg-gray-200 rounded-lg" />
        <div className="h-4 w-64 bg-gray-100 rounded mt-2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 h-80" />
        <div className="bg-white rounded-xl border border-gray-200 h-80" />
      </div>
    </div>
  );
}

function activityIcon(type: string) {
  switch (type) {
    case "email_sent": return { icon: Send, bg: "bg-blue-50", color: "text-blue-500" };
    case "email_opened": return { icon: Eye, bg: "bg-emerald-50", color: "text-emerald-500" };
    case "email_clicked": return { icon: MousePointerClick, bg: "bg-purple-50", color: "text-purple-500" };
    case "form_submitted": return { icon: UserPlus, bg: "bg-teal-50", color: "text-teal-600" };
    case "status_changed": return { icon: Activity, bg: "bg-amber-50", color: "text-amber-500" };
    case "note_added": return { icon: FileText, bg: "bg-gray-50", color: "text-gray-500" };
    case "task_created": return { icon: CheckSquare, bg: "bg-cyan-50", color: "text-cyan-500" };
    default: return { icon: Activity, bg: "bg-gray-50", color: "text-gray-400" };
  }
}

function activityLabel(type: string, contactName: string, detail: string) {
  switch (type) {
    case "email_sent":
      return <><span className="font-medium text-gray-900">{contactName}</span> — email enviado: "{detail}"</>;
    case "email_opened":
      return <><span className="font-medium text-gray-900">{contactName}</span> abrio "{detail}"</>;
    case "email_clicked":
      return <><span className="font-medium text-gray-900">{contactName}</span> hizo click en "{detail}"</>;
    case "form_submitted":
      return <>Nuevo lead: <span className="font-medium text-gray-900">{contactName}</span></>;
    case "status_changed":
      return <><span className="font-medium text-gray-900">{contactName}</span> — {detail}</>;
    default:
      return <><span className="font-medium text-gray-900">{contactName}</span> — {detail}</>;
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
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{getGreeting()}</h2>
          <p className="text-gray-500 text-sm mt-1">Aqui tienes el resumen de tu CRM</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500">No se pudo cargar el dashboard.</p>
          <button
            onClick={() => refetch()}
            className="px-5 py-2.5 bg-[#2FA4A9] text-white rounded-xl hover:bg-[#238b8f] transition-colors text-sm font-medium shadow-sm"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const { kpis, pipeline, emailPerformance, recentActivity, upcomingTasks, attentionItems, staleDeals } = data;

  // Primary KPIs
  const primaryKpis = [
    {
      label: "Contactos",
      value: kpis.totalContacts,
      icon: Users,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600",
      subtitle: `${kpis.hotLeads} hot leads`,
      subtitleColor: kpis.hotLeads > 0 ? "text-orange-500" : "text-gray-400",
    },
    {
      label: "Conversion",
      value: `${kpis.conversionRate}%`,
      icon: Target,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600",
      subtitle: `${pipeline.converted} convertidos`,
      subtitleColor: "text-emerald-500",
    },
    {
      label: "Pipeline",
      value: `$${kpis.pipelineValue.toLocaleString()}`,
      icon: DollarSign,
      iconBg: "bg-teal-500/10",
      iconColor: "text-teal-600",
      subtitle: `${kpis.dealsWonThisMonth} deals este mes`,
      subtitleColor: kpis.dealsWonThisMonth > 0 ? "text-emerald-500" : "text-gray-400",
    },
  ];

  // Secondary KPIs
  const secondaryKpis = [
    { label: "Emails", value: kpis.emailsThisWeek, icon: Mail, color: "text-blue-600" },
    { label: "Apertura", value: `${kpis.openRate}%`, icon: Eye, color: "text-purple-600" },
    { label: "Citas", value: kpis.upcomingAppointments, icon: Calendar, color: "text-orange-600" },
    { label: "Win Rate", value: `${kpis.winRate}%`, icon: TrendingUp, color: "text-emerald-600" },
    { label: "Ticket Prom.", value: `$${kpis.avgDealSize.toLocaleString()}`, icon: Briefcase, color: "text-cyan-600" },
    { label: "Tareas", value: kpis.pendingTasks, icon: CheckSquare, color: kpis.overdueTasks > 0 ? "text-red-500" : "text-gray-600" },
  ];

  // Pipeline stages for pie chart
  const pipelineData = [
    { name: "Lead", value: pipeline.lead, color: COLORS.blue },
    { name: "Contactado", value: pipeline.contacted, color: COLORS.amber },
    { name: "Agendado", value: pipeline.scheduled, color: COLORS.orange },
    { name: "Convertido", value: pipeline.converted, color: COLORS.emerald },
  ].filter(s => s.value > 0);

  const pipelineTotal = pipelineData.reduce((s, d) => s + d.value, 0) || 1;

  // Email chart data
  const chartData = emailPerformance.map((ep) => ({
    name: ep.template.replace("_", " ").replace(/^\w/, c => c.toUpperCase()),
    sent: ep.sent,
    opened: ep.opened,
    rate: ep.rate,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{getGreeting()}</h2>
          <p className="text-gray-400 text-sm mt-0.5">Resumen de tu CRM — {new Date().toLocaleDateString("es-CO", { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        {kpis.unreadNotifications > 0 && (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
            <Flame className="w-4 h-4" />
            {kpis.unreadNotifications} notificacion{kpis.unreadNotifications > 1 ? "es" : ""} sin leer
          </div>
        )}
      </div>

      {/* Attention Banner */}
      {attentionItems && attentionItems.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200/60 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-red-100 rounded-lg p-1.5">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <span className="text-sm font-semibold text-red-700">Requiere atencion ({attentionItems.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {attentionItems.slice(0, 4).map((item, idx) => (
              <button
                key={idx}
                onClick={() => item.contactId && navigate(`/admin/contacts/${item.contactId}`)}
                className="flex items-center gap-2.5 bg-white/80 rounded-lg px-3 py-2 text-left hover:bg-white transition-colors"
              >
                {item.type === "hot_no_followup" ? (
                  <>
                    <Flame className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    <span className="text-sm text-gray-700 truncate">
                      <span className="font-medium">{item.nombre}</span> — score {item.score}
                    </span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span className="text-sm text-gray-700 truncate">
                      <span className="font-medium">{item.title}</span>
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {primaryKpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card
              key={kpi.label}
              className="bg-white border-gray-200/80 overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 group"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`${kpi.iconBg} rounded-xl p-3`}>
                    <Icon className={`w-6 h-6 ${kpi.iconColor}`} />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900 tracking-tight">{kpi.value}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm text-gray-400">{kpi.label}</p>
                  <span className={`text-xs font-medium ${kpi.subtitleColor}`}>{kpi.subtitle}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Secondary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {secondaryKpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="bg-white rounded-xl border border-gray-200/80 px-4 py-3.5 flex items-center gap-3 hover:shadow-sm transition-shadow"
            >
              <Icon className={`w-4.5 h-4.5 ${kpi.color} shrink-0`} />
              <div className="min-w-0">
                <p className="text-lg font-bold text-gray-900 leading-tight">{kpi.value}</p>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">{kpi.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Pipeline Donut */}
        <Card className="bg-white border-gray-200/80 shadow-sm lg:col-span-2">
          <CardHeader className="pb-0 pt-5 px-6">
            <CardTitle className="text-sm font-semibold text-gray-700">Pipeline de Contactos</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-4 px-6">
            {pipelineData.length > 0 ? (
              <div className="flex items-center gap-4">
                <div className="w-40 h-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pipelineData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {pipelineData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 12,
                          fontSize: 13,
                          padding: "8px 14px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        }}
                        formatter={(value: number, name: string) => [`${value} (${Math.round((value / pipelineTotal) * 100)}%)`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2.5">
                  {pipelineData.map((stage) => (
                    <div key={stage.name} className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm text-gray-600 flex-1">{stage.name}</span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">{stage.value}</span>
                      <span className="text-xs text-gray-400 tabular-nums w-10 text-right">{Math.round((stage.value / pipelineTotal) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40">
                <p className="text-sm text-gray-400">Sin datos de pipeline</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email Performance */}
        <Card className="bg-white border-gray-200/80 shadow-sm lg:col-span-3">
          <CardHeader className="pb-0 pt-5 px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-700">Rendimiento de Emails</CardTitle>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" /> Enviados</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Abiertos</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2 pb-2 px-2">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                  barGap={2}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      fontSize: 13,
                      padding: "8px 14px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    }}
                    cursor={{ fill: "rgba(0,0,0,0.03)" }}
                  />
                  <Bar dataKey="sent" name="Enviados" fill="#93c5fd" radius={[4, 4, 0, 0]} barSize={18} />
                  <Bar dataKey="opened" name="Abiertos" fill="#6ee7b7" radius={[4, 4, 0, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px]">
                <div className="text-center">
                  <Mail className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Sin datos de email aun</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue Row */}
      {(kpis.dealsWonValue > 0 || kpis.pipelineValue > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-5 text-white">
            <DollarSign className="w-5 h-5 opacity-70 mb-2" />
            <p className="text-2xl font-bold">${kpis.dealsWonValue.toLocaleString()}</p>
            <p className="text-emerald-100 text-sm mt-1">Ganado este mes</p>
          </div>
          <div className="bg-gradient-to-br from-[#2FA4A9] to-[#238b8f] rounded-xl p-5 text-white">
            <Briefcase className="w-5 h-5 opacity-70 mb-2" />
            <p className="text-2xl font-bold">{kpis.dealsWonThisMonth}</p>
            <p className="text-teal-100 text-sm mt-1">Deals cerrados</p>
          </div>
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white">
            <TrendingUp className="w-5 h-5 opacity-70 mb-2" />
            <p className="text-2xl font-bold">{kpis.winRate}%</p>
            <p className="text-blue-100 text-sm mt-1">Win Rate</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-5 text-white">
            <DollarSign className="w-5 h-5 opacity-70 mb-2" />
            <p className="text-2xl font-bold">${kpis.avgDealSize.toLocaleString()}</p>
            <p className="text-purple-100 text-sm mt-1">Ticket promedio</p>
          </div>
        </div>
      )}

      {/* Bottom Section: Activity + Tasks + Stale Deals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Activity */}
        <Card className="bg-white border-gray-200/80 shadow-sm">
          <CardHeader className="pb-2 pt-5 px-6">
            <CardTitle className="text-sm font-semibold text-gray-700">Actividad Reciente</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentActivity.length > 0 ? (
              <ul className="divide-y divide-gray-100/80">
                {recentActivity.slice(0, 8).map((event, idx) => {
                  const ai = activityIcon(event.type);
                  const Icon = ai.icon;
                  return (
                    <li
                      key={idx}
                      className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50/80 cursor-pointer transition-colors"
                      onClick={() => navigate(`/admin/contacts/${event.contactId}`)}
                    >
                      <div className={`rounded-lg p-1.5 ${ai.bg} shrink-0`}>
                        <Icon className={`w-3.5 h-3.5 ${ai.color}`} />
                      </div>
                      <span className="text-sm text-gray-500 flex-1 truncate leading-snug">
                        {activityLabel(event.type, event.contactName, event.detail)}
                      </span>
                      <span className="text-[11px] text-gray-300 shrink-0 tabular-nums">
                        {relativeTime(event.timestamp)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="py-10 text-center">
                <Activity className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Sin actividad reciente</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks + Stale Deals */}
        <div className="space-y-4">
          {/* Upcoming Tasks */}
          <Card className="bg-white border-gray-200/80 shadow-sm">
            <CardHeader className="pb-2 pt-5 px-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-700">
                  Tareas Pendientes
                  {kpis.overdueTasks > 0 && (
                    <span className="ml-2 bg-red-100 text-red-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                      {kpis.overdueTasks} vencida{kpis.overdueTasks > 1 ? "s" : ""}
                    </span>
                  )}
                </CardTitle>
                <button
                  onClick={() => navigate("/admin/tasks")}
                  className="text-xs text-[#2FA4A9] hover:text-[#238b8f] font-medium flex items-center gap-0.5"
                >
                  Ver todas <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {upcomingTasks && upcomingTasks.length > 0 ? (
                <ul className="divide-y divide-gray-100/80">
                  {upcomingTasks.slice(0, 5).map((task) => {
                    const overdue = task.dueDate && new Date(task.dueDate) < new Date();
                    const priorityColor = task.priority === "high" ? "bg-red-400" : task.priority === "medium" ? "bg-amber-400" : "bg-gray-300";
                    return (
                      <li
                        key={task.id}
                        className="flex items-center gap-3 px-6 py-2.5 hover:bg-gray-50/80 transition-colors"
                      >
                        <div className={`w-2 h-2 rounded-full shrink-0 ${priorityColor}`} />
                        <span className={`text-sm flex-1 truncate ${overdue ? "text-red-600" : "text-gray-700"}`}>
                          {task.title}
                        </span>
                        {task.dueDate && (
                          <span className={`text-[11px] shrink-0 tabular-nums ${overdue ? "text-red-500 font-medium" : "text-gray-400"}`}>
                            {new Date(task.dueDate).toLocaleDateString("es-CO", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="py-8 text-center">
                  <CheckSquare className="w-6 h-6 text-gray-200 mx-auto mb-1.5" />
                  <p className="text-sm text-gray-400">Sin tareas pendientes</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stale Deals */}
          {staleDeals && staleDeals.length > 0 && (
            <Card className="bg-white border-amber-200/80 shadow-sm">
              <CardHeader className="pb-2 pt-5 px-6">
                <CardTitle className="text-sm font-semibold text-amber-700 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Deals estancados
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-gray-100/80">
                  {staleDeals.slice(0, 4).map((deal) => {
                    const daysSince = Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <li
                        key={deal.id}
                        className="flex items-center gap-3 px-6 py-2.5 hover:bg-gray-50/80 cursor-pointer transition-colors"
                        onClick={() => navigate(`/admin/contacts/${deal.contactId}`)}
                      >
                        <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        <span className="text-sm text-gray-700 flex-1 truncate">
                          {deal.title}
                          {deal.value && <span className="text-emerald-600 ml-1.5 font-medium">${deal.value.toLocaleString()}</span>}
                        </span>
                        <span className="text-[11px] text-amber-500 shrink-0 font-medium">
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
