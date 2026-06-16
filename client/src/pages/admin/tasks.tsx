import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  CheckSquare, Square, Plus, Trash2, Calendar, User, AlertTriangle,
  List, LayoutGrid, FolderKanban, Pencil, Loader2, Milestone, Users, Check,
  GanttChart, CalendarDays, ChevronLeft, ChevronRight, Sparkles, X,
} from "lucide-react";

const MEMBER_COLORS = ["#2FA4A9", "#7C3AED", "#DB2777", "#EA580C", "#16A34A", "#2563EB", "#CA8A04", "#475569"];

type BoardTask = {
  id: string;
  source: "crm" | "project";
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  assignee: { id: string; name: string; color: string } | null;
  dueDate: string | null;
  startDate: string | null;
  projectId: string | null;
  projectName: string | null;
  contactId: string | null;
  contactName: string | null;
  phaseId: string | null;
  phaseName: string | null;
  isMilestone: boolean;
};

type TeamMember = { id: string; name: string; email: string | null; color: string; role: string; active: boolean };
type ProjectLite = { id: string; name: string };
type TaskView = "list" | "kanban" | "timeline" | "person" | "calendar";
type Suggestion = {
  id: string; title: string; description: string | null; suggestedPriority: string;
  projectName: string | null; suggestedAssignee: { name: string; color: string } | null; createdAt: string;
};

const STATUS_META: { key: string; label: string; dot: string; col: string }[] = [
  { key: "pending", label: "Pendiente", dot: "bg-gray-400", col: "border-gray-300" },
  { key: "in_progress", label: "En progreso", dot: "bg-blue-500", col: "border-blue-300" },
  { key: "blocked", label: "Bloqueada", dot: "bg-red-500", col: "border-red-300" },
  { key: "completed", label: "Hecha", dot: "bg-emerald-500", col: "border-emerald-300" },
];

const priorityColors: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-gray-50 text-gray-600 border-gray-200",
};
const priorityLabels: Record<string, string> = { high: "Alta", medium: "Media", low: "Baja" };

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === "completed") return false;
  return new Date(dueDate) < new Date();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < -1) return `hace ${Math.abs(diffDays)} días`;
  if (diffDays === -1) return "ayer";
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "mañana";
  if (diffDays < 7) return `en ${diffDays} días`;
  return d.toLocaleDateString("es-CO");
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");
}

function Avatar({ member, size = "sm" }: { member: { name: string; color: string }; size?: "sm" | "xs" }) {
  const dim = size === "xs" ? "w-5 h-5 text-[9px]" : "w-6 h-6 text-[10px]";
  return (
    <span
      className={`${dim} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}
      style={{ backgroundColor: member.color }}
      title={member.name}
    >
      {initials(member.name)}
    </span>
  );
}

type TaskFormState = {
  id?: string;
  source?: "crm" | "project";
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  status: string;
  projectId: string;
  assigneeId: string;
};

const EMPTY_FORM: TaskFormState = { title: "", description: "", dueDate: "", priority: "medium", status: "pending", projectId: "", assigneeId: "" };

export default function TasksPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<TaskView>(
    () => (localStorage.getItem("im3_tasks_view") as TaskView) || "kanban",
  );
  const [filterAssignee, setFilterAssignee] = useState<string>("all"); // all | none | <memberId>
  const [filterProject, setFilterProject] = useState<string>("all"); // all | none | <projectId>
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all"); // all | crm | project

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TaskFormState>(EMPTY_FORM);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);

  const boardParams = new URLSearchParams();
  if (filterAssignee !== "all") boardParams.set("assigneeId", filterAssignee);
  if (filterProject !== "all") boardParams.set("projectId", filterProject);
  if (filterStatus !== "all") boardParams.set("status", filterStatus);
  if (filterSource !== "all") boardParams.set("source", filterSource);

  const { data: board = [], isLoading } = useQuery<BoardTask[]>({
    queryKey: [`/api/admin/tasks/board?${boardParams.toString()}`],
  });
  const { data: members = [] } = useQuery<TeamMember[]>({ queryKey: ["/api/admin/team-members"] });
  const { data: projects = [] } = useQuery<ProjectLite[]>({ queryKey: ["/api/admin/projects"] });
  const { data: suggestions = [] } = useQuery<Suggestion[]>({ queryKey: ["/api/admin/task-suggestions?status=pending"] });

  const invalidate = () => {
    queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/admin/tasks") });
    queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/admin/projects") });
  };

  const setView = (v: TaskView) => { setViewMode(v); localStorage.setItem("im3_tasks_view", v); };

  const saveMutation = useMutation({
    mutationFn: async (f: TaskFormState) => {
      const payload = {
        title: f.title.trim(),
        description: f.description.trim() || null,
        dueDate: f.dueDate || null,
        priority: f.priority,
        status: f.status,
        projectId: f.projectId || null,
        assigneeId: f.assigneeId || null,
      };
      if (f.id) await apiRequest("PATCH", `/api/admin/tasks/${f.id}`, payload);
      else await apiRequest("POST", "/api/admin/tasks", payload);
    },
    onSuccess: () => { invalidate(); setDialogOpen(false); setForm(EMPTY_FORM); },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/admin/tasks/${id}`, { status });
    },
    onSuccess: invalidate,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, assigneeId }: { id: string; assigneeId: string | null }) => {
      await apiRequest("PATCH", `/api/admin/tasks/${id}`, { assigneeId });
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/tasks/${id}`); },
    onSuccess: invalidate,
  });

  const invalidateSug = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/task-suggestions?status=pending"] });

  const acceptSugMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/admin/task-suggestions/${id}/accept`); },
    onSuccess: () => { invalidate(); invalidateSug(); },
  });

  const dismissSugMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/admin/task-suggestions/${id}/dismiss`); },
    onSuccess: invalidateSug,
  });

  const counts = useMemo(() => {
    const pending = board.filter(t => t.status !== "completed").length;
    const overdue = board.filter(t => isOverdue(t.dueDate, t.status)).length;
    return { pending, overdue };
  }, [board]);

  const byStatus = useMemo(() => {
    const map: Record<string, BoardTask[]> = { pending: [], in_progress: [], blocked: [], completed: [] };
    for (const t of board) (map[t.status] ?? (map[t.status] = [])).push(t);
    return map;
  }, [board]);

  function openCreate() { setForm(EMPTY_FORM); setDialogOpen(true); }
  function openEdit(t: BoardTask) {
    setForm({
      id: t.id, source: t.source, title: t.title, description: t.description ?? "",
      dueDate: t.dueDate ? t.dueDate.slice(0, 10) : "", priority: t.priority, status: t.status,
      projectId: t.projectId ?? "", assigneeId: t.assigneeId ?? "",
    });
    setDialogOpen(true);
  }

  function onDropToStatus(status: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOverCol(null);
    const id = e.dataTransfer.getData("text/plain");
    const task = board.find(t => t.id === id);
    if (task && task.status !== status) statusMutation.mutate({ id, status });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tareas</h2>
          <p className="text-sm text-gray-500 mt-1">
            {counts.pending} abiertas
            {counts.overdue > 0 && <span className="text-red-500"> · {counts.overdue} vencidas</span>}
            <span className="text-gray-300"> · </span>
            {board.length} en total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setTeamOpen(true)} className="gap-2">
            <Users className="w-4 h-4" /> Equipo
          </Button>
          <Button onClick={openCreate} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white gap-2">
            <Plus className="w-4 h-4" /> Nueva tarea
          </Button>
        </div>
      </div>

      {/* Sugeridas — bandeja de auto-creación desde GitHub */}
      {suggestions.length > 0 && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-semibold text-purple-900">Sugeridas ({suggestions.length})</h3>
            <span className="text-[11px] text-purple-500">desde el trabajo detectado en GitHub</span>
          </div>
          <div className="space-y-2">
            {suggestions.map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-white border border-purple-100 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {s.projectName && <span className="text-[11px] text-gray-500 flex items-center gap-1"><FolderKanban className="w-3 h-3" />{s.projectName}</span>}
                    {s.suggestedAssignee && (
                      <span className="text-[11px] text-gray-500 flex items-center gap-1"><Avatar member={s.suggestedAssignee} size="xs" /> {s.suggestedAssignee.name}</span>
                    )}
                    <Badge variant="outline" className={`text-[9px] ${priorityColors[s.suggestedPriority] || ""}`}>{priorityLabels[s.suggestedPriority] || s.suggestedPriority}</Badge>
                  </div>
                </div>
                <Button size="sm" onClick={() => acceptSugMutation.mutate(s.id)} disabled={acceptSugMutation.isPending} className="h-7 px-2.5 text-xs gap-1 bg-[#2FA4A9] hover:bg-[#238b8f] text-white">
                  <Check className="w-3.5 h-3.5" /> Aceptar
                </Button>
                <button onClick={() => dismissSugMutation.mutate(s.id)} disabled={dismissSugMutation.isPending} className="text-gray-300 hover:text-red-500 p-1" title="Descartar">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3">
        {/* Person chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterAssignee("all")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${filterAssignee === "all" ? "bg-[#2FA4A9]/10 text-[#2FA4A9] border-[#2FA4A9]/30" : "border-gray-200 text-gray-500 hover:text-gray-800"}`}
          >Todo el equipo</button>
          {members.map(m => (
            <button
              key={m.id}
              onClick={() => setFilterAssignee(m.id)}
              className={`pl-1 pr-2.5 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1.5 transition-colors ${filterAssignee === m.id ? "bg-[#2FA4A9]/10 text-[#2FA4A9] border-[#2FA4A9]/30" : "border-gray-200 text-gray-600 hover:text-gray-900"}`}
            >
              <Avatar member={m} size="xs" /> {m.name}
            </button>
          ))}
          <button
            onClick={() => setFilterAssignee("none")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${filterAssignee === "none" ? "bg-amber-50 text-amber-700 border-amber-200" : "border-gray-200 text-gray-400 hover:text-gray-700"}`}
          >Sin asignar</button>
        </div>

        {/* Selects + view toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-44 h-9 bg-white border-gray-200 text-sm"><SelectValue placeholder="Proyecto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proyectos</SelectItem>
              <SelectItem value="none">Sin proyecto</SelectItem>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 h-9 bg-white border-gray-200 text-sm"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {STATUS_META.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="w-36 h-9 bg-white border-gray-200 text-sm"><SelectValue placeholder="Origen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">CRM + Proyectos</SelectItem>
              <SelectItem value="project">De proyecto</SelectItem>
              <SelectItem value="crm">CRM / ad-hoc</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex bg-gray-100 rounded-lg p-0.5 ml-auto">
            {([
              ["kanban", LayoutGrid, "Kanban"],
              ["list", List, "Lista"],
              ["timeline", GanttChart, "Cronograma"],
              ["person", Users, "Por persona"],
              ["calendar", CalendarDays, "Calendario"],
            ] as const).map(([mode, Icon, label]) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={`p-1.5 rounded-md transition-colors ${viewMode === mode ? "bg-white text-[#2FA4A9] shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                title={label}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-gray-50 rounded-xl animate-pulse" />)}
        </div>
      ) : board.length === 0 ? (
        <div className="text-center text-gray-400 py-16 border border-dashed rounded-xl">
          <CheckSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No hay tareas con estos filtros</p>
          <Button variant="ghost" size="sm" onClick={openCreate} className="mt-2 text-[#2FA4A9]">Crear la primera</Button>
        </div>
      ) : viewMode === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {STATUS_META.map(col => {
            const items = byStatus[col.key] ?? [];
            return (
              <div
                key={col.key}
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
                onDragLeave={() => setDragOverCol(c => c === col.key ? null : c)}
                onDrop={(e) => onDropToStatus(col.key, e)}
                className={`rounded-xl border-2 bg-gray-50/60 p-2.5 min-h-[120px] transition-colors ${dragOverCol === col.key ? `${col.col} bg-[#2FA4A9]/5` : "border-transparent"}`}
              >
                <div className="flex items-center gap-2 px-1 pb-2">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{col.label}</h3>
                  <span className="text-[11px] text-gray-400">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map(t => (
                    <TaskCard key={t.id} task={t} onEdit={() => openEdit(t)} onDelete={() => deleteMutation.mutate(t.id)} navigate={navigate} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === "list" ? (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {board.map(t => {
            const overdue = isOverdue(t.dueDate, t.status);
            const done = t.status === "completed";
            const nextStatus = done ? "pending" : "completed";
            return (
              <div key={t.id} className={`flex items-start gap-3 px-4 py-3 group hover:bg-gray-50 ${done ? "opacity-60" : ""}`}>
                <button
                  onClick={() => statusMutation.mutate({ id: t.id, status: nextStatus })}
                  className="mt-0.5 shrink-0 text-gray-400 hover:text-[#2FA4A9]"
                  title={done ? "Reabrir" : "Completar"}
                >
                  {done ? <CheckSquare className="w-5 h-5 text-[#2FA4A9]" /> : <Square className="w-5 h-5" />}
                </button>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(t)}>
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium truncate ${done ? "line-through text-gray-400" : "text-gray-900"}`}>{t.title}</p>
                    {t.isMilestone && <Milestone className="w-3.5 h-3.5 text-purple-500 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {t.dueDate && (
                      <span className={`text-xs flex items-center gap-1 ${overdue ? "text-red-500" : "text-gray-400"}`}>
                        {overdue && <AlertTriangle className="w-3 h-3" />}<Calendar className="w-3 h-3" />{formatDate(t.dueDate)}
                      </span>
                    )}
                    {t.projectName && (
                      <span className="text-xs text-gray-500 flex items-center gap-1"><FolderKanban className="w-3 h-3" />{t.projectName}{t.phaseName ? ` · ${t.phaseName}` : ""}</span>
                    )}
                    {t.contactName && (
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/contacts/${t.contactId}`); }} className="text-xs text-[#2FA4A9] hover:underline flex items-center gap-1">
                        <User className="w-3 h-3" />{t.contactName}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.assignee && <Avatar member={t.assignee} />}
                  <Badge variant="outline" className={`text-[10px] ${priorityColors[t.priority] || ""}`}>{priorityLabels[t.priority] || t.priority}</Badge>
                  <button onClick={() => openEdit(t)} className="text-gray-300 hover:text-[#2FA4A9] sm:opacity-0 sm:group-hover:opacity-100" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteMutation.mutate(t.id)} className="text-gray-300 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === "timeline" ? (
        <TimelineView tasks={board} onEdit={openEdit} />
      ) : viewMode === "person" ? (
        <PersonView tasks={board} members={members} onEdit={openEdit} onDelete={(id) => deleteMutation.mutate(id)} onReassign={(id, assigneeId) => assignMutation.mutate({ id, assigneeId })} navigate={navigate} />
      ) : (
        <CalendarView tasks={board} onEdit={openEdit} />
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar tarea" : "Nueva tarea"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Título *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="¿Qué hay que hacer?" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descripción</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Responsable</Label>
                <Select value={form.assigneeId || "none"} onValueChange={(v) => setForm({ ...form, assigneeId: v === "none" ? "" : v })}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Proyecto</Label>
                <Select value={form.projectId || "none"} onValueChange={(v) => setForm({ ...form, projectId: v === "none" ? "" : v })} disabled={form.source === "project"}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin proyecto</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Prioridad</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="low">Baja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Estado</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_META.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vence</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="text-sm" />
              </div>
            </div>
            {form.source === "project" && (
              <p className="text-[11px] text-gray-400">Tarea de entrega de un proyecto — el proyecto/fase se gestionan desde el roadmap del proyecto.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => form.title.trim() && saveMutation.mutate(form)} disabled={!form.title.trim() || saveMutation.isPending} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white gap-1.5">
              {saveMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : (form.id ? "Guardar" : "Crear")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TeamDialog open={teamOpen} onClose={() => setTeamOpen(false)} members={members} onChanged={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/team-members"] })} />
    </div>
  );
}

function TeamDialog({ open, onClose, members, onChanged }: { open: boolean; onClose: () => void; members: TeamMember[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(MEMBER_COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function addMember() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiRequest("POST", "/api/admin/team-members", { name: name.trim(), color });
      setName(""); setColor(MEMBER_COLORS[0]); onChanged();
    } finally { setSaving(false); }
  }

  async function patchMember(id: string, updates: Record<string, unknown>) {
    await apiRequest("PATCH", `/api/admin/team-members/${id}`, updates);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Equipo</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-2.5 py-1.5">
              <Avatar member={m} />
              <span className="text-sm text-gray-800 flex-1 truncate">{m.name}</span>
              <div className="flex items-center gap-1">
                {MEMBER_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => patchMember(m.id, { color: c })}
                    className={`w-4 h-4 rounded-full border ${m.color.toLowerCase() === c.toLowerCase() ? "ring-2 ring-offset-1 ring-gray-400" : "border-gray-200"}`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              <button
                onClick={() => patchMember(m.id, { active: !m.active })}
                className={`text-[10px] px-2 py-0.5 rounded-full border ${m.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-400 border-gray-200"}`}
                title={m.active ? "Activo — clic para ocultar" : "Inactivo — clic para activar"}
              >
                {m.active ? "Activo" : "Inactivo"}
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <Label className="text-xs">Agregar miembro</Label>
          <div className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="text-sm" onKeyDown={(e) => { if (e.key === "Enter") addMember(); }} />
            <div className="flex items-center gap-1 shrink-0">
              {MEMBER_COLORS.slice(0, 4).map(c => (
                <button key={c} onClick={() => setColor(c)} className={`w-5 h-5 rounded-full border flex items-center justify-center ${color === c ? "ring-2 ring-offset-1 ring-gray-400" : "border-gray-200"}`} style={{ backgroundColor: c }}>
                  {color === c && <Check className="w-3 h-3 text-white" />}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={addMember} disabled={!name.trim() || saving} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white shrink-0">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskCard({ task, onEdit, onDelete, navigate }: { task: BoardTask; onEdit: () => void; onDelete: () => void; navigate: (to: string) => void }) {
  const overdue = isOverdue(task.dueDate, task.status);
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
      className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm hover:shadow cursor-grab active:cursor-grabbing group"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-gray-900 leading-snug">{task.title}</p>
            {task.isMilestone && <Milestone className="w-3 h-3 text-purple-500 shrink-0" />}
          </div>
          {task.projectName && (
            <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1 truncate">
              <FolderKanban className="w-3 h-3 shrink-0" />{task.projectName}{task.phaseName ? ` · ${task.phaseName}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="text-gray-300 hover:text-[#2FA4A9] sm:opacity-0 sm:group-hover:opacity-100" title="Editar"><Pencil className="w-3 h-3" /></button>
          <button onClick={onDelete} className="text-gray-300 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100" title="Eliminar"><Trash2 className="w-3 h-3" /></button>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <Badge variant="outline" className={`text-[9px] ${priorityColors[task.priority] || ""}`}>{priorityLabels[task.priority] || task.priority}</Badge>
        {task.dueDate && (
          <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? "text-red-500" : "text-gray-400"}`}>
            {overdue && <AlertTriangle className="w-2.5 h-2.5" />}<Calendar className="w-2.5 h-2.5" />{formatDate(task.dueDate)}
          </span>
        )}
        {task.contactName && (
          <button onClick={() => navigate(`/admin/contacts/${task.contactId}`)} className="text-[10px] text-[#2FA4A9] hover:underline flex items-center gap-0.5 truncate max-w-[120px]">
            <User className="w-2.5 h-2.5 shrink-0" />{task.contactName}
          </button>
        )}
        {task.assignee && <span className="ml-auto"><Avatar member={task.assignee} size="xs" /></span>}
      </div>
    </div>
  );
}

// ── Vista Por persona — swimlanes por miembro (drag para reasignar) ──
function PersonView({ tasks, members, onEdit, onDelete, onReassign, navigate }: {
  tasks: BoardTask[]; members: TeamMember[];
  onEdit: (t: BoardTask) => void; onDelete: (id: string) => void;
  onReassign: (id: string, assigneeId: string | null) => void;
  navigate: (to: string) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const memberIds = new Set(members.map(m => m.id));
  const columns: { id: string | null; member: TeamMember | null }[] = [
    ...members.map(m => ({ id: m.id as string | null, member: m })),
    { id: null, member: null },
  ];
  const bucketOf = (t: BoardTask) => (t.assigneeId && memberIds.has(t.assigneeId)) ? t.assigneeId : null;
  const grouped = new Map<string | null, BoardTask[]>();
  for (const c of columns) grouped.set(c.id, []);
  for (const t of tasks) grouped.get(bucketOf(t))!.push(t);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map(col => {
        const key = col.id ?? "none";
        const items = grouped.get(col.id) ?? [];
        return (
          <div
            key={key}
            onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
            onDragLeave={() => setDragOver(d => d === key ? null : d)}
            onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/plain"); const t = tasks.find(x => x.id === id); if (t && bucketOf(t) !== col.id) onReassign(id, col.id); }}
            className={`shrink-0 w-72 rounded-xl border-2 bg-gray-50/60 p-2.5 transition-colors ${dragOver === key ? "border-[#2FA4A9]/40 bg-[#2FA4A9]/5" : "border-transparent"}`}
          >
            <div className="flex items-center gap-2 px-1 pb-2">
              {col.member ? <Avatar member={col.member} size="xs" /> : <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center"><User className="w-3 h-3 text-gray-400" /></span>}
              <h3 className="text-xs font-semibold text-gray-700 truncate">{col.member?.name ?? "Sin asignar"}</h3>
              <span className="text-[11px] text-gray-400 ml-auto">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map(t => <TaskCard key={t.id} task={t} onEdit={() => onEdit(t)} onDelete={() => onDelete(t.id)} navigate={navigate} />)}
              {items.length === 0 && <p className="text-[11px] text-gray-300 px-1 py-2">Sin tareas</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Vista Cronograma — barras tipo Gantt (12 semanas desde la semana actual) ──
function TimelineView({ tasks, onEdit }: { tasks: BoardTask[]; onEdit: (t: BoardTask) => void }) {
  const DAY = 86400000, WEEKS = 12;
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const dow = (start.getDay() + 6) % 7; // lunes = 0
  start.setDate(start.getDate() - dow);
  const startMs = start.getTime();
  const spanMs = WEEKS * 7 * DAY;
  const endMs = startMs + spanMs;
  const weeks = Array.from({ length: WEEKS }, (_, i) => new Date(startMs + i * 7 * DAY));
  const clamp = (n: number) => Math.min(Math.max(n, 0), 100);
  const todayPct = clamp(((now.getTime() - startMs) / spanMs) * 100);

  const inRange: BoardTask[] = [];
  const offRange: BoardTask[] = [];
  for (const t of tasks) {
    if (!t.dueDate) { offRange.push(t); continue; }
    const due = +new Date(t.dueDate);
    const st = t.startDate ? +new Date(t.startDate) : due;
    if (Math.max(due, st) < startMs || Math.min(due, st) > endMs) offRange.push(t);
    else inRange.push(t);
  }
  const groups = new Map<string, BoardTask[]>();
  for (const t of inRange) {
    const k = t.projectName ?? "Sin proyecto";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  const statusColor: Record<string, string> = { pending: "bg-gray-400", in_progress: "bg-blue-500", blocked: "bg-red-500", completed: "bg-emerald-500" };
  const barOf = (t: BoardTask) => {
    const due = +new Date(t.dueDate!);
    let s = t.startDate ? +new Date(t.startDate) : due;
    let e = due;
    if (s > e) { const tmp = s; s = e; e = tmp; }
    const left = clamp(((s - startMs) / spanMs) * 100);
    const right = clamp(((e - startMs) / spanMs) * 100);
    return { left, width: Math.max(right - left, 1.5) };
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 overflow-x-auto">
      <div className="min-w-[760px] space-y-4">
        {/* Encabezado de semanas */}
        <div className="flex items-end">
          <div className="w-44 shrink-0" />
          <div className="relative flex-1 h-4">
            {weeks.map((w, i) => (
              <span key={i} className="absolute top-0 text-[10px] text-gray-400" style={{ left: `${(i / WEEKS) * 100}%` }}>
                {w.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
              </span>
            ))}
          </div>
        </div>

        {[...groups.entries()].map(([project, items]) => (
          <div key={project}>
            <div className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1"><FolderKanban className="w-3.5 h-3.5 text-[#2FA4A9]" /> {project}</div>
            <div className="space-y-1">
              {items.map(t => {
                const b = barOf(t);
                return (
                  <div key={t.id} className="flex items-center gap-2">
                    <button onClick={() => onEdit(t)} className="w-44 shrink-0 text-left text-xs text-gray-700 truncate hover:text-[#2FA4A9]" title={t.title}>{t.title}</button>
                    <div className="flex-1 relative h-5 bg-gray-50 rounded">
                      <div className="absolute top-0 bottom-0 w-px bg-red-400/70" style={{ left: `${todayPct}%` }} />
                      <button
                        onClick={() => onEdit(t)}
                        className={`absolute top-0.5 h-4 rounded ${statusColor[t.status] || "bg-gray-400"} opacity-90 hover:opacity-100`}
                        style={{ left: `${b.left}%`, width: `${b.width}%` }}
                        title={`${t.title}${t.assignee ? ` · ${t.assignee.name}` : ""}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {offRange.length > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-[11px] text-gray-400 mb-1">Sin fecha o fuera de las próximas {WEEKS} semanas ({offRange.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {offRange.map(t => (
                <button key={t.id} onClick={() => onEdit(t)} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-gray-600 hover:border-[#2FA4A9]/40 truncate max-w-[180px]">{t.title}</button>
              ))}
            </div>
          </div>
        )}

        {inRange.length === 0 && offRange.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No hay tareas para el cronograma</p>
        )}
      </div>
    </div>
  );
}

// ── Vista Calendario — grilla mensual por fecha de vencimiento ──
const CAL_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CAL_STATUS_DOT: Record<string, string> = { pending: "bg-gray-400", in_progress: "bg-blue-500", blocked: "bg-red-500", completed: "bg-emerald-500" };

function CalendarView({ tasks, onEdit }: { tasks: BoardTask[]; onEdit: (t: BoardTask) => void }) {
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });

  const byDay = new Map<string, BoardTask[]>();
  let noDate = 0;
  for (const t of tasks) {
    if (!t.dueDate) { noDate++; continue; }
    const key = t.dueDate.slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(t);
  }

  const year = month.getFullYear(), mon = month.getMonth();
  const firstDow = (new Date(year, mon, 1).getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const todayKey = new Date().toISOString().slice(0, 10);

  const shift = (delta: number) => setMonth(new Date(year, mon + delta, 1));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
        <h3 className="text-sm font-semibold text-gray-800 capitalize">{month.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}</h3>
        <button onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {CAL_DAYS.map(d => <div key={d} className="text-[10px] font-semibold text-gray-400 uppercase text-center pb-1">{d}</div>)}
        {Array.from({ length: totalCells }, (_, i) => {
          const dayNum = i - firstDow + 1;
          if (dayNum < 1 || dayNum > daysInMonth) return <div key={i} className="min-h-[72px] rounded-lg bg-gray-50/40" />;
          const key = `${year}-${String(mon + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
          const items = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div key={i} className={`min-h-[72px] rounded-lg border p-1 ${isToday ? "border-[#2FA4A9]/50 bg-[#2FA4A9]/5" : "border-gray-100"}`}>
              <div className={`text-[10px] font-medium mb-0.5 ${isToday ? "text-[#2FA4A9]" : "text-gray-400"}`}>{dayNum}</div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map(t => (
                  <button key={t.id} onClick={() => onEdit(t)} className="w-full text-left flex items-center gap-1 text-[10px] text-gray-700 hover:text-[#2FA4A9] truncate">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CAL_STATUS_DOT[t.status] || "bg-gray-400"}`} />
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
                {items.length > 3 && <div className="text-[9px] text-gray-400 pl-2.5">+{items.length - 3} más</div>}
              </div>
            </div>
          );
        })}
      </div>
      {noDate > 0 && <p className="text-[11px] text-gray-400 mt-2">{noDate} tarea{noDate !== 1 ? "s" : ""} sin fecha de vencimiento (no se muestran aquí)</p>}
    </div>
  );
}
