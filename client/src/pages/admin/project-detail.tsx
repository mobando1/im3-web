import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Copy, ExternalLink, Plus, Trash2, Send, Clock, CheckCircle2, Circle, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type ProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  contactId: string | null;
  contactName: string | null;
  startDate: string | null;
  estimatedEndDate: string | null;
  totalBudget: number | null;
  currency: string;
  accessToken: string;
  progress: number;
  totalHours: number;
  phases: Array<{
    id: string;
    name: string;
    description: string | null;
    orderIndex: number;
    status: string;
    estimatedHours: number | null;
    tasks: Array<{
      id: string;
      title: string;
      description: string | null;
      status: string;
      priority: string;
      estimatedHours: number | null;
      actualHours: string | null;
    }>;
  }>;
  deliverables: Array<{
    id: string;
    title: string;
    description: string | null;
    type: string;
    status: string;
    deliveredAt: string | null;
    approvedAt: string | null;
    clientComment: string | null;
    demoUrl: string | null;
  }>;
  timeLogs: Array<{
    id: string;
    description: string;
    hours: string;
    date: string;
    category: string;
    taskId: string | null;
  }>;
  messages: Array<{
    id: string;
    senderType: string;
    senderName: string;
    content: string;
    isRead: boolean;
    createdAt: string;
  }>;
};

const TASK_STATUS_ICONS: Record<string, typeof Circle> = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
  blocked: AlertCircle,
};

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: "text-gray-400",
  in_progress: "text-blue-500",
  completed: "text-emerald-500",
  blocked: "text-red-500",
};

const DELIVERABLE_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  delivered: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

const CATEGORY_LABELS: Record<string, string> = {
  development: "Desarrollo",
  design: "Diseño",
  meeting: "Reunión",
  support: "Soporte",
  planning: "Planeación",
};

const tabs = ["Roadmap", "Entregas", "Horas", "Mensajes", "Config"];

export default function AdminProjectDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("Roadmap");
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  const { data: project, isLoading } = useQuery<ProjectDetail>({
    queryKey: [`/api/admin/projects/${params.id}`],
  });

  // Phase creation
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [phaseForm, setPhaseForm] = useState({ name: "", description: "", estimatedHours: "", startDate: "", endDate: "" });

  // Task creation
  const [addingTaskPhase, setAddingTaskPhase] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({ title: "", priority: "medium", dueDate: "", isMilestone: false });

  // Deliverable creation
  const [showAddDeliverable, setShowAddDeliverable] = useState(false);
  const [delivForm, setDelivForm] = useState({ title: "", description: "", type: "feature", phaseId: "" });

  // Time log creation
  const [showAddTime, setShowAddTime] = useState(false);
  const [timeForm, setTimeForm] = useState({ description: "", hours: "", date: new Date().toISOString().split("T")[0], category: "development" });

  // Messages
  const [msgContent, setMsgContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Edit project
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (project) {
      setEditForm({
        name: project.name,
        description: project.description || "",
        status: project.status,
        totalBudget: project.totalBudget?.toString() || "",
        currency: project.currency,
        healthStatus: (project as any).healthStatus || "on_track",
        healthNote: (project as any).healthNote || "",
        githubRepoUrl: (project as any).githubRepoUrl || "",
      });
      // Auto-expand all phases
      setExpandedPhases(new Set(project.phases.map(p => p.id)));
    }
  }, [project]);

  useEffect(() => {
    if (activeTab === "Mensajes") messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeTab, project?.messages]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${params.id}`] });

  // Mutations
  const addPhaseMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("POST", `/api/admin/projects/${params.id}/phases`, data); },
    onSuccess: () => { invalidate(); setShowAddPhase(false); setPhaseForm({ name: "", description: "", estimatedHours: "", startDate: "", endDate: "" }); },
  });

  const addTaskMut = useMutation({
    mutationFn: async ({ phaseId, data }: { phaseId: string; data: Record<string, unknown> }) => { await apiRequest("POST", `/api/admin/phases/${phaseId}/tasks`, data); },
    onSuccess: () => { invalidate(); setAddingTaskPhase(null); setTaskForm({ title: "", priority: "medium", dueDate: "", isMilestone: false }); },
  });

  const updateTaskMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => { await apiRequest("PATCH", `/api/admin/tasks/${id}`, data); },
    onSuccess: invalidate,
  });

  const deleteTaskMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/tasks/${id}`); },
    onSuccess: invalidate,
  });

  const updatePhaseMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => { await apiRequest("PATCH", `/api/admin/phases/${id}`, data); },
    onSuccess: invalidate,
  });

  const deletePhaseMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/phases/${id}`); },
    onSuccess: invalidate,
  });

  const addDelivMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("POST", `/api/admin/projects/${params.id}/deliverables`, data); },
    onSuccess: () => { invalidate(); setShowAddDeliverable(false); setDelivForm({ title: "", description: "", type: "feature", phaseId: "" }); },
  });

  const deleteDelivMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/deliverables/${id}`); },
    onSuccess: invalidate,
  });

  const addTimeMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("POST", `/api/admin/projects/${params.id}/timelog`, data); },
    onSuccess: () => { invalidate(); setShowAddTime(false); setTimeForm({ description: "", hours: "", date: new Date().toISOString().split("T")[0], category: "development" }); },
  });

  const deleteTimeMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/timelog/${id}`); },
    onSuccess: invalidate,
  });

  const sendMsgMut = useMutation({
    mutationFn: async (content: string) => { await apiRequest("POST", `/api/admin/projects/${params.id}/messages`, { content, senderName: "Equipo IM3" }); },
    onSuccess: () => { invalidate(); setMsgContent(""); },
  });

  const updateProjectMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("PATCH", `/api/admin/projects/${params.id}`, data); },
    onSuccess: () => { invalidate(); toast({ title: "Proyecto actualizado" }); },
  });

  const regenTokenMut = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/admin/projects/${params.id}/regenerate-token`); },
    onSuccess: () => { invalidate(); toast({ title: "Token regenerado" }); },
  });

  const deleteProjectMut = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/admin/projects/${params.id}`); },
    onSuccess: () => { navigate("/admin/projects"); toast({ title: "Proyecto eliminado" }); queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] }); },
    onError: (err: any) => { toast({ title: "Error eliminando proyecto", description: err?.message || "Intenta de nuevo", variant: "destructive" }); },
  });

  if (isLoading || !project) {
    return <div className="text-center py-20 text-gray-400">Cargando proyecto...</div>;
  }

  const togglePhase = (id: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const cycleTaskStatus = (task: { id: string; status: string }) => {
    const order = ["pending", "in_progress", "completed"];
    const next = order[(order.indexOf(task.status) + 1) % order.length];
    updateTaskMut.mutate({ id: task.id, data: { status: next } });
  };

  const copyPortalLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/portal/${project.accessToken}`);
    toast({ title: "Link copiado" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate("/admin/projects")} className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          {project.contactName && <p className="text-sm text-gray-500 mt-0.5">{project.contactName}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyPortalLink} className="p-2 rounded-lg text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors" title="Copiar link portal">
            <Copy className="w-4 h-4" />
          </button>
          <a href={`/portal/${project.accessToken}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors" title="Abrir portal">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Progreso", value: `${project.progress}%` },
          { label: "Horas", value: project.totalHours.toFixed(1) },
          { label: "Entregas", value: `${project.deliverables.filter(d => d.status === "approved").length}/${project.deliverables.length}` },
          { label: "Mensajes", value: project.messages.length.toString() },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t
                ? "border-[#2FA4A9] text-[#2FA4A9]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {/* ── ROADMAP ── */}
        {activeTab === "Roadmap" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowAddPhase(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Fase
              </Button>
            </div>

            {project.phases.length === 0 ? (
              <p className="text-center text-gray-400 py-12">No hay fases. Crea la primera fase del roadmap.</p>
            ) : (
              <div className="space-y-3">
                {project.phases.map((phase, idx) => {
                  const isExpanded = expandedPhases.has(phase.id);
                  const completed = phase.tasks.filter(t => t.status === "completed").length;
                  const phaseProgress = phase.tasks.length > 0 ? Math.round((completed / phase.tasks.length) * 100) : 0;

                  return (
                    <div key={phase.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      {/* Phase header */}
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
                          {(phase.startDate || phase.endDate) && (
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {phase.startDate ? new Date(phase.startDate).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "?"} — {phase.endDate ? new Date(phase.endDate).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "?"}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#2FA4A9] rounded-full" style={{ width: `${phaseProgress}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 w-8 text-right">{phaseProgress}%</span>
                          <Select
                            value={phase.status}
                            onValueChange={v => { updatePhaseMut.mutate({ id: phase.id, data: { status: v } }); }}
                          >
                            <SelectTrigger className="h-7 w-28 text-xs" onClick={e => e.stopPropagation()}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pendiente</SelectItem>
                              <SelectItem value="in_progress">En progreso</SelectItem>
                              <SelectItem value="completed">Completada</SelectItem>
                            </SelectContent>
                          </Select>
                          <button
                            onClick={e => { e.stopPropagation(); deletePhaseMut.mutate(phase.id); }}
                            className="p-1 rounded text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Tasks */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-5 py-3 space-y-1">
                          {phase.tasks.map(task => {
                            const Icon = TASK_STATUS_ICONS[task.status] || Circle;
                            return (
                              <div key={task.id} className={`flex items-center gap-3 py-1.5 group ${task.isMilestone ? "bg-amber-50/50 -mx-2 px-2 rounded-lg" : ""}`}>
                                <button onClick={() => cycleTaskStatus(task)} className="shrink-0">
                                  <Icon className={`w-4 h-4 ${TASK_STATUS_COLORS[task.status]}`} />
                                </button>
                                {task.isMilestone && <span className="text-amber-500 text-sm">🏁</span>}
                                <span className={`text-sm flex-1 ${task.status === "completed" ? "line-through text-gray-400" : "text-gray-700"} ${task.isMilestone ? "font-semibold" : ""}`}>
                                  {task.title}
                                </span>
                                {task.dueDate && (
                                  <span className="text-[10px] text-gray-400">
                                    {new Date(task.dueDate).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                                  </span>
                                )}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  task.priority === "high" ? "bg-red-50 text-red-600" :
                                  task.priority === "medium" ? "bg-amber-50 text-amber-600" :
                                  "bg-gray-50 text-gray-400"
                                }`}>{task.priority}</span>
                                <button
                                  onClick={() => deleteTaskMut.mutate(task.id)}
                                  className="p-1 rounded text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}

                          {addingTaskPhase === phase.id ? (
                            <div className="space-y-2 pt-2">
                              <div className="flex items-center gap-2">
                                <Input
                                  value={taskForm.title}
                                  onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                                  placeholder="Nueva tarea..."
                                  className="h-8 text-sm"
                                  autoFocus
                                  onKeyDown={e => { if (e.key === "Enter" && taskForm.title) addTaskMut.mutate({ phaseId: phase.id, data: { ...taskForm, dueDate: taskForm.dueDate || null } }); if (e.key === "Escape") setAddingTaskPhase(null); }}
                                />
                                <Select value={taskForm.priority} onValueChange={v => setTaskForm(f => ({ ...f, priority: v }))}>
                                  <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button size="sm" className="h-8" onClick={() => { if (taskForm.title) addTaskMut.mutate({ phaseId: phase.id, data: { ...taskForm, dueDate: taskForm.dueDate || null } }); }}>
                                  <Plus className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                              <div className="flex items-center gap-3">
                                <Input
                                  type="date"
                                  value={taskForm.dueDate}
                                  onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))}
                                  className="h-7 text-xs w-36"
                                  placeholder="Fecha límite"
                                />
                                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={taskForm.isMilestone}
                                    onChange={e => setTaskForm(f => ({ ...f, isMilestone: e.target.checked }))}
                                    className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                                  />
                                  🏁 Milestone
                                </label>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAddingTaskPhase(phase.id)}
                              className="text-xs text-gray-400 hover:text-[#2FA4A9] mt-1 flex items-center gap-1 transition-colors"
                            >
                              <Plus className="w-3 h-3" /> Agregar tarea
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add phase dialog */}
            <Dialog open={showAddPhase} onOpenChange={setShowAddPhase}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader><DialogTitle>Nueva fase</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label>Nombre</Label>
                    <Input value={phaseForm.name} onChange={e => setPhaseForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Diseño UX/UI" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Descripción</Label>
                    <Input value={phaseForm.description} onChange={e => setPhaseForm(f => ({ ...f, description: e.target.value }))} placeholder="Opcional" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Fecha inicio</Label>
                      <Input type="date" value={phaseForm.startDate} onChange={e => setPhaseForm(f => ({ ...f, startDate: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Fecha fin</Label>
                      <Input type="date" value={phaseForm.endDate} onChange={e => setPhaseForm(f => ({ ...f, endDate: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Horas estimadas</Label>
                    <Input type="number" value={phaseForm.estimatedHours} onChange={e => setPhaseForm(f => ({ ...f, estimatedHours: e.target.value }))} placeholder="40" />
                  </div>
                  <Button
                    className="w-full bg-[#2FA4A9] hover:bg-[#238b8f]"
                    disabled={!phaseForm.name}
                    onClick={() => addPhaseMut.mutate({ name: phaseForm.name, description: phaseForm.description || null, estimatedHours: phaseForm.estimatedHours ? parseInt(phaseForm.estimatedHours) : null, startDate: phaseForm.startDate || null, endDate: phaseForm.endDate || null, orderIndex: project.phases.length })}
                  >
                    Crear fase
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* ── ENTREGAS ── */}
        {activeTab === "Entregas" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowAddDeliverable(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Entrega
              </Button>
            </div>

            {project.deliverables.length === 0 ? (
              <p className="text-center text-gray-400 py-12">No hay entregas registradas.</p>
            ) : (
              <div className="space-y-3">
                {project.deliverables.map(d => (
                  <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-5 group">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{d.title}</h3>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${DELIVERABLE_COLORS[d.status]}`}>{d.status}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">{d.type}</span>
                        </div>
                        {d.description && <p className="text-sm text-gray-500 mt-1">{d.description}</p>}
                        {d.clientComment && (
                          <p className="text-sm text-amber-600 mt-2 bg-amber-50 px-3 py-1.5 rounded-lg">
                            Comentario del cliente: {d.clientComment}
                          </p>
                        )}
                        {d.demoUrl && (
                          <a href={d.demoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#2FA4A9] hover:underline mt-1 inline-block">
                            Ver demo
                          </a>
                        )}
                      </div>
                      <button onClick={() => deleteDelivMut.mutate(d.id)} className="p-1 rounded text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Dialog open={showAddDeliverable} onOpenChange={setShowAddDeliverable}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader><DialogTitle>Registrar entrega</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label>Título</Label>
                    <Input value={delivForm.title} onChange={e => setDelivForm(f => ({ ...f, title: e.target.value }))} placeholder="Ej: Dashboard de métricas" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Descripción</Label>
                    <Textarea value={delivForm.description} onChange={e => setDelivForm(f => ({ ...f, description: e.target.value }))} rows={2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Select value={delivForm.type} onValueChange={v => setDelivForm(f => ({ ...f, type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["feature", "bugfix", "design", "document", "video", "other"].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full bg-[#2FA4A9] hover:bg-[#238b8f]"
                    disabled={!delivForm.title}
                    onClick={() => addDelivMut.mutate({ title: delivForm.title, description: delivForm.description || null, type: delivForm.type, status: "delivered", deliveredAt: new Date().toISOString(), phaseId: delivForm.phaseId || null })}
                  >
                    Registrar entrega
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* ── HORAS ── */}
        {activeTab === "Horas" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Total: <span className="font-semibold text-gray-900">{project.totalHours.toFixed(1)}h</span></p>
              <Button size="sm" variant="outline" onClick={() => setShowAddTime(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Registrar horas
              </Button>
            </div>

            {/* Category summary */}
            {project.timeLogs.length > 0 && (
              <div className="grid grid-cols-5 gap-3">
                {Object.entries(
                  project.timeLogs.reduce((acc, l) => {
                    acc[l.category] = (acc[l.category] || 0) + parseFloat(l.hours);
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([cat, hrs]) => (
                  <div key={cat} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                    <p className="text-xs text-gray-400">{CATEGORY_LABELS[cat] || cat}</p>
                    <p className="text-lg font-bold text-gray-900">{hrs.toFixed(1)}h</p>
                  </div>
                ))}
              </div>
            )}

            {project.timeLogs.length === 0 ? (
              <p className="text-center text-gray-400 py-12">No hay horas registradas.</p>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      <th className="px-5 py-3">Fecha</th>
                      <th className="px-5 py-3">Descripción</th>
                      <th className="px-5 py-3">Categoría</th>
                      <th className="px-5 py-3 text-right">Horas</th>
                      <th className="px-5 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {project.timeLogs.map(l => (
                      <tr key={l.id} className="group hover:bg-gray-50">
                        <td className="px-5 py-3 text-sm text-gray-600">{l.date}</td>
                        <td className="px-5 py-3 text-sm text-gray-900">{l.description}</td>
                        <td className="px-5 py-3 text-xs text-gray-500">{CATEGORY_LABELS[l.category] || l.category}</td>
                        <td className="px-5 py-3 text-sm font-medium text-gray-900 text-right">{parseFloat(l.hours).toFixed(1)}h</td>
                        <td className="px-5 py-3">
                          <button onClick={() => deleteTimeMut.mutate(l.id)} className="p-1 rounded text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Dialog open={showAddTime} onOpenChange={setShowAddTime}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader><DialogTitle>Registrar horas</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label>Descripción</Label>
                    <Input value={timeForm.description} onChange={e => setTimeForm(f => ({ ...f, description: e.target.value }))} placeholder="Qué se hizo" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Horas</Label>
                      <Input type="number" step="0.5" value={timeForm.hours} onChange={e => setTimeForm(f => ({ ...f, hours: e.target.value }))} placeholder="2.5" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Fecha</Label>
                      <Input type="date" value={timeForm.date} onChange={e => setTimeForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Categoría</Label>
                    <Select value={timeForm.category} onValueChange={v => setTimeForm(f => ({ ...f, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full bg-[#2FA4A9] hover:bg-[#238b8f]"
                    disabled={!timeForm.description || !timeForm.hours}
                    onClick={() => addTimeMut.mutate({ description: timeForm.description, hours: timeForm.hours, date: timeForm.date, category: timeForm.category })}
                  >
                    Registrar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* ── MENSAJES ── */}
        {activeTab === "Mensajes" && (
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ height: "500px" }}>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {project.messages.length === 0 ? (
                <p className="text-center text-gray-400 py-12">No hay mensajes. Envía el primero.</p>
              ) : (
                project.messages.map(m => (
                  <div key={m.id} className={`flex ${m.senderType === "team" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                      m.senderType === "team"
                        ? "bg-[#2FA4A9] text-white rounded-br-md"
                        : "bg-gray-100 text-gray-900 rounded-bl-md"
                    }`}>
                      <p className={`text-[10px] font-medium mb-0.5 ${m.senderType === "team" ? "text-white/70" : "text-gray-400"}`}>{m.senderName}</p>
                      <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                      <p className={`text-[10px] mt-1 ${m.senderType === "team" ? "text-white/50" : "text-gray-300"}`}>
                        {new Date(m.createdAt).toLocaleString("es-CO", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t border-gray-100 p-4 flex gap-2">
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
        )}

        {/* ── CONFIG ── */}
        {activeTab === "Config" && (
          <div className="max-w-lg space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Configuración del proyecto</h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nombre</Label>
                  <Input value={editForm.name || ""} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Descripción</Label>
                  <Textarea value={editForm.description || ""} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Estado</Label>
                    <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planning">Planeación</SelectItem>
                        <SelectItem value="in_progress">En progreso</SelectItem>
                        <SelectItem value="paused">Pausado</SelectItem>
                        <SelectItem value="completed">Completado</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Presupuesto</Label>
                    <Input type="number" value={editForm.totalBudget || ""} onChange={e => setEditForm(f => ({ ...f, totalBudget: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Moneda</Label>
                    <Select value={editForm.currency || "USD"} onValueChange={v => setEditForm(f => ({ ...f, currency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="COP">COP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => updateProjectMut.mutate({
                  name: editForm.name,
                  description: editForm.description || null,
                  status: editForm.status,
                  totalBudget: editForm.totalBudget ? parseInt(editForm.totalBudget) : null,
                  currency: editForm.currency,
                })}
                className="bg-[#2FA4A9] hover:bg-[#238b8f]"
              >
                Guardar cambios
              </Button>
            </div>

            {/* Health status */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              <h3 className="font-semibold text-gray-900">Estado de salud del proyecto</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={editForm.healthStatus || "on_track"} onValueChange={v => setEditForm(f => ({ ...f, healthStatus: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on_track">En línea</SelectItem>
                      <SelectItem value="ahead">Adelantado</SelectItem>
                      <SelectItem value="at_risk">En riesgo</SelectItem>
                      <SelectItem value="behind">Atrasado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Nota para el cliente</Label>
                  <Input value={editForm.healthNote || ""} onChange={e => setEditForm(f => ({ ...f, healthNote: e.target.value }))} placeholder="Tu proyecto avanza bien..." />
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => {
                apiRequest("PATCH", `/api/admin/projects/${params.id}/health`, { healthStatus: editForm.healthStatus, healthNote: editForm.healthNote });
                toast({ title: "Estado de salud actualizado" });
                invalidate();
              }}>
                Actualizar estado
              </Button>
            </div>

            {/* GitHub integration */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              <h3 className="font-semibold text-gray-900">GitHub — Auto-tracking con AI</h3>
              <p className="text-xs text-gray-500">Conecta un repositorio para que el portal se actualice automáticamente con cada push.</p>
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label>URL del repositorio</Label>
                  <Input value={editForm.githubRepoUrl || ""} onChange={e => setEditForm(f => ({ ...f, githubRepoUrl: e.target.value }))} placeholder="https://github.com/owner/repo" />
                </div>
                <div className="space-y-1.5">
                  <Label>Webhook URL (configurar en GitHub)</Label>
                  <Input readOnly value={`${window.location.origin}/api/webhooks/github/${params.id}`} className="text-xs font-mono bg-gray-50" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={() => {
                  updateProjectMut.mutate({ githubRepoUrl: editForm.githubRepoUrl || null, aiTrackingEnabled: true });
                }}>
                  Guardar y activar AI tracking
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  apiRequest("POST", `/api/admin/projects/${params.id}/analyze`).then(() => {
                    toast({ title: "Análisis iniciado" });
                    invalidate();
                  }).catch(() => toast({ title: "Error al analizar", variant: "destructive" }));
                }}>
                  Analizar commits ahora
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  apiRequest("POST", `/api/admin/projects/${params.id}/weekly-summary`).then(() => {
                    toast({ title: "Resumen semanal generado" });
                    invalidate();
                  }).catch(() => toast({ title: "Error al generar resumen", variant: "destructive" }));
                }}>
                  Generar resumen semanal
                </Button>
              </div>
            </div>

            {/* Portal link */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              <h3 className="font-semibold text-gray-900">Link del portal</h3>
              <div className="flex items-center gap-2">
                <Input readOnly value={`${window.location.origin}/portal/${project.accessToken}`} className="text-xs font-mono bg-gray-50" />
                <Button variant="outline" size="sm" onClick={copyPortalLink}><Copy className="w-4 h-4" /></Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => regenTokenMut.mutate()} className="text-amber-600 border-amber-200 hover:bg-amber-50">
                Regenerar token
              </Button>
            </div>

            {/* Danger zone */}
            <div className="bg-red-50 rounded-xl border border-red-200 p-6 space-y-3">
              <h3 className="font-semibold text-red-700">Zona de peligro</h3>
              <p className="text-sm text-red-600">Eliminar este proyecto borrará todas las fases, tareas, entregas, horas y mensajes asociados.</p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { if (confirm("¿Eliminar este proyecto permanentemente?")) deleteProjectMut.mutate(); }}
              >
                Eliminar proyecto
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
