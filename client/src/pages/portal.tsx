import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { Send, CheckCircle2, Circle, Clock, AlertCircle, ChevronDown, ChevronRight, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PortalOverview = {
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  estimatedEndDate: string | null;
  contactName: string | null;
  progress: number;
  totalHours: number;
  taskCount: number;
  completedTaskCount: number;
  unreadMessageCount: number;
};

type Phase = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  progress: number;
  tasks: Array<{ id: string; title: string; status: string; priority: string }>;
};

type Deliverable = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  deliveredAt: string | null;
  approvedAt: string | null;
  clientComment: string | null;
  demoUrl: string | null;
};

type TimeLogSummary = {
  byCategory: Record<string, number>;
  byWeek: Record<string, number>;
  totalHours: number;
};

type Message = {
  id: string;
  senderType: string;
  senderName: string;
  content: string;
  isRead: boolean;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  planning: "Planeaci\u00f3n",
  in_progress: "En progreso",
  paused: "Pausado",
  completed: "Completado",
  cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-blue-100 text-blue-700",
  in_progress: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};

const TASK_ICONS: Record<string, typeof Circle> = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
  blocked: AlertCircle,
};

const TASK_COLORS: Record<string, string> = {
  pending: "text-gray-400",
  in_progress: "text-blue-500",
  completed: "text-emerald-500",
  blocked: "text-red-500",
};

const CATEGORY_LABELS: Record<string, string> = {
  development: "Desarrollo",
  design: "Dise\u00f1o",
  meeting: "Reuni\u00f3n",
  support: "Soporte",
  planning: "Planeaci\u00f3n",
};

const DELIV_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  delivered: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

const sections = ["Resumen", "Roadmap", "Entregas", "Actividad", "Mensajes"];

export default function Portal() {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState("Resumen");
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [msgContent, setMsgContent] = useState("");
  const [clientName, setClientName] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const base = `/api/portal/${token}`;

  const { data: overview, isLoading, error } = useQuery<PortalOverview>({ queryKey: [base] });
  const { data: phases = [] } = useQuery<Phase[]>({ queryKey: [`${base}/phases`], enabled: !!overview });
  const { data: deliverables = [] } = useQuery<Deliverable[]>({ queryKey: [`${base}/deliverables`], enabled: !!overview });
  const { data: timeSummary } = useQuery<TimeLogSummary>({ queryKey: [`${base}/timelog`], enabled: !!overview });
  const { data: messages = [] } = useQuery<Message[]>({ queryKey: [`${base}/messages`], enabled: !!overview });

  useEffect(() => {
    if (phases.length > 0) setExpandedPhases(new Set(phases.map(p => p.id)));
  }, [phases]);

  useEffect(() => {
    if (activeSection === "Mensajes") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      // Mark as read
      fetch(`${base}/messages/read`, { method: "PATCH" });
    }
  }, [activeSection, messages]);

  const sendMsgMut = useMutation({
    mutationFn: async (content: string) => {
      await fetch(`${base}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, senderName: clientName || "Cliente" }),
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`${base}/messages`] }); setMsgContent(""); },
  });

  const reviewDelivMut = useMutation({
    mutationFn: async ({ id, status, comment }: { id: string; status: string; comment: string }) => {
      await fetch(`${base}/deliverables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, clientComment: comment || null }),
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`${base}/deliverables`] }); setReviewingId(null); setReviewComment(""); },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-gray-200 border-t-[#2FA4A9] rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Proyecto no encontrado</h1>
          <p className="text-gray-500">El link puede haber expirado o ser inv\u00e1lido.</p>
        </div>
      </div>
    );
  }

  const togglePhase = (id: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <img src="/assets/im3-logo.png" alt="IM3" className="h-6" />
            <div className="h-5 w-px bg-gray-200" />
            <div>
              <h1 className="text-sm font-semibold text-gray-900">{overview.name}</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[overview.status]}`}>
                {STATUS_LABELS[overview.status]}
              </span>
            </div>
          </div>
        </div>
        {/* Nav */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto">
          {sections.map(s => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeSection === s
                  ? "border-[#2FA4A9] text-[#2FA4A9]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {s}
              {s === "Mensajes" && overview.unreadMessageCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">
                  {overview.unreadMessageCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* ── RESUMEN ── */}
        {activeSection === "Resumen" && (
          <div className="space-y-6">
            {overview.description && (
              <p className="text-gray-600">{overview.description}</p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Progreso", value: `${overview.progress}%` },
                { label: "Tareas", value: `${overview.completedTaskCount}/${overview.taskCount}` },
                { label: "Horas invertidas", value: `${overview.totalHours.toFixed(1)}h` },
                { label: "Entregas", value: `${deliverables.filter(d => d.status === "approved").length} aprobadas` },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 font-medium">{s.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-medium text-gray-900 mb-3">Progreso general</p>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#2FA4A9] rounded-full transition-all duration-500" style={{ width: `${overview.progress}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-2">{overview.completedTaskCount} de {overview.taskCount} tareas completadas</p>
            </div>

            {/* Quick phase overview */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <p className="text-sm font-medium text-gray-900">Fases del proyecto</p>
              {phases.map(ph => (
                <div key={ph.id} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: ph.status === "completed" ? "#10b981" : ph.status === "in_progress" ? "#3b82f6" : "#d1d5db" }} />
                  <span className="text-sm text-gray-700 flex-1">{ph.name}</span>
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#2FA4A9] rounded-full" style={{ width: `${ph.progress}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 w-8 text-right">{ph.progress}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ROADMAP ── */}
        {activeSection === "Roadmap" && (
          <div className="space-y-4">
            {phases.map((phase, idx) => {
              const isExpanded = expandedPhases.has(phase.id);
              return (
                <div key={phase.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => togglePhase(phase.id)}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-400">FASE {idx + 1}</span>
                        <h3 className="font-medium text-gray-900">{phase.name}</h3>
                      </div>
                      {phase.description && <p className="text-xs text-gray-400 mt-0.5">{phase.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#2FA4A9] rounded-full" style={{ width: `${phase.progress}%` }} />
                      </div>
                      <span className="text-xs text-gray-400">{phase.progress}%</span>
                    </div>
                  </div>

                  {isExpanded && phase.tasks.length > 0 && (
                    <div className="border-t border-gray-100 px-5 py-3 space-y-1.5">
                      {phase.tasks.map(task => {
                        const Icon = TASK_ICONS[task.status] || Circle;
                        return (
                          <div key={task.id} className="flex items-center gap-3 py-1">
                            <Icon className={`w-4 h-4 ${TASK_COLORS[task.status]}`} />
                            <span className={`text-sm ${task.status === "completed" ? "line-through text-gray-400" : "text-gray-700"}`}>
                              {task.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── ENTREGAS ── */}
        {activeSection === "Entregas" && (
          <div className="space-y-4">
            {deliverables.length === 0 ? (
              <p className="text-center text-gray-400 py-12">No hay entregas a\u00fan.</p>
            ) : (
              deliverables.map(d => (
                <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-gray-900">{d.title}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${DELIV_COLORS[d.status]}`}>{d.status}</span>
                      </div>
                      {d.description && <p className="text-sm text-gray-500 mt-1">{d.description}</p>}
                      {d.deliveredAt && <p className="text-xs text-gray-400 mt-1">Entregado: {new Date(d.deliveredAt).toLocaleDateString("es-CO")}</p>}
                      {d.clientComment && (
                        <p className="text-sm text-amber-600 mt-2 bg-amber-50 px-3 py-1.5 rounded-lg">Tu comentario: {d.clientComment}</p>
                      )}
                      {d.demoUrl && (
                        <a href={d.demoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#2FA4A9] hover:underline mt-1 inline-flex items-center gap-1">
                          Ver demo <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Approve/Reject buttons for delivered items */}
                  {d.status === "delivered" && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      {reviewingId === d.id ? (
                        <div className="space-y-3">
                          <Textarea
                            value={reviewComment}
                            onChange={e => setReviewComment(e.target.value)}
                            placeholder="Comentario opcional..."
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => reviewDelivMut.mutate({ id: d.id, status: "approved", comment: reviewComment })}
                            >
                              Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => reviewDelivMut.mutate({ id: d.id, status: "rejected", comment: reviewComment })}
                            >
                              Rechazar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setReviewingId(null); setReviewComment(""); }}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setReviewingId(d.id)}>
                          Revisar entrega
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── ACTIVIDAD ── */}
        {activeSection === "Actividad" && (
          <div className="space-y-6">
            {timeSummary ? (
              <>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-medium text-gray-900 mb-4">Horas totales invertidas</p>
                  <p className="text-4xl font-bold text-[#2FA4A9]">{timeSummary.totalHours.toFixed(1)}h</p>
                </div>

                {/* By category */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-medium text-gray-900 mb-4">Por categor\u00eda</p>
                  <div className="space-y-3">
                    {Object.entries(timeSummary.byCategory).sort(([,a],[,b]) => b - a).map(([cat, hrs]) => {
                      const pct = timeSummary.totalHours > 0 ? (hrs / timeSummary.totalHours) * 100 : 0;
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-600">{CATEGORY_LABELS[cat] || cat}</span>
                            <span className="text-sm font-medium text-gray-900">{hrs.toFixed(1)}h</span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#2FA4A9] rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* By week */}
                {Object.keys(timeSummary.byWeek).length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-sm font-medium text-gray-900 mb-4">Por semana</p>
                    <div className="space-y-2">
                      {Object.entries(timeSummary.byWeek).sort(([a],[b]) => b.localeCompare(a)).slice(0, 8).map(([week, hrs]) => (
                        <div key={week} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                          <span className="text-sm text-gray-500">Semana del {new Date(week).toLocaleDateString("es-CO", { month: "short", day: "numeric" })}</span>
                          <span className="text-sm font-medium text-gray-900">{hrs.toFixed(1)}h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-center text-gray-400 py-12">No hay actividad registrada a\u00fan.</p>
            )}
          </div>
        )}

        {/* ── MENSAJES ── */}
        {activeSection === "Mensajes" && (
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ height: "calc(100vh - 220px)", minHeight: "400px" }}>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {messages.length === 0 ? (
                <p className="text-center text-gray-400 py-12">No hay mensajes a\u00fan. Inicia la conversaci\u00f3n.</p>
              ) : (
                messages.map(m => (
                  <div key={m.id} className={`flex ${m.senderType === "client" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                      m.senderType === "client"
                        ? "bg-[#2FA4A9] text-white rounded-br-md"
                        : "bg-gray-100 text-gray-900 rounded-bl-md"
                    }`}>
                      <p className={`text-[10px] font-medium mb-0.5 ${m.senderType === "client" ? "text-white/70" : "text-gray-400"}`}>{m.senderName}</p>
                      <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                      <p className={`text-[10px] mt-1 ${m.senderType === "client" ? "text-white/50" : "text-gray-300"}`}>
                        {new Date(m.createdAt).toLocaleString("es-CO", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t border-gray-100 p-4 space-y-2">
              {!clientName && (
                <Input
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="Tu nombre..."
                  className="text-sm"
                />
              )}
              <div className="flex gap-2">
                <Input
                  value={msgContent}
                  onChange={e => setMsgContent(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex-1"
                  onKeyDown={e => { if (e.key === "Enter" && msgContent.trim()) sendMsgMut.mutate(msgContent.trim()); }}
                />
                <Button
                  onClick={() => { if (msgContent.trim()) sendMsgMut.mutate(msgContent.trim()); }}
                  disabled={!msgContent.trim() || sendMsgMut.isPending}
                  className="bg-[#2FA4A9] hover:bg-[#238b8f]"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-4 mt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs text-gray-400">Portal de proyecto powered by <a href="https://www.im3systems.com" className="text-[#2FA4A9] hover:underline">IM3 Systems</a></p>
        </div>
      </footer>
    </div>
  );
}
