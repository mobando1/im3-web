import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Send, Loader2, Check, Stethoscope, Plus, ShieldAlert, Database, FileCode, Search, FolderTree, AlertTriangle, KeyRound, Table, Wrench, Play, X, Settings2, ToggleRight, RefreshCw, GitPullRequest } from "lucide-react";

type ToolCall = { tool: string; summary: string };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCall[] | null;
  createdAt: string;
};

type Session = { id: string; title: string; createdAt: string };

type PendingAction = {
  id: string;
  sessionId: string | null;
  actionType: string;
  title: string;
  preview: string | null;
  status: string;
  createdAt: string;
};

const TOOL_META: Record<string, { label: string; Icon: typeof Check }> = {
  read_agent_runs: { label: "Leyó ejecuciones de agentes", Icon: AlertTriangle },
  view_agent_run: { label: "Inspeccionó un error", Icon: AlertTriangle },
  read_source_file: { label: "Leyó archivo de código", Icon: FileCode },
  search_code: { label: "Buscó en el código", Icon: Search },
  list_dir: { label: "Listó una carpeta", Icon: FolderTree },
  get_db_schema: { label: "Revisó el esquema de DB", Icon: Table },
  query_db_readonly: { label: "Consultó la DB (solo lectura)", Icon: Database },
  check_env: { label: "Verificó variables de entorno", Icon: KeyRound },
  propose_set_config: { label: "Propuso cambiar configuración", Icon: Settings2 },
  propose_toggle_flag: { label: "Propuso encender/apagar un flag", Icon: ToggleRight },
  propose_retry_agent: { label: "Propuso reintentar un agente", Icon: RefreshCw },
  propose_db_write: { label: "Propuso un arreglo de datos", Icon: Database },
  propose_code_change: { label: "Propuso un cambio de código (PR)", Icon: GitPullRequest },
};

const ACTION_META: Record<string, { label: string; Icon: typeof Check }> = {
  set_config: { label: "Cambio de configuración", Icon: Settings2 },
  retry_agent: { label: "Reintento de agente", Icon: RefreshCw },
  db_write: { label: "Arreglo de datos", Icon: Database },
  code_change: { label: "Cambio de código (Pull Request)", Icon: GitPullRequest },
};

const QUICK_SUGGESTIONS = [
  "¿Qué agentes fallaron en las últimas 24h y por qué?",
  "Las propuestas con IA están fallando, diagnostica la causa raíz",
  "Revisa qué model ID usamos y si sigue vigente en Anthropic",
  "Busca contactos sin email (dato inconsistente) y explica el riesgo",
];

const ACK_KEY = "im3_engineer_ack_v1";

export default function AdminEngineering() {
  const [input, setInput] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [consentAction, setConsentAction] = useState<PendingAction | null>(null);
  const [acknowledged, setAcknowledged] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(ACK_KEY) === "1";
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["/api/admin/engineer/sessions"],
  });

  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) setActiveSessionId(sessions[0].id);
  }, [sessions, activeSessionId]);

  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/admin/engineer/sessions/${activeSessionId}/messages`],
    enabled: !!activeSessionId,
  });

  const { data: actions = [] } = useQuery<PendingAction[]>({
    queryKey: ["engineer-actions", activeSessionId],
    enabled: !!activeSessionId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/engineer/actions?sessionId=${activeSessionId}`);
      return res.json();
    },
  });
  const pendingActions = actions.filter((a) => a.status === "pending");

  const invalidateSession = (sessionId: string) => {
    queryClient.invalidateQueries({ queryKey: [`/api/admin/engineer/sessions/${sessionId}/messages`] });
    queryClient.invalidateQueries({ queryKey: ["engineer-actions", sessionId] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/engineer/sessions"] });
  };

  const newSessionMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/engineer/sessions")).json() as Promise<Session>,
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/engineer/sessions"] });
      setActiveSessionId(session.id);
      setInput("");
      setTimeout(() => textareaRef.current?.focus(), 50);
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (vars: { sessionId: string; message: string }) =>
      (await apiRequest("POST", "/api/admin/engineer/chat", vars)).json(),
    onSuccess: (_data, vars) => {
      invalidateSession(vars.sessionId);
      setInput("");
      setTimeout(() => textareaRef.current?.focus(), 50);
    },
    onError: (err: any) => {
      toast({ title: "Error en el diagnóstico", description: err?.message || "Revisa la consola", variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (vars: { id: string; reason: string }) =>
      (await apiRequest("POST", `/api/admin/engineer/actions/${vars.id}/apply`, { consent: true, reason: vars.reason })).json(),
    onSuccess: (data: { message?: string }) => {
      if (activeSessionId) invalidateSession(activeSessionId);
      setConsentAction(null);
      const msg = data?.message || "Listo, sin redeploy.";
      const prUrl = msg.match(/https?:\/\/github\.com\/\S+/)?.[0];
      toast({
        title: "Acción aplicada",
        description: msg,
        action: prUrl ? (
          <ToastAction altText="Abrir PR" onClick={() => window.open(prUrl, "_blank", "noopener")}>Abrir PR</ToastAction>
        ) : undefined,
      });
    },
    onError: (err: any) => {
      setConsentAction(null);
      toast({ title: "No se pudo aplicar", description: err?.message || "Revisa la consola", variant: "destructive" });
    },
  });

  const discardMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/engineer/actions/${id}/discard`),
    onSuccess: () => { if (activeSessionId) invalidateSession(activeSessionId); },
  });

  const pendingMessage = sendMutation.isPending ? sendMutation.variables?.message : null;
  const allMessages: ChatMessage[] = pendingMessage
    ? [...messages, { id: "__pending__", role: "user", content: pendingMessage, toolCalls: null, createdAt: new Date().toISOString() }]
    : messages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length, sendMutation.isPending, pendingActions.length]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || sendMutation.isPending || newSessionMutation.isPending) return;
    let sessionId = activeSessionId;
    if (!sessionId) sessionId = (await newSessionMutation.mutateAsync()).id;
    sendMutation.mutate({ sessionId, message: msg });
  };

  const acknowledge = () => {
    window.localStorage.setItem(ACK_KEY, "1");
    setAcknowledged(true);
  };

  return (
    <div className="py-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-9 w-9 rounded-lg bg-[#2FA4A9]/10 flex items-center justify-center">
          <Stethoscope className="w-5 h-5 text-[#2FA4A9]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ingeniero IM3</h1>
          <p className="text-xs text-gray-500">Diagnóstico técnico asistido · acciones con tu confirmación</p>
        </div>
      </div>

      {!acknowledged && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">Herramienta técnica con acciones controladas</p>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                El agente <strong>diagnostica</strong> (lee errores, código, datos) y puede <strong>proponer</strong> arreglos (config, flags, reintentos, datos).
                Ninguna acción se ejecuta sin que tú la confirmes firmando responsabilidad. <strong>Eres responsable de los cambios que apliques.</strong>
                Todo queda registrado para trazabilidad.
              </p>
              <Button onClick={acknowledge} size="sm" className="mt-3 bg-amber-600 hover:bg-amber-700">Entiendo, soy responsable</Button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        {sessions.length > 0 && (
          <select
            value={activeSessionId ?? ""}
            onChange={(e) => setActiveSessionId(e.target.value)}
            className="flex-1 sm:flex-none sm:w-80 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        )}
        <Button onClick={() => newSessionMutation.mutate()} variant="outline" size="sm" disabled={newSessionMutation.isPending} className="shrink-0">
          <Plus className="w-4 h-4 mr-1" /> Nueva conversación
        </Button>
      </div>

      <div className="mt-4 border border-gray-200 rounded-xl bg-white flex flex-col h-[calc(100vh-320px)] min-h-[420px]">
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50 rounded-t-xl">
          {isLoading ? (
            <p className="text-center text-xs text-gray-400 py-8">Cargando…</p>
          ) : allMessages.length === 0 ? (
            <div className="space-y-3 py-6">
              <div className="text-center space-y-2">
                <Stethoscope className="w-10 h-10 text-[#2FA4A9]/40 mx-auto" />
                <p className="text-sm text-gray-600 font-medium">¿Qué problema técnico diagnosticamos?</p>
                <p className="text-xs text-gray-400">Describe el síntoma; el agente revisa errores, código y datos, y si hace falta propone un arreglo que tú confirmas.</p>
              </div>
              <div className="space-y-1.5 mt-4 max-w-lg mx-auto">
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium px-1">Ejemplos</p>
                {QUICK_SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => setInput(s)} className="w-full text-left px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-[#2FA4A9]/40 hover:bg-[#2FA4A9]/5 transition-colors text-xs text-gray-700">{s}</button>
                ))}
              </div>
            </div>
          ) : (
            allMessages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-[#2FA4A9] text-white" : "bg-white border border-gray-200 text-gray-800"}`}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                      {m.toolCalls.map((tc, i) => {
                        const meta = TOOL_META[tc.tool] || { label: tc.tool, Icon: Check };
                        const Icon = meta.Icon;
                        return (
                          <div key={i} className="flex items-start gap-1.5 text-[11px] text-[#1f7c80] bg-[#2FA4A9]/10 rounded px-2 py-1">
                            <Icon className="w-3 h-3 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium">{meta.label}</div>
                              <div className="text-[#1f7c80]/80 truncate">{tc.summary}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {sendMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2.5 flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Diagnosticando…
              </div>
            </div>
          )}

          {/* Action cards — propuestas pendientes de confirmación */}
          {pendingActions.map((a) => {
            const meta = ACTION_META[a.actionType] || { label: a.actionType, Icon: Wrench };
            const Icon = meta.Icon;
            return (
              <div key={a.id} className="flex justify-start">
                <div className="max-w-[88%] w-full rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-amber-700" />
                    <span className="text-xs font-semibold text-amber-900 uppercase tracking-wide">{meta.label} · requiere tu confirmación</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{a.title}</p>
                  {a.preview && <p className="text-xs text-gray-600 mt-1 font-mono break-words">{a.preview}</p>}
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700 h-8" onClick={() => setConsentAction(a)}>
                      <Play className="w-3.5 h-3.5 mr-1" /> Aplicar (firmo responsable)
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-gray-500" onClick={() => discardMutation.mutate(a.id)} disabled={discardMutation.isPending}>
                      {discardMutation.isPending && discardMutation.variables === a.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                      Descartar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-gray-200 p-3 bg-white rounded-b-xl">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Describe el problema técnico a diagnosticar…"
              rows={2}
              className="resize-none text-sm"
              disabled={sendMutation.isPending}
            />
            <Button onClick={handleSend} disabled={!input.trim() || sendMutation.isPending || newSessionMutation.isPending} size="sm" className="bg-[#2FA4A9] hover:bg-[#238b8f] shrink-0">
              {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">Diagnostica en solo-lectura · las acciones se aplican solo con tu confirmación · Enter para enviar</p>
        </div>
      </div>

      {/* Modal de consentimiento */}
      {consentAction && (
        <ConsentModal
          action={consentAction}
          isApplying={applyMutation.isPending}
          onCancel={() => setConsentAction(null)}
          onConfirm={(reason) => applyMutation.mutate({ id: consentAction.id, reason })}
        />
      )}
    </div>
  );
}

function ConsentModal({ action, isApplying, onCancel, onConfirm }: {
  action: PendingAction;
  isApplying: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-md bg-white rounded-2xl shadow-2xl p-5">
        <div className="flex items-start justify-between">
          <h3 className="text-base font-bold text-gray-900">Confirmar acción</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-gray-700 mt-2">{action.title}</p>
        {action.preview && <p className="text-xs text-gray-500 mt-1 font-mono break-words bg-gray-50 rounded p-2">{action.preview}</p>}

        <label className="block text-xs font-medium text-gray-600 mt-4 mb-1">Motivo (queda en la auditoría)</label>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="text-sm" placeholder="Ej: el modelo anterior fue retirado por Anthropic" />

        <label className="flex items-start gap-2 mt-3 cursor-pointer">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
          <span className="text-xs text-gray-700">Confirmo que <strong>soy responsable</strong> de este cambio y entiendo que se aplica a producción.</span>
        </label>

        <div className="flex gap-2 mt-4 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700" disabled={!checked || isApplying} onClick={() => onConfirm(reason)}>
            {isApplying ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />} Aplicar ahora
          </Button>
        </div>
      </div>
    </>
  );
}
