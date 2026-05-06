import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PlayCircle,
  Webhook,
  Calendar,
  Hand,
  ChevronRight,
  Brain,
  Cog,
  Plug,
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
};

type KindInfo = { label: string; description: string };

type AgentsResponse = {
  agents: Agent[];
  kinds: Record<AgentKind, KindInfo>;
  summary: { total: number; healthy: number; warning: number; error: number; idle: number };
};

type RunsResponse = {
  agent: Agent;
  runs: Array<AgentRun & { errorStack: string | null; metadata: Record<string, unknown> | null; agentName: string }>;
};

const kindIcons: Record<AgentKind, typeof Brain> = {
  ai: Brain,
  automation: Cog,
  integration: Plug,
  webhook: Webhook,
};

const kindNoun: Record<AgentKind, string> = {
  ai: "agentes",
  automation: "automatizaciones",
  integration: "integraciones",
  webhook: "webhooks",
};

const triggerIcons = {
  cron: Calendar,
  webhook: Webhook,
  manual: Hand,
} as const;

const healthStyles: Record<AgentHealth, { bg: string; text: string; label: string; dot: string }> = {
  healthy: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Saludable", dot: "bg-emerald-500" },
  warning: { bg: "bg-amber-50", text: "text-amber-700", label: "Con avisos", dot: "bg-amber-500" },
  error: { bg: "bg-red-50", text: "text-red-700", label: "Con errores", dot: "bg-red-500" },
  idle: { bg: "bg-gray-50", text: "text-gray-500", label: "Sin datos", dot: "bg-gray-300" },
};

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

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const { data, isLoading } = useQuery<AgentsResponse>({
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

  if (isLoading || !data) {
    return (
      <div className="py-12 text-center text-gray-400">
        <Activity className="w-8 h-8 mx-auto mb-3 animate-pulse" />
        <p className="text-sm">Cargando sistema…</p>
      </div>
    );
  }

  const agentsByKind: Record<AgentKind, Agent[]> = {
    ai: [],
    automation: [],
    integration: [],
    webhook: [],
  };
  for (const agent of data.agents) {
    agentsByKind[agent.kind]?.push(agent);
  }

  const kindOrder: AgentKind[] = ["ai", "automation", "integration", "webhook"];

  return (
    <div className="space-y-6 pt-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Sistema</h1>
        <p className="text-sm text-gray-500 mt-1">
          Agentes IA, automatizaciones, integraciones y webhooks del CRM.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Total"
          value={data.summary.total}
          color="text-gray-900"
          icon={<Activity className="w-4 h-4 text-gray-400" />}
        />
        <SummaryCard
          label="Saludables"
          value={data.summary.healthy}
          color="text-emerald-600"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <SummaryCard
          label="Con avisos"
          value={data.summary.warning}
          color="text-amber-600"
          icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
        />
        <SummaryCard
          label="Con errores"
          value={data.summary.error}
          color="text-red-600"
          icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
        />
      </div>

      {/* Kind sections */}
      {kindOrder
        .filter((k) => agentsByKind[k].length)
        .map((kind) => {
          const info = data.kinds[kind];
          const KindIcon = kindIcons[kind];
          return (
            <div key={kind}>
              <div className="flex items-baseline gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <KindIcon className="w-4 h-4 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    {info?.label ?? kind}
                  </h2>
                </div>
                <span className="text-xs text-gray-400">{info?.description}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {agentsByKind[kind].length} {kindNoun[kind]}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {agentsByKind[kind].map((agent) => (
                  <AgentCard
                    key={agent.name}
                    agent={agent}
                    onClick={() => setSelectedAgent(agent.name)}
                    onRun={() => runMutation.mutate(agent.name)}
                    isRunning={runMutation.isPending && runMutation.variables === agent.name}
                  />
                ))}
              </div>
            </div>
          );
        })}

      {/* Runs dialog */}
      <AgentRunsDialog
        agentName={selectedAgent}
        onClose={() => setSelectedAgent(null)}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">{label}</span>
          {icon}
        </div>
        <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function AgentCard({
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
  const health = healthStyles[agent.health];
  const TriggerIcon = triggerIcons[agent.trigger];
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer group" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${health.dot}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {agent.displayName}
              </h3>
              {agent.criticality === "critical" && (
                <Badge variant="outline" className="text-[10px] h-5 border-red-200 text-red-600 bg-red-50">
                  crítico
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{agent.description}</p>

            <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <TriggerIcon className="w-3 h-3" />
                {agent.trigger === "cron" && agent.scheduleHuman}
                {agent.trigger === "webhook" && "webhook"}
                {agent.trigger === "manual" && "manual"}
              </span>
              {agent.lastRun && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {relativeTime(agent.lastRun.startedAt)}
                </span>
              )}
              {agent.lastRun?.recordsProcessed ? (
                <span className="text-gray-600 font-medium">
                  {agent.lastRun.recordsProcessed} reg
                </span>
              ) : null}
              <Badge variant="outline" className={`text-[10px] h-5 border-0 ${health.bg} ${health.text}`}>
                {health.label}
              </Badge>
            </div>

            {agent.lastRun?.status === "error" && agent.lastRun.errorMessage && (
              <p className="text-[11px] text-red-600 mt-2 line-clamp-1 font-mono">
                {agent.lastRun.errorMessage}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1 items-end">
            {agent.hasRunnable && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-[#2FA4A9] hover:bg-[#2FA4A9]/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onRun();
                }}
                disabled={isRunning}
              >
                <PlayCircle className="w-3 h-3 mr-1" />
                {isRunning ? "Corriendo…" : "Ejecutar"}
              </Button>
            )}
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentRunsDialog({
  agentName,
  onClose,
}: {
  agentName: string | null;
  onClose: () => void;
}) {
  const { data } = useQuery<RunsResponse>({
    queryKey: [`/api/admin/agents/${agentName}/runs`],
    enabled: !!agentName,
  });

  return (
    <Dialog open={!!agentName} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.agent?.displayName ?? "Agente"}</DialogTitle>
        </DialogHeader>
        {data && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">{data.agent.description}</div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <InfoCell label="Disparador" value={data.agent.trigger} />
              <InfoCell label="Horario" value={data.agent.scheduleHuman ?? "—"} />
              <InfoCell label="Criticidad" value={data.agent.criticality} />
            </div>

            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Últimas ejecuciones
              </h4>
              {data.runs.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">
                  Sin ejecuciones registradas todavía
                </p>
              ) : (
                <div className="space-y-1">
                  {data.runs.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function RunRow({ run }: { run: RunsResponse["runs"][number] }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor =
    run.status === "success"
      ? "bg-emerald-100 text-emerald-700"
      : run.status === "error"
        ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-700";

  return (
    <div
      className={`border rounded-lg ${run.status === "error" ? "border-red-100" : "border-gray-100"} ${run.errorMessage ? "cursor-pointer" : ""}`}
      onClick={() => run.errorMessage && setExpanded((v) => !v)}
    >
      <div className="flex items-center gap-3 p-2.5 text-xs">
        <Badge variant="outline" className={`${statusColor} border-0 text-[10px] h-5`}>
          {run.status}
        </Badge>
        <span className="text-gray-600 min-w-[90px]">{relativeTime(run.startedAt)}</span>
        <span className="text-gray-400">{formatDuration(run.durationMs)}</span>
        <span className="text-gray-400">{run.recordsProcessed ?? 0} reg</span>
        <span className="text-[10px] text-gray-400 ml-auto">{run.triggeredBy}</span>
      </div>
      {expanded && run.errorMessage && (
        <div className="px-2.5 pb-2.5 border-t border-red-100">
          <p className="text-xs font-semibold text-red-700 mt-2">{run.errorMessage}</p>
          {run.errorStack && (
            <pre className="text-[10px] text-red-600 mt-1 overflow-x-auto font-mono whitespace-pre-wrap">
              {run.errorStack}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
