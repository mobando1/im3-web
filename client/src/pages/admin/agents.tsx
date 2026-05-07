import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PlayCircle,
  Webhook,
  Calendar,
  Hand,
  Brain,
  Cog,
  Plug,
  Database,
  Globe,
  Sparkles,
  FileCode,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  RefreshCcw,
} from "lucide-react";

type AgentHealth = "healthy" | "warning" | "error" | "idle";

type AgentRun = {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  recordsProcessed: number | null;
  errorMessage: string | null;
  triggeredBy: string;
};

type AgentKind = "ai" | "automation" | "integration" | "webhook";

type AgentConnectionType = "db" | "api" | "llm" | "internal" | "webhook";

type AgentConnection = {
  type: AgentConnectionType;
  label: string;
  detail?: string;
};

type Agent = {
  name: string;
  displayName: string;
  kind: AgentKind;
  description: string;
  trigger: "cron" | "webhook" | "manual";
  schedule?: string;
  scheduleHuman?: string;
  criticality: "critical" | "normal" | "low";
  hasRunnable: boolean;
  health: AgentHealth;
  lastRun: AgentRun | null;
  stats: { last10Success: number; last10Error: number; last10Total: number };
  longDescription?: string;
  connections?: AgentConnection[];
  sourceFile?: string;
};

type KindInfo = { label: string; description: string };

type AgentsResponse = {
  agents: Agent[];
  kinds: Record<AgentKind, KindInfo>;
  summary: {
    total: number;
    healthy: number;
    warning: number;
    error: number;
    idle: number;
    byKind: Record<AgentKind, number>;
  };
};

type FullRun = AgentRun & {
  errorStack: string | null;
  metadata: Record<string, unknown> | null;
  agentName: string;
};

type RunsResponse = {
  agent: Agent;
  runs: FullRun[];
};

const kindIcons: Record<AgentKind, typeof Brain> = {
  ai: Brain,
  automation: Cog,
  integration: Plug,
  webhook: Webhook,
};

const kindColors: Record<AgentKind, { bg: string; text: string; ring: string }> = {
  ai: { bg: "bg-purple-50", text: "text-purple-600", ring: "ring-purple-100" },
  automation: { bg: "bg-blue-50", text: "text-blue-600", ring: "ring-blue-100" },
  integration: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
  webhook: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
};

const connectionStyles: Record<AgentConnectionType, { icon: typeof Database; label: string; bg: string; text: string; iconColor: string }> = {
  db: { icon: Database, label: "Base de datos", bg: "bg-blue-50", text: "text-blue-700", iconColor: "text-blue-500" },
  api: { icon: Globe, label: "API externa", bg: "bg-emerald-50", text: "text-emerald-700", iconColor: "text-emerald-500" },
  llm: { icon: Sparkles, label: "Modelo IA", bg: "bg-purple-50", text: "text-purple-700", iconColor: "text-purple-500" },
  internal: { icon: Cog, label: "Servicio interno", bg: "bg-gray-50", text: "text-gray-700", iconColor: "text-gray-500" },
  webhook: { icon: Webhook, label: "Webhook", bg: "bg-amber-50", text: "text-amber-700", iconColor: "text-amber-500" },
};

const triggerIcons = {
  cron: Calendar,
  webhook: Webhook,
  manual: Hand,
} as const;

const triggerLabels = {
  cron: "Programado",
  webhook: "Webhook",
  manual: "Manual",
} as const;

const healthStyles: Record<AgentHealth, { bg: string; text: string; label: string; dot: string; ring: string }> = {
  healthy: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Saludable", dot: "bg-emerald-500", ring: "ring-emerald-200" },
  warning: { bg: "bg-amber-50", text: "text-amber-700", label: "Avisos", dot: "bg-amber-500", ring: "ring-amber-200" },
  error: { bg: "bg-red-50", text: "text-red-700", label: "Errores", dot: "bg-red-500", ring: "ring-red-200" },
  idle: { bg: "bg-gray-50", text: "text-gray-500", label: "Sin datos", dot: "bg-gray-300", ring: "ring-gray-200" },
};

const criticalityStyles = {
  critical: { dot: "bg-red-500", label: "Crítico", text: "text-red-600" },
  normal: { dot: "bg-blue-400", label: "Normal", text: "text-blue-600" },
  low: { dot: "bg-gray-300", label: "Bajo", text: "text-gray-500" },
} as const;

function relativeTime(iso: string | null): string {
  if (!iso) return "nunca";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "hace segundos";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString("es-CO");
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState<"all" | AgentKind>("all");
  const [filterHealth, setFilterHealth] = useState<"all" | AgentHealth>("all");
  const [filterTrigger, setFilterTrigger] = useState<"all" | "cron" | "webhook" | "manual">("all");
  const [filterCriticality, setFilterCriticality] = useState<"all" | "critical" | "normal" | "low">("all");

  const { data, isLoading, refetch, isFetching } = useQuery<AgentsResponse>({
    queryKey: ["/api/admin/agents"],
    refetchInterval: 30_000,
  });

  const runMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest("POST", `/api/admin/agents/${name}/run`);
    },
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/admin/agents"] }), 1500);
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.agents.filter((a) => {
      if (filterKind !== "all" && a.kind !== filterKind) return false;
      if (filterHealth !== "all" && a.health !== filterHealth) return false;
      if (filterTrigger !== "all" && a.trigger !== filterTrigger) return false;
      if (filterCriticality !== "all" && a.criticality !== filterCriticality) return false;
      if (q) {
        const hay = `${a.displayName} ${a.name} ${a.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, filterKind, filterHealth, filterTrigger, filterCriticality]);

  const hasActiveFilters =
    !!search ||
    filterKind !== "all" ||
    filterHealth !== "all" ||
    filterTrigger !== "all" ||
    filterCriticality !== "all";

  const clearFilters = () => {
    setSearch("");
    setFilterKind("all");
    setFilterHealth("all");
    setFilterTrigger("all");
    setFilterCriticality("all");
  };

  if (isLoading || !data) {
    return (
      <div className="py-16 text-center text-gray-400">
        <Activity className="w-8 h-8 mx-auto mb-3 animate-pulse" />
        <p className="text-sm">Cargando sistema…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-4 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sistema</h1>
          <p className="text-sm text-gray-500 mt-1">
            Agentes IA, automatizaciones, integraciones y webhooks. {data.summary.total} en total.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Health Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile
          label="Saludables"
          value={data.summary.healthy}
          total={data.summary.total}
          color="emerald"
          icon={<CheckCircle2 className="w-4 h-4" />}
          active={filterHealth === "healthy"}
          onClick={() => setFilterHealth(filterHealth === "healthy" ? "all" : "healthy")}
        />
        <SummaryTile
          label="Avisos"
          value={data.summary.warning}
          total={data.summary.total}
          color="amber"
          icon={<AlertTriangle className="w-4 h-4" />}
          active={filterHealth === "warning"}
          onClick={() => setFilterHealth(filterHealth === "warning" ? "all" : "warning")}
        />
        <SummaryTile
          label="Errores"
          value={data.summary.error}
          total={data.summary.total}
          color="red"
          icon={<AlertTriangle className="w-4 h-4" />}
          active={filterHealth === "error"}
          onClick={() => setFilterHealth(filterHealth === "error" ? "all" : "error")}
        />
        <SummaryTile
          label="Sin datos"
          value={data.summary.idle}
          total={data.summary.total}
          color="gray"
          icon={<Minus className="w-4 h-4" />}
          active={filterHealth === "idle"}
          onClick={() => setFilterHealth(filterHealth === "idle" ? "all" : "idle")}
        />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar agente por nombre o descripción…"
            className="pl-9 bg-white border-gray-200"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={filterKind} onValueChange={(v) => setFilterKind(v as typeof filterKind)}>
            <SelectTrigger className="w-36 bg-white border-gray-200">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="ai">{data.kinds.ai.label}</SelectItem>
              <SelectItem value="automation">{data.kinds.automation.label}</SelectItem>
              <SelectItem value="integration">{data.kinds.integration.label}</SelectItem>
              <SelectItem value="webhook">{data.kinds.webhook.label}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterTrigger} onValueChange={(v) => setFilterTrigger(v as typeof filterTrigger)}>
            <SelectTrigger className="w-36 bg-white border-gray-200">
              <SelectValue placeholder="Disparador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos disparadores</SelectItem>
              <SelectItem value="cron">Programado</SelectItem>
              <SelectItem value="webhook">Webhook</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCriticality} onValueChange={(v) => setFilterCriticality(v as typeof filterCriticality)}>
            <SelectTrigger className="w-32 bg-white border-gray-200">
              <SelectValue placeholder="Criticidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda criticidad</SelectItem>
              <SelectItem value="critical">Crítico</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Bajo</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="w-3.5 h-3.5" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Result count */}
      <div className="text-xs text-gray-500">
        Mostrando <span className="font-semibold text-gray-700">{filtered.length}</span> de{" "}
        <span className="font-semibold text-gray-700">{data.summary.total}</span> agentes
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No hay agentes que coincidan con los filtros</p>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-3">
              Limpiar filtros
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
          {filtered.map((agent) => (
            <AgentRow
              key={agent.name}
              agent={agent}
              onClick={() => setSelectedAgent(agent.name)}
              onRun={() => runMutation.mutate(agent.name)}
              isRunning={runMutation.isPending && runMutation.variables === agent.name}
            />
          ))}
        </div>
      )}

      {/* Side sheet */}
      <AgentSheet
        agentName={selectedAgent}
        onClose={() => setSelectedAgent(null)}
        onRun={(name) => runMutation.mutate(name)}
        isRunning={(name) => runMutation.isPending && runMutation.variables === name}
      />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  total,
  color,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  total: number;
  color: "emerald" | "amber" | "red" | "gray";
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const palettes = {
    emerald: { ring: "ring-emerald-500", text: "text-emerald-600", iconBg: "bg-emerald-50 text-emerald-500" },
    amber: { ring: "ring-amber-500", text: "text-amber-600", iconBg: "bg-amber-50 text-amber-500" },
    red: { ring: "ring-red-500", text: "text-red-600", iconBg: "bg-red-50 text-red-500" },
    gray: { ring: "ring-gray-400", text: "text-gray-600", iconBg: "bg-gray-50 text-gray-400" },
  };
  const p = palettes[color];
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white border rounded-xl p-4 transition-all hover:shadow-sm ${
        active ? `border-transparent ring-2 ${p.ring}` : "border-gray-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${p.iconBg}`}>{icon}</div>
      </div>
      <div className="flex items-baseline gap-2 mt-2">
        <p className={`text-2xl font-bold ${p.text}`}>{value}</p>
        <p className="text-xs text-gray-400">/ {total}</p>
      </div>
      <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color === "emerald" ? "bg-emerald-500" : color === "amber" ? "bg-amber-500" : color === "red" ? "bg-red-500" : "bg-gray-400"} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}

function AgentRow({
  agent,
  onClick,
  onRun,
  isRunning,
}: {
  agent: Agent;
  onClick: () => void;
  onRun: () => void;
  isRunning: boolean;
}) {
  const KindIcon = kindIcons[agent.kind];
  const kindColor = kindColors[agent.kind];
  const health = healthStyles[agent.health];
  const TriggerIcon = triggerIcons[agent.trigger];
  const successRate =
    agent.stats.last10Total > 0
      ? Math.round((agent.stats.last10Success / agent.stats.last10Total) * 100)
      : null;

  return (
    <div
      className="group flex items-center gap-3 px-4 py-3 hover:bg-gray-50/70 cursor-pointer transition-colors"
      onClick={onClick}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${kindColor.bg} ${kindColor.text} ring-1 ${kindColor.ring}`}
        >
          <KindIcon className="w-5 h-5" />
        </div>
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${health.dot}`}
          title={health.label}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {agent.displayName}
          </h3>
          {agent.criticality === "critical" && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-red-200 text-red-600 bg-red-50">
              crítico
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500 flex-wrap">
          <span className="flex items-center gap-1">
            <TriggerIcon className="w-3 h-3" />
            {agent.trigger === "cron" ? agent.scheduleHuman ?? "programado" : triggerLabels[agent.trigger]}
          </span>
          <span className="text-gray-300">·</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {agent.lastRun ? relativeTime(agent.lastRun.startedAt) : "sin corridas"}
          </span>
          {successRate != null && (
            <>
              <span className="text-gray-300">·</span>
              <span
                className={`flex items-center gap-1 font-medium ${
                  successRate >= 90
                    ? "text-emerald-600"
                    : successRate >= 70
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {successRate >= 90 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : successRate >= 70 ? (
                  <Minus className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {agent.stats.last10Success}/{agent.stats.last10Total}
              </span>
            </>
          )}
        </div>
        {agent.lastRun?.status === "error" && agent.lastRun.errorMessage && (
          <p className="text-[11px] text-red-600 mt-1 line-clamp-1 font-mono">
            {agent.lastRun.errorMessage}
          </p>
        )}
      </div>

      {/* Action */}
      <div className="flex items-center gap-1 shrink-0">
        {agent.hasRunnable && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2.5 text-[11px] text-[#2FA4A9] hover:bg-[#2FA4A9]/10 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
            disabled={isRunning}
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <PlayCircle className="w-3.5 h-3.5 mr-1" />
                Ejecutar
              </>
            )}
          </Button>
        )}
        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </div>
  );
}

function AgentSheet({
  agentName,
  onClose,
  onRun,
  isRunning,
}: {
  agentName: string | null;
  onClose: () => void;
  onRun: (name: string) => void;
  isRunning: (name: string) => boolean;
}) {
  const { data, isLoading } = useQuery<RunsResponse>({
    queryKey: [`/api/admin/agents/${agentName}/runs`],
    enabled: !!agentName,
    refetchInterval: 15_000,
  });

  return (
    <Sheet open={!!agentName} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col overflow-hidden"
      >
        {isLoading || !data ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
          </div>
        ) : (
          <SheetBody data={data} onRun={onRun} isRunning={isRunning(data.agent.name)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({
  data,
  onRun,
  isRunning,
}: {
  data: RunsResponse;
  onRun: (name: string) => void;
  isRunning: boolean;
}) {
  const agent = data.agent;
  const KindIcon = kindIcons[agent.kind];
  const kindColor = kindColors[agent.kind];
  const health = healthStyles[agent.health];
  const TriggerIcon = triggerIcons[agent.trigger];

  // Stats
  const lastSuccess = data.runs.find((r) => r.status === "success") ?? null;
  const lastError = data.runs.find((r) => r.status === "error") ?? null;
  const totalRuns = data.runs.length;
  const successCount = data.runs.filter((r) => r.status === "success").length;
  const successRate = totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : null;
  const avgDuration =
    data.runs.filter((r) => r.durationMs != null).reduce((acc, r) => acc + (r.durationMs ?? 0), 0) /
    Math.max(1, data.runs.filter((r) => r.durationMs != null).length);
  const isLive = data.runs[0]?.status === "running";

  return (
    <>
      {/* Header */}
      <SheetHeader className="px-6 py-5 border-b border-gray-100 space-y-0">
        <div className="flex items-start gap-3 pr-8">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${kindColor.bg} ${kindColor.text} ring-1 ${kindColor.ring} shrink-0`}
          >
            <KindIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <SheetTitle className="text-lg leading-tight">{agent.displayName}</SheetTitle>
              {isLive && (
                <Badge className="bg-blue-50 text-blue-700 border-0 text-[10px] gap-1 animate-pulse">
                  <Zap className="w-2.5 h-2.5" />
                  corriendo
                </Badge>
              )}
            </div>
            <p className="text-xs font-mono text-gray-400 mt-0.5">{agent.name}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className={`${health.bg} ${health.text} border-0 text-[10px] gap-1`}>
                <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
                {health.label}
              </Badge>
              <Badge variant="outline" className="text-[10px] border-gray-200 text-gray-600 gap-1">
                <TriggerIcon className="w-2.5 h-2.5" />
                {agent.trigger === "cron" ? agent.scheduleHuman ?? "programado" : triggerLabels[agent.trigger]}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] border-gray-200 gap-1 ${criticalityStyles[agent.criticality].text}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${criticalityStyles[agent.criticality].dot}`} />
                {criticalityStyles[agent.criticality].label}
              </Badge>
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-3 leading-relaxed">{agent.description}</p>
        {agent.hasRunnable && (
          <div className="pt-3">
            <Button
              size="sm"
              onClick={() => onRun(agent.name)}
              disabled={isRunning}
              className="bg-[#2FA4A9] hover:bg-[#2FA4A9]/90 text-white gap-1.5"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Disparando…
                </>
              ) : (
                <>
                  <PlayCircle className="w-3.5 h-3.5" />
                  Ejecutar ahora
                </>
              )}
            </Button>
          </div>
        )}
      </SheetHeader>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="px-6 mt-1 bg-transparent border-b border-gray-100 rounded-none h-auto justify-start gap-4 shrink-0">
          <TabsTrigger
            value="overview"
            className="data-[state=active]:border-b-2 data-[state=active]:border-[#2FA4A9] data-[state=active]:text-[#2FA4A9] data-[state=active]:shadow-none rounded-none px-0 pb-2.5 text-xs font-medium"
          >
            Resumen
          </TabsTrigger>
          <TabsTrigger
            value="runs"
            className="data-[state=active]:border-b-2 data-[state=active]:border-[#2FA4A9] data-[state=active]:text-[#2FA4A9] data-[state=active]:shadow-none rounded-none px-0 pb-2.5 text-xs font-medium"
          >
            Historial ({data.runs.length})
          </TabsTrigger>
          <TabsTrigger
            value="stats"
            className="data-[state=active]:border-b-2 data-[state=active]:border-[#2FA4A9] data-[state=active]:text-[#2FA4A9] data-[state=active]:shadow-none rounded-none px-0 pb-2.5 text-xs font-medium"
          >
            Métricas
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 overflow-hidden">
          <TabsContent value="overview" className="px-6 py-5 space-y-5 mt-0">
            {/* Quick stats grid */}
            <div className="grid grid-cols-3 gap-2">
              <StatCell
                label="Última corrida"
                value={agent.lastRun ? relativeTime(agent.lastRun.startedAt) : "nunca"}
                sub={agent.lastRun?.status ?? "—"}
              />
              <StatCell
                label="Última exitosa"
                value={lastSuccess ? relativeTime(lastSuccess.startedAt) : "nunca"}
                sub={lastSuccess ? formatDuration(lastSuccess.durationMs) : "—"}
              />
              <StatCell
                label="Éxito (10)"
                value={`${agent.stats.last10Success}/${agent.stats.last10Total}`}
                sub={
                  agent.stats.last10Total > 0
                    ? `${Math.round((agent.stats.last10Success / agent.stats.last10Total) * 100)}%`
                    : "—"
                }
              />
            </div>

            {/* How it works */}
            {agent.longDescription && (
              <Section title="Cómo funciona">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                  {agent.longDescription}
                </p>
              </Section>
            )}

            {/* Connections */}
            {agent.connections && agent.connections.length > 0 && (
              <Section title="Conexiones">
                <div className="space-y-2">
                  {agent.connections.map((conn, i) => {
                    const style = connectionStyles[conn.type];
                    const Icon = style.icon;
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-white hover:border-gray-200 transition-colors"
                      >
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center ${style.bg} ${style.iconColor} shrink-0`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-900">{conn.label}</p>
                            <span className={`text-[10px] font-medium ${style.text} uppercase tracking-wide`}>
                              {style.label}
                            </span>
                          </div>
                          {conn.detail && (
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{conn.detail}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Source */}
            {agent.sourceFile && (
              <Section title="Código fuente">
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100 text-xs font-mono text-gray-700">
                  <FileCode className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="truncate">{agent.sourceFile}</span>
                </div>
              </Section>
            )}
          </TabsContent>

          <TabsContent value="runs" className="px-6 py-5 mt-0">
            {data.runs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Clock className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">Sin ejecuciones registradas</p>
              </div>
            ) : (
              <RunTimeline runs={data.runs} />
            )}
          </TabsContent>

          <TabsContent value="stats" className="px-6 py-5 space-y-5 mt-0">
            <div className="grid grid-cols-2 gap-3">
              <BigStatCard
                label="Tasa de éxito"
                value={successRate != null ? `${successRate}%` : "—"}
                sub={`${successCount} de ${totalRuns} corridas`}
                color={
                  successRate == null
                    ? "gray"
                    : successRate >= 90
                      ? "emerald"
                      : successRate >= 70
                        ? "amber"
                        : "red"
                }
              />
              <BigStatCard
                label="Duración promedio"
                value={totalRuns > 0 ? formatDuration(Math.round(avgDuration)) : "—"}
                sub={`promedio de ${data.runs.filter((r) => r.durationMs != null).length} corridas`}
                color="gray"
              />
              <BigStatCard
                label="Última exitosa"
                value={lastSuccess ? relativeTime(lastSuccess.startedAt) : "nunca"}
                sub={lastSuccess ? formatDateTime(lastSuccess.startedAt) : "—"}
                color="emerald"
              />
              <BigStatCard
                label="Último error"
                value={lastError ? relativeTime(lastError.startedAt) : "nunca"}
                sub={lastError ? formatDateTime(lastError.startedAt) : "—"}
                color={lastError ? "red" : "gray"}
              />
            </div>

            {/* Mini sparkline of success/error pattern */}
            {data.runs.length > 0 && (
              <Section title="Patrón últimas 30 corridas">
                <SuccessPattern runs={data.runs.slice(0, 30)} />
              </Section>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
        {title}
      </h4>
      {children}
    </div>
  );
}

function StatCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-1 truncate">{value}</p>
      <p className="text-[10px] text-gray-500 truncate">{sub}</p>
    </div>
  );
}

function BigStatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: "emerald" | "amber" | "red" | "gray";
}) {
  const colors = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
    gray: "text-gray-700",
  };
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1.5 ${colors[color]}`}>{value}</p>
      <p className="text-[11px] text-gray-500 mt-1">{sub}</p>
    </div>
  );
}

function SuccessPattern({ runs }: { runs: FullRun[] }) {
  const reversed = [...runs].reverse();
  return (
    <div className="flex items-end gap-1 h-12 bg-gray-50 rounded-lg p-2">
      {reversed.map((r) => {
        const color =
          r.status === "success"
            ? "bg-emerald-400"
            : r.status === "error"
              ? "bg-red-400"
              : r.status === "running"
                ? "bg-blue-400 animate-pulse"
                : "bg-amber-400";
        return (
          <div
            key={r.id}
            className={`flex-1 ${color} rounded-sm hover:opacity-70 transition-opacity`}
            style={{ minHeight: "4px", height: r.status === "success" ? "100%" : "60%" }}
            title={`${r.status} · ${relativeTime(r.startedAt)}`}
          />
        );
      })}
    </div>
  );
}

function RunTimeline({ runs }: { runs: FullRun[] }) {
  return (
    <div className="relative">
      {/* vertical rail */}
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-100" />
      <div className="space-y-2">
        {runs.map((run) => (
          <RunTimelineItem key={run.id} run={run} />
        ))}
      </div>
    </div>
  );
}

function RunTimelineItem({ run }: { run: FullRun }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!run.errorMessage || !!run.metadata;
  const statusDot =
    run.status === "success"
      ? "bg-emerald-500 ring-emerald-100"
      : run.status === "error"
        ? "bg-red-500 ring-red-100"
        : run.status === "running"
          ? "bg-blue-500 ring-blue-100 animate-pulse"
          : "bg-amber-500 ring-amber-100";

  return (
    <div className="relative pl-6">
      {/* dot on rail */}
      <span
        className={`absolute left-0 top-3 w-3.5 h-3.5 rounded-full ring-4 ${statusDot}`}
      />
      <div
        className={`bg-white border rounded-lg transition-colors ${
          run.status === "error" ? "border-red-100" : "border-gray-100"
        } ${hasDetails ? "cursor-pointer hover:border-gray-200" : ""}`}
        onClick={() => hasDetails && setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 px-3 py-2.5 text-xs">
          <span
            className={`text-[10px] font-medium uppercase tracking-wide ${
              run.status === "success"
                ? "text-emerald-700"
                : run.status === "error"
                  ? "text-red-700"
                  : run.status === "running"
                    ? "text-blue-700"
                    : "text-amber-700"
            }`}
          >
            {run.status}
          </span>
          <span className="text-gray-700 font-medium">{relativeTime(run.startedAt)}</span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-500">{formatDuration(run.durationMs)}</span>
          {run.recordsProcessed != null && run.recordsProcessed > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-gray-500">{run.recordsProcessed} reg</span>
            </>
          )}
          <span className="text-[10px] text-gray-400 ml-auto">{run.triggeredBy}</span>
          {hasDetails && (
            <ChevronDown
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          )}
        </div>
        {expanded && (
          <div className="border-t border-gray-100 px-3 py-3 space-y-3 bg-gray-50/50">
            {run.errorMessage && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wide">
                  Error
                </p>
                <p className="text-xs text-red-700 font-mono leading-relaxed">{run.errorMessage}</p>
                {run.errorStack && (
                  <pre className="text-[10px] text-red-600 mt-1 overflow-x-auto font-mono whitespace-pre-wrap bg-red-50 border border-red-100 rounded p-2 max-h-48">
                    {run.errorStack}
                  </pre>
                )}
              </div>
            )}
            {run.metadata && Object.keys(run.metadata).length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                  Metadata
                </p>
                <div className="bg-white border border-gray-200 rounded p-2.5">
                  <JsonTree value={run.metadata} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500">
              <div>
                <span className="text-gray-400">Inicio:</span>{" "}
                <span className="font-mono">{formatDateTime(run.startedAt)}</span>
              </div>
              <div>
                <span className="text-gray-400">Fin:</span>{" "}
                <span className="font-mono">{formatDateTime(run.completedAt)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function JsonTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null) return <span className="text-gray-400">null</span>;
  if (value === undefined) return <span className="text-gray-400">undefined</span>;
  if (typeof value === "boolean")
    return <span className="text-purple-600 font-mono">{String(value)}</span>;
  if (typeof value === "number")
    return <span className="text-blue-600 font-mono">{value}</span>;
  if (typeof value === "string")
    return <span className="text-emerald-700 font-mono break-all">"{value}"</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-400 font-mono">[]</span>;
    return (
      <div className={depth > 0 ? "ml-3" : ""}>
        {value.map((item, i) => (
          <div key={i} className="flex gap-1.5 text-[11px]">
            <span className="text-gray-400 font-mono shrink-0">{i}:</span>
            <JsonTree value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-gray-400 font-mono">{"{}"}</span>;
    return (
      <div className={depth > 0 ? "ml-3" : ""}>
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-1.5 text-[11px]">
            <span className="text-gray-700 font-mono font-medium shrink-0">{k}:</span>
            <JsonTree value={v} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-gray-500 font-mono">{String(value)}</span>;
}
