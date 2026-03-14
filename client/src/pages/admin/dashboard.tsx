import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Users, TrendingUp, Mail, Calendar, Eye, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type DashboardData = {
  kpis: {
    totalContacts: number;
    conversionRate: number;
    emailsThisWeek: number;
    upcomingAppointments: number;
    openRate: number;
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
    <Card className={`bg-[#111827]/80 border-[#1e293b] animate-pulse ${className}`}>
      <CardContent className="p-6">
        <div className="h-4 w-20 bg-[#1e293b] rounded mb-4" />
        <div className="h-8 w-24 bg-[#1e293b] rounded mb-2" />
        <div className="h-3 w-28 bg-[#1e293b] rounded" />
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
          <h2 className="text-2xl font-semibold text-white">{getGreeting()}</h2>
          <p className="text-slate-400 text-sm mt-1">Aqui tienes el resumen de tu CRM</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-[#111827]/80 border-[#1e293b] animate-pulse">
            <CardContent className="p-6 h-64" />
          </Card>
          <Card className="bg-[#111827]/80 border-[#1e293b] animate-pulse">
            <CardContent className="p-6 h-64" />
          </Card>
        </div>
        <Card className="bg-[#111827]/80 border-[#1e293b] animate-pulse">
          <CardContent className="p-6 h-48" />
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, pipeline, emailPerformance, recentActivity } = data;

  const kpiCards = [
    {
      label: "Total contactos",
      value: kpis.totalContacts,
      icon: Users,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-400",
      accentColor: "from-blue-400 to-blue-600",
    },
    {
      label: "Tasa de conversion",
      value: `${kpis.conversionRate}%`,
      icon: TrendingUp,
      iconBg: "bg-green-500/10",
      iconColor: "text-green-400",
      accentColor: "from-green-400 to-green-600",
    },
    {
      label: "Emails esta semana",
      value: kpis.emailsThisWeek,
      icon: Mail,
      iconBg: "bg-[#2FA4A9]/10",
      iconColor: "text-[#2FA4A9]",
      accentColor: "from-[#2FA4A9] to-[#1a7a7e]",
    },
    {
      label: "Proximas citas",
      value: kpis.upcomingAppointments,
      icon: Calendar,
      iconBg: "bg-orange-500/10",
      iconColor: "text-orange-400",
      accentColor: "from-orange-400 to-orange-600",
    },
    {
      label: "Tasa de apertura",
      value: `${kpis.openRate}%`,
      icon: Eye,
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-400",
      accentColor: "from-purple-400 to-purple-600",
    },
  ];

  const pipelineStages = [
    { label: "Lead", count: pipeline.lead, color: "bg-[#3b82f6]", gradient: "from-[#3b82f6] to-[#2563eb]" },
    { label: "Contactado", count: pipeline.contacted, color: "bg-[#eab308]", gradient: "from-[#eab308] to-[#ca8a04]" },
    { label: "Agendado", count: pipeline.scheduled, color: "bg-[#f97316]", gradient: "from-[#f97316] to-[#ea580c]" },
    { label: "Convertido", count: pipeline.converted, color: "bg-[#22c55e]", gradient: "from-[#22c55e] to-[#16a34a]" },
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
        <h2 className="text-2xl font-semibold text-white">{getGreeting()}</h2>
        <p className="text-slate-400 text-sm mt-1">Aqui tienes el resumen de tu CRM</p>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card
              key={kpi.label}
              className="bg-[#111827]/80 border-[#1e293b] overflow-hidden"
            >
              <div className={`h-0.5 bg-gradient-to-r ${kpi.accentColor}`} />
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className={`${kpi.iconBg} rounded-xl p-2.5`}>
                    <Icon className={`w-5 h-5 ${kpi.iconColor}`} />
                  </div>
                </div>
                <p className="text-3xl font-semibold text-white">{kpi.value}</p>
                <p className="text-sm text-slate-400 mt-1">
                  {kpi.label}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Row 2: Pipeline + Email Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline Funnel */}
        <Card className="bg-[#111827]/80 border-[#1e293b]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {pipelineStages.map((stage) => {
              const pct = Math.round((stage.count / pipelineTotal) * 100);
              return (
                <div key={stage.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white font-medium">{stage.label}</span>
                    <span className="text-slate-400 tabular-nums">
                      {stage.count} <span className="text-slate-500">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-white/5">
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
        <Card className="bg-[#111827]/80 border-[#1e293b]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
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
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="template"
                    width={120}
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111827",
                      border: "1px solid #1e293b",
                      borderRadius: 10,
                      color: "#fff",
                      fontSize: 13,
                      padding: "8px 12px",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                    }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    formatter={(value: number) => [`${value}%`, "Open Rate"]}
                  />
                  <Bar dataKey="rate" fill="#2FA4A9" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-500 py-8 text-center">
                Sin datos de email aun
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Recent Activity */}
      <Card className="bg-[#111827]/80 border-[#1e293b]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-400">
            Actividad Reciente
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentActivity.length > 0 ? (
            <ul className="divide-y divide-[#1e293b]">
              {recentActivity.slice(0, 8).map((event, idx) => {
                const isSent = event.type === "sent";
                const ActivityIcon = isSent ? Mail : Eye;

                return (
                  <li
                    key={idx}
                    className="flex items-center gap-3 px-6 py-3.5 hover:bg-white/5 cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/contacts/${event.contactId}`)}
                  >
                    <div className="shrink-0">
                      <div className={`rounded-full p-2 ${isSent ? "bg-blue-500/10" : "bg-green-500/10"}`}>
                        <ActivityIcon className={`w-4 h-4 ${isSent ? "text-blue-400" : "text-green-400"}`} />
                      </div>
                    </div>
                    <span className="text-sm text-slate-400 flex-1 truncate">
                      {isSent ? (
                        <>Email "{event.detail}" enviado a <span className="text-white font-medium">{event.contactName}</span></>
                      ) : (
                        <><span className="text-white font-medium">{event.contactName}</span> abrio email "{event.detail}"</>
                      )}
                    </span>
                    <span className="text-xs text-slate-500 shrink-0 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {relativeTime(event.timestamp)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 py-8 text-center">
              Sin actividad reciente
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
