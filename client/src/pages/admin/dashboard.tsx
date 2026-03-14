import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Users, TrendingUp, Mail, Calendar, Eye, Clock, CheckSquare, Flame, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
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

function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <Card className={`bg-white border-gray-200 animate-pulse ${className}`}>
      <CardContent className="p-6">
        <div className="h-4 w-20 bg-gray-100 rounded mb-4" />
        <div className="h-8 w-24 bg-gray-100 rounded mb-2" />
        <div className="h-3 w-28 bg-gray-100 rounded" />
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/admin/dashboard"],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{getGreeting()}</h2>
          <p className="text-gray-500 text-sm mt-1">Aqui tienes el resumen de tu CRM</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          {[...Array(5)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-white border-gray-200 animate-pulse">
            <CardContent className="p-6 h-64" />
          </Card>
          <Card className="bg-white border-gray-200 animate-pulse">
            <CardContent className="p-6 h-64" />
          </Card>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, pipeline, emailPerformance, recentActivity, upcomingTasks } = data;

  const kpiCards = [
    {
      label: "Total contactos",
      value: kpis.totalContacts,
      icon: Users,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      accentColor: "from-blue-500 to-blue-600",
    },
    {
      label: "Hot leads",
      value: kpis.hotLeads,
      icon: Flame,
      iconBg: "bg-red-50",
      iconColor: "text-red-500",
      accentColor: "from-red-500 to-orange-500",
    },
    {
      label: "Tasa de conversion",
      value: `${kpis.conversionRate}%`,
      icon: TrendingUp,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      accentColor: "from-emerald-500 to-emerald-600",
    },
    {
      label: "Emails esta semana",
      value: kpis.emailsThisWeek,
      icon: Mail,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      accentColor: "from-[#2FA4A9] to-[#238b8f]",
    },
    {
      label: "Proximas citas",
      value: kpis.upcomingAppointments,
      icon: Calendar,
      iconBg: "bg-orange-50",
      iconColor: "text-orange-600",
      accentColor: "from-orange-500 to-orange-600",
    },
    {
      label: "Tasa de apertura",
      value: `${kpis.openRate}%`,
      icon: Eye,
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
      accentColor: "from-purple-500 to-purple-600",
    },
  ];

  const pipelineStages = [
    { label: "Lead", count: pipeline.lead, color: "bg-blue-500", gradient: "from-blue-500 to-blue-600" },
    { label: "Contactado", count: pipeline.contacted, color: "bg-amber-500", gradient: "from-amber-500 to-amber-600" },
    { label: "Agendado", count: pipeline.scheduled, color: "bg-orange-500", gradient: "from-orange-500 to-orange-600" },
    { label: "Convertido", count: pipeline.converted, color: "bg-emerald-500", gradient: "from-emerald-500 to-emerald-600" },
  ];

  const pipelineTotal = kpis.totalContacts || 1;

  const chartData = emailPerformance.map((ep) => ({
    template: ep.template.length > 18 ? ep.template.slice(0, 18) + "..." : ep.template,
    rate: ep.rate,
  }));

  return (
    <div className="space-y-6">
      {/* Greeting Header */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">{getGreeting()}</h2>
        <p className="text-gray-500 text-sm mt-1">Aqui tienes el resumen de tu CRM</p>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card
              key={kpi.label}
              className="bg-white border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div className={`h-1 bg-gradient-to-r ${kpi.accentColor}`} />
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className={`${kpi.iconBg} rounded-xl p-2.5`}>
                    <Icon className={`w-5 h-5 ${kpi.iconColor}`} />
                  </div>
                </div>
                <p className="text-3xl font-semibold text-gray-900">{kpi.value}</p>
                <p className="text-sm text-gray-500 mt-1">{kpi.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Row 2: Pipeline + Email Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline Funnel */}
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {pipelineStages.map((stage) => {
              const pct = Math.round((stage.count / pipelineTotal) * 100);
              return (
                <div key={stage.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 font-medium">{stage.label}</span>
                    <span className="text-gray-500 tabular-nums">
                      {stage.count} <span className="text-gray-400">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${stage.gradient} transition-all`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Email Performance */}
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Email Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: "#6b7280", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="template"
                    width={120}
                    tick={{ fill: "#6b7280", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      color: "#111827",
                      fontSize: 13,
                      padding: "8px 12px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    }}
                    cursor={{ fill: "rgba(0,0,0,0.03)" }}
                    formatter={(value: number) => [`${value}%`, "Open Rate"]}
                  />
                  <Bar dataKey="rate" fill="#2FA4A9" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 py-8 text-center">
                Sin datos de email aun
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Recent Activity */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">
            Actividad Reciente
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentActivity.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {recentActivity.slice(0, 8).map((event, idx) => {
                const isSent = event.type === "email_sent";
                const ActivityIcon = isSent ? Mail : Eye;

                return (
                  <li
                    key={idx}
                    className="flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/contacts/${event.contactId}`)}
                  >
                    <div className="shrink-0">
                      <div className={`rounded-full p-2 ${isSent ? "bg-blue-50" : "bg-emerald-50"}`}>
                        <ActivityIcon className={`w-4 h-4 ${isSent ? "text-blue-500" : "text-emerald-500"}`} />
                      </div>
                    </div>
                    <span className="text-sm text-gray-600 flex-1 truncate">
                      {isSent ? (
                        <>Email "{event.detail}" enviado a <span className="text-gray-900 font-medium">{event.contactName}</span></>
                      ) : (
                        <><span className="text-gray-900 font-medium">{event.contactName}</span> abrio email "{event.detail}"</>
                      )}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {relativeTime(event.timestamp)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 py-8 text-center">
              Sin actividad reciente
            </p>
          )}
        </CardContent>
      </Card>

      {/* Row 4: Upcoming Tasks */}
      {upcomingTasks && upcomingTasks.length > 0 && (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-500">
                Tareas Pendientes
                {kpis.overdueTasks > 0 && (
                  <span className="ml-2 text-xs text-red-500 font-normal">
                    ({kpis.overdueTasks} vencidas)
                  </span>
                )}
              </CardTitle>
              <button
                onClick={() => navigate("/admin/tasks")}
                className="text-xs text-[#2FA4A9] hover:underline"
              >
                Ver todas
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-gray-100">
              {upcomingTasks.map((task: UpcomingTask) => {
                const overdue = task.dueDate && new Date(task.dueDate) < new Date();
                return (
                  <li
                    key={task.id}
                    className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <CheckSquare className={`w-4 h-4 shrink-0 ${overdue ? "text-red-400" : "text-gray-400"}`} />
                    <span className="text-sm text-gray-700 flex-1 truncate">{task.title}</span>
                    {task.dueDate && (
                      <span className={`text-xs shrink-0 ${overdue ? "text-red-500" : "text-gray-400"}`}>
                        {overdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                        {new Date(task.dueDate).toLocaleDateString("es-CO")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
