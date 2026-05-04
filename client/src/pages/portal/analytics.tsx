import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useClientAuth } from "@/hooks/useClientAuth";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Users, MousePointerClick, FileText, Clock, AlertTriangle } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type AnalyticsData = {
  status: "connected" | "pending" | "error" | "not_configured";
  lastSyncedAt: string | null;
  propertyTimezone: string | null;
  days: Array<{ date: string; sessions: number; users: number; pageviews: number; bounceRate: number }>;
  totals: { sessions: number; users: number; newUsers: number; pageviews: number; avgSessionDuration: number; bounceRate: number } | null;
  prevTotals: { sessions: number; users: number; newUsers: number; pageviews: number; avgSessionDuration: number; bounceRate: number } | null;
  topPages?: Array<{ path: string; pageviews: number }>;
  topSources?: Array<{ source: string; sessions: number }>;
  topCountries?: Array<{ country: string; users: number }>;
};

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function deltaPct(curr: number, prev: number): number | null {
  if (!prev || prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function DeltaBadge({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) {
    return <span className="text-xs text-slate-400">— sin comparativa</span>;
  }
  const positive = inverse ? value < 0 : value > 0;
  const negative = inverse ? value > 0 : value < 0;
  const Icon = value === 0 ? Minus : positive ? TrendingUp : TrendingDown;
  const color = value === 0 ? "text-slate-400" : positive ? "text-emerald-600" : "text-rose-500";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {value > 0 ? `+${value}` : value}% vs período anterior
    </span>
  );
}

function KpiCard({
  label,
  value,
  delta,
  sparkData,
  inverseDelta = false,
  Icon,
}: {
  label: string;
  value: string;
  delta: number | null;
  sparkData?: Array<{ date: string; value: number }>;
  inverseDelta?: boolean;
  Icon: any;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-slate-500 font-medium">{label}</span>
        <Icon className="w-4 h-4 text-[#2FA4A9]" />
      </div>
      <div className="text-2xl font-semibold text-slate-900 mb-2">{value}</div>
      <DeltaBadge value={delta} inverse={inverseDelta} />
      {sparkData && sparkData.length > 0 && (
        <div className="mt-3 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line type="monotone" dataKey="value" stroke="#2FA4A9" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function PortalAnalytics() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isAuthenticated, isLoading: authLoading } = useClientAuth();

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: [`/api/portal/projects/${projectId}/analytics`],
    enabled: !!projectId && isAuthenticated,
  });

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Cargando...</div>;
  }
  if (!isAuthenticated) {
    return <div className="min-h-screen flex items-center justify-center"><Link href="/portal/login" className="text-[#2FA4A9]">Inicia sesión</Link></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <Link href={`/portal/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-[#2FA4A9] mb-6">
          <ArrowLeft className="w-4 h-4" />
          Volver al proyecto
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Resumen de los últimos 30 días</p>
        </div>

        {isLoading && <div className="text-slate-500 text-sm">Cargando métricas...</div>}

        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-4">
            <p className="text-sm text-rose-700">No pudimos cargar las métricas. Intenta de nuevo en un momento.</p>
          </div>
        )}

        {data && data.status !== "connected" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto mb-2" />
            <p className="text-sm text-amber-900 font-medium">Analytics aún no está configurado</p>
            <p className="text-xs text-amber-800 mt-1">El equipo de IM3 está conectando tu Google Analytics. Pronto verás tus métricas aquí.</p>
          </div>
        )}

        {data && data.status === "connected" && data.totals && (
          <>
            {data.days.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                <p className="text-sm text-slate-700 font-medium">Aún no hay datos disponibles</p>
                <p className="text-xs text-slate-500 mt-1">Comparte tu sitio para empezar a recibir tráfico — los datos aparecerán mañana.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <KpiCard
                    label="Sesiones"
                    value={data.totals.sessions.toLocaleString("es")}
                    delta={deltaPct(data.totals.sessions, data.prevTotals?.sessions || 0)}
                    sparkData={data.days.map((d) => ({ date: d.date, value: d.sessions }))}
                    Icon={MousePointerClick}
                  />
                  <KpiCard
                    label="Usuarios únicos"
                    value={data.totals.users.toLocaleString("es")}
                    delta={deltaPct(data.totals.users, data.prevTotals?.users || 0)}
                    sparkData={data.days.map((d) => ({ date: d.date, value: d.users }))}
                    Icon={Users}
                  />
                  <KpiCard
                    label="Páginas vistas"
                    value={data.totals.pageviews.toLocaleString("es")}
                    delta={deltaPct(data.totals.pageviews, data.prevTotals?.pageviews || 0)}
                    sparkData={data.days.map((d) => ({ date: d.date, value: d.pageviews }))}
                    Icon={FileText}
                  />
                  <KpiCard
                    label="Tasa de rebote"
                    value={`${Math.round(data.totals.bounceRate * 100)}%`}
                    delta={deltaPct(data.totals.bounceRate, data.prevTotals?.bounceRate || 0)}
                    inverseDelta
                    Icon={Clock}
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 mb-6">
                  <h2 className="text-sm font-medium text-slate-700 mb-4">Sesiones diarias</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.days}>
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748B" }} tickFormatter={(d: string) => d.slice(5)} />
                        <YAxis tick={{ fontSize: 11, fill: "#64748B" }} />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                          labelStyle={{ color: "#0F172A" }}
                        />
                        <Line type="monotone" dataKey="sessions" stroke="#2FA4A9" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <TopList title="Top páginas" rows={data.topPages || []} labelKey="path" valueKey="pageviews" valueFormat={(v) => v.toLocaleString("es")} />
                  <TopList title="Fuentes de tráfico" rows={data.topSources || []} labelKey="source" valueKey="sessions" valueFormat={(v) => v.toLocaleString("es")} />
                  <TopList title="Países" rows={data.topCountries || []} labelKey="country" valueKey="users" valueFormat={(v) => v.toLocaleString("es")} />
                </div>

                <p className="text-xs text-slate-400 mt-6 text-center">
                  Última actualización: {data.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleString("es") : "—"}
                  {data.propertyTimezone ? ` · zona ${data.propertyTimezone}` : ""}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TopList({
  title,
  rows,
  labelKey,
  valueKey,
  valueFormat,
}: {
  title: string;
  rows: Array<Record<string, any>>;
  labelKey: string;
  valueKey: string;
  valueFormat: (v: number) => string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-medium text-slate-700 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">Sin datos</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-700 truncate" title={r[labelKey]}>{r[labelKey]}</span>
              <span className="text-slate-500 font-medium tabular-nums">{valueFormat(Number(r[valueKey]))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
