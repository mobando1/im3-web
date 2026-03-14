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

function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <Card className={`bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))] animate-pulse ${className}`}>
      <CardContent className="p-6">
        <div className="h-4 w-20 bg-white/5 rounded mb-4" />
        <div className="h-8 w-24 bg-white/10 rounded mb-2" />
        <div className="h-3 w-28 bg-white/5 rounded" />
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
        <h2 className="text-2xl font-bold text-[hsl(var(--paper))]">Dashboard</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))] animate-pulse">
            <CardContent className="p-6 h-64" />
          </Card>
          <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))] animate-pulse">
            <CardContent className="p-6 h-64" />
          </Card>
        </div>
        <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))] animate-pulse">
          <CardContent className="p-6 h-48" />
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, pipeline, emailPerformance, recentActivity } = data;

  const kpiCards = [
    {
      label: "Total Contactos",
      value: kpis.totalContacts,
      icon: Users,
      iconBg: "bg-[hsl(var(--paper))]/10",
      iconColor: "text-[hsl(var(--paper))]",
    },
    {
      label: "Tasa de Conversion",
      value: `${kpis.conversionRate}%`,
      icon: TrendingUp,
      iconBg: "bg-green-400/10",
      iconColor: "text-green-400",
    },
    {
      label: "Emails esta Semana",
      value: kpis.emailsThisWeek,
      icon: Mail,
      iconBg: "bg-[#2FA4A9]/10",
      iconColor: "text-[#2FA4A9]",
    },
    {
      label: "Proximas Citas",
      value: kpis.upcomingAppointments,
      icon: Calendar,
      iconBg: "bg-orange-400/10",
      iconColor: "text-orange-400",
    },
  ];

  const pipelineStages = [
    { label: "Lead", count: pipeline.lead, color: "bg-blue-500" },
    { label: "Contactado", count: pipeline.contacted, color: "bg-yellow-500" },
    { label: "Agendado", count: pipeline.scheduled, color: "bg-orange-500" },
    { label: "Convertido", count: pipeline.converted, color: "bg-green-500" },
  ];

  const pipelineTotal = kpis.totalContacts || 1;

  const chartData = emailPerformance.map((ep) => ({
    template: ep.template.length > 18 ? ep.template.slice(0, 18) + "..." : ep.template,
    rate: ep.rate,
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[hsl(var(--paper))]">Dashboard</h2>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card
              key={kpi.label}
              className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className={`${kpi.iconBg} rounded-full p-2.5`}>
                    <Icon className={`w-5 h-5 ${kpi.iconColor}`} />
                  </div>
                </div>
                <p className="text-3xl font-bold text-[hsl(var(--paper))]">{kpi.value}</p>
                <p className="text-xs uppercase tracking-wider text-[hsl(var(--paper-dark))] mt-1">
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
        <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[hsl(var(--paper-dark))] uppercase tracking-wider">
              Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pipelineStages.map((stage) => {
              const pct = Math.round((stage.count / pipelineTotal) * 100);
              return (
                <div key={stage.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[hsl(var(--paper))]">{stage.label}</span>
                    <span className="text-[hsl(var(--paper-dark))] tabular-nums">
                      {stage.count}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full ${stage.color} transition-all`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Email Performance */}
        <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[hsl(var(--paper-dark))] uppercase tracking-wider">
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
                    tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="template"
                    width={120}
                    tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0B1C2D",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      color: "#fff",
                    }}
                    formatter={(value: number) => [`${value}%`, "Open Rate"]}
                  />
                  <Bar dataKey="rate" fill="#2FA4A9" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-[hsl(var(--paper-dark))] py-8 text-center">
                Sin datos de email aun
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Recent Activity */}
      <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-[hsl(var(--paper-dark))] uppercase tracking-wider">
            Actividad Reciente
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentActivity.length > 0 ? (
            <ul className="divide-y divide-white/5">
              {recentActivity.slice(0, 8).map((event, idx) => {
                const isSent = event.type === "sent";
                const ActivityIcon = isSent ? Mail : Eye;
                const description = isSent
                  ? `Email "${event.detail}" enviado a ${event.contactName}`
                  : `${event.contactName} abrio email "${event.detail}"`;

                return (
                  <li
                    key={idx}
                    className="flex items-center gap-3 px-6 py-3 hover:bg-white/5 cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/contacts/${event.contactId}`)}
                  >
                    <div className="shrink-0">
                      <ActivityIcon className="w-4 h-4 text-[hsl(var(--paper-dark))]" />
                    </div>
                    <span className="text-sm text-[hsl(var(--paper))] flex-1 truncate">
                      {description}
                    </span>
                    <span className="text-xs text-[hsl(var(--paper-dark))] shrink-0 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {relativeTime(event.timestamp)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[hsl(var(--paper-dark))] py-8 text-center">
              Sin actividad reciente
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
