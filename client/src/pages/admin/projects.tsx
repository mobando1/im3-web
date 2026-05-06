import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Plus, FolderKanban, ExternalLink, Copy, Sparkles, Trash2, List, LayoutGrid, GanttChart, Wrench, Building2, Users as UsersIcon, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  projectType?: "client" | "internal";
  contactId: string | null;
  contactName: string | null;
  startDate: string | null;
  estimatedEndDate: string | null;
  totalBudget: number | null;
  currency: string;
  accessToken: string;
  progress: number;
  taskCount: number;
  completedTaskCount: number;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  planning: "Planeación",
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

export default function AdminProjects() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "kanban" | "timeline">(() => (localStorage.getItem("im3_projects_view") as any) || "list");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    name: "",
    brief: "",
    projectType: "client" as "client" | "internal",
    contactId: "",
    githubRepoUrl: "",
    totalBudget: "",
    currency: "USD",
    useAI: true,
  });

  const resetForm = () => setForm({
    name: "", brief: "", projectType: "client", contactId: "",
    githubRepoUrl: "", totalBudget: "", currency: "USD", useAI: true,
  });

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/admin/projects"],
  });

  const { data: contactsList = [] } = useQuery<Array<{ id: string; nombre: string; empresa: string }>>({
    queryKey: ["/api/admin/contacts"],
    select: (data: any) => (Array.isArray(data) ? data : data?.contacts || []),
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/admin/projects", data);
      return res.json();
    },
    onSuccess: (project: { id?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      setShowCreate(false);
      resetForm();
      toast({ title: "Proyecto creado" });
      if (project?.id) navigate(`/admin/projects/${project.id}`);
    },
  });

  const createFromBriefMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/admin/projects/from-brief", data);
      return res.json();
    },
    onSuccess: (data: { projectId?: string; phasesCreated?: number; tasksCreated?: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      setShowCreate(false);
      resetForm();
      toast({
        title: "Proyecto generado con IA",
        description: `${data.phasesCreated ?? 0} fases · ${data.tasksCreated ?? 0} tareas`,
      });
      if (data.projectId) navigate(`/admin/projects/${data.projectId}`);
    },
    onError: (err: any) => {
      toast({ title: "Error generando proyecto", description: err?.message, variant: "destructive" });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      toast({ title: "Proyecto eliminado" });
    },
    onError: (err: any) => {
      toast({ title: "Error eliminando proyecto", description: err?.message, variant: "destructive" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/projects/seed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      toast({ title: data.message || "Proyecto demo creado" });
    },
    onError: () => {
      toast({ title: "Error creando proyecto demo", variant: "destructive" });
    },
  });

  const filtered = filterStatus === "all" ? projects : projects.filter(p => p.status === filterStatus);

  const groupedProjects = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of filtered) {
      const key = p.projectType === "internal" ? "__internal__" : (p.contactName || "__no_client__");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    const groups: Array<{ key: string; label: string; icon: typeof Wrench; items: Project[] }> = [];
    if (map.has("__internal__")) groups.push({ key: "__internal__", label: "IM3 Interno", icon: Wrench, items: map.get("__internal__")! });
    Array.from(map.keys())
      .filter(k => k !== "__internal__" && k !== "__no_client__")
      .sort((a, b) => a.localeCompare(b, "es"))
      .forEach(k => groups.push({ key: k, label: k, icon: Building2, items: map.get(k)! }));
    if (map.has("__no_client__")) groups.push({ key: "__no_client__", label: "Sin cliente", icon: UsersIcon, items: map.get("__no_client__")! });
    return groups;
  }, [filtered]);

  const handleCreate = () => {
    const baseContactId = form.projectType === "client" ? (form.contactId || null) : null;

    if (form.useAI) {
      if (form.brief.trim().length < 20) {
        toast({ title: "Brief demasiado corto", description: "Escribe al menos 20 caracteres describiendo el proyecto.", variant: "destructive" });
        return;
      }
      if (form.projectType === "client" && !baseContactId) {
        toast({ title: "Falta cliente", description: "Selecciona un contacto o cambia a tipo Interno.", variant: "destructive" });
        return;
      }
      createFromBriefMutation.mutate({
        name: form.name,
        brief: form.brief,
        projectType: form.projectType,
        contactId: baseContactId,
        githubRepoUrl: form.githubRepoUrl.trim() || null,
        totalBudget: form.totalBudget ? parseInt(form.totalBudget) : null,
        currency: form.currency,
      });
      return;
    }

    createMutation.mutate({
      name: form.name,
      description: form.brief || null,
      projectType: form.projectType,
      contactId: baseContactId,
      githubRepoUrl: form.githubRepoUrl.trim() || null,
      status: "planning",
      totalBudget: form.totalBudget ? parseInt(form.totalBudget) : null,
      currency: form.currency,
    });
  };

  const isCreating = createMutation.isPending || createFromBriefMutation.isPending;

  const copyPortalLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/portal/${token}`);
    toast({ title: "Link copiado al portapapeles" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proyectos</h1>
          <p className="text-sm text-gray-500 mt-1">{projects.length} proyectos en total</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {([["list", List, "Lista"], ["kanban", LayoutGrid, "Kanban"], ["timeline", GanttChart, "Timeline"]] as const).map(([mode, Icon, label]) => (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); localStorage.setItem("im3_projects_view", mode); }}
                className={`p-1.5 rounded-md transition-colors ${viewMode === mode ? "bg-white text-[#2FA4A9] shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                title={label}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              apiRequest("POST", "/api/admin/projects/seed-p2f").then(r => r.json()).then(data => {
                queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
                toast({ title: data.message || "Proyecto P2F creado" });
              }).catch(() => toast({ title: "Error creando P2F", variant: "destructive" }));
            }}
            className="gap-1.5"
          >
            <Sparkles className="w-4 h-4" /> P2F
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              apiRequest("POST", "/api/admin/projects/seed-p2f-data").then(r => r.json()).then(data => {
                queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
                toast({ title: data.message || "Datos P2F poblados" });
              }).catch(() => toast({ title: "Error poblando datos", variant: "destructive" }));
            }}
            className="gap-1.5 text-xs"
          >
            P2F Datos
          </Button>
          <Button onClick={() => setShowCreate(true)} className="bg-[#2FA4A9] hover:bg-[#238b8f]">
            <Plus className="w-4 h-4 mr-2" /> Nuevo proyecto
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "planning", "in_progress", "paused", "completed", "cancelled"].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterStatus === s ? "bg-[#2FA4A9] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s === "all" ? "Todos" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Projects table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-4">
          <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay proyectos{filterStatus !== "all" ? ` en estado "${STATUS_LABELS[filterStatus]}"` : ""}</p>
          {filterStatus === "all" && (
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {seedMutation.isPending ? "Creando..." : "Crear proyecto demo"}
            </Button>
          )}
        </div>
      ) : viewMode === "kanban" ? (
        /* ── KANBAN VIEW ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {["planning", "in_progress", "paused", "completed", "cancelled"].map(status => {
            const col = filtered.filter(p => p.status === status);
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <div className={`w-2 h-2 rounded-full ${status === "planning" ? "bg-blue-500" : status === "in_progress" ? "bg-emerald-500" : status === "paused" ? "bg-amber-500" : status === "cancelled" ? "bg-red-500" : "bg-gray-400"}`} />
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{STATUS_LABELS[status]}</h3>
                  <span className="text-xs text-gray-300">{col.length}</span>
                </div>
                <div className="space-y-2 min-h-[120px]">
                  {col.map(p => (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/admin/projects/${p.id}`)}
                      className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-shadow space-y-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                          {p.projectType === "internal" && (
                            <span className="text-[9px] uppercase tracking-wider font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Interno</span>
                          )}
                        </div>
                        {p.contactName && <p className="text-xs text-gray-400 mt-0.5">{p.contactName}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#2FA4A9] rounded-full" style={{ width: `${p.progress}%` }} />
                        </div>
                        <span className="text-[11px] text-gray-400 font-medium">{p.progress}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-400">{p.completedTaskCount}/{p.taskCount} tareas</span>
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => copyPortalLink(p.accessToken)} className="p-1 rounded text-gray-300 hover:text-[#2FA4A9] transition-colors"><Copy className="w-3.5 h-3.5" /></button>
                          <button onClick={() => { if (confirm(`¿Eliminar "${p.name}"?`)) deleteProjectMutation.mutate(p.id); }} className="p-1 rounded text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === "timeline" ? (
        /* ── TIMELINE VIEW ── */
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          {filtered.map(p => {
            const start = p.startDate ? new Date(p.startDate) : p.createdAt ? new Date(p.createdAt) : new Date();
            const end = p.estimatedEndDate ? new Date(p.estimatedEndDate) : new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);
            const now = new Date();
            const totalMs = end.getTime() - start.getTime();
            const elapsedMs = Math.max(0, Math.min(now.getTime() - start.getTime(), totalMs));
            const timeProgress = totalMs > 0 ? Math.round((elapsedMs / totalMs) * 100) : 0;

            return (
              <div
                key={p.id}
                className="flex items-center gap-4 py-3 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                onClick={() => navigate(`/admin/projects/${p.id}`)}
              >
                <div className="w-48 shrink-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{p.name}</p>
                  <p className="text-[11px] text-gray-400">{p.contactName || "Sin cliente"}</p>
                </div>
                <div className="text-[11px] text-gray-400 w-16 shrink-0 text-center">
                  {start.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                </div>
                <div className="flex-1 relative">
                  <div className="h-8 bg-gray-50 rounded-lg overflow-hidden relative">
                    <div
                      className={`h-full rounded-lg ${p.status === "completed" ? "bg-gray-200" : p.status === "paused" ? "bg-amber-100" : "bg-[#2FA4A9]/15"}`}
                      style={{ width: `${Math.max(p.progress, 5)}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-3">
                      <span className="text-[11px] font-medium text-gray-700">{p.progress}% completado</span>
                    </div>
                    {p.status !== "completed" && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-400"
                        style={{ left: `${Math.min(timeProgress, 100)}%` }}
                        title={`Hoy: ${timeProgress}% del tiempo transcurrido`}
                      />
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-gray-400 w-16 shrink-0 text-center">
                  {end.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                </div>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${STATUS_COLORS[p.status]}`}>
                  {STATUS_LABELS[p.status]}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── LIST VIEW (default) — agrupada por carpetas ── */
        <div className="space-y-4">
          {groupedProjects.map(group => {
            const isCollapsed = collapsedGroups[group.key];
            const Icon = group.icon;
            const isInternal = group.key === "__internal__";
            const avgProgress = group.items.length > 0
              ? Math.round(group.items.reduce((sum, p) => sum + p.progress, 0) / group.items.length)
              : 0;

            return (
              <div key={group.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setCollapsedGroups(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                  className="w-full flex items-center gap-3 px-5 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left"
                >
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  <Icon className={`w-4 h-4 ${isInternal ? "text-purple-500" : "text-[#2FA4A9]"}`} />
                  <span className="text-sm font-semibold text-gray-900">{group.label}</span>
                  <span className="text-xs text-gray-400">{group.items.length} proyecto{group.items.length === 1 ? "" : "s"}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#2FA4A9] rounded-full" style={{ width: `${avgProgress}%` }} />
                    </div>
                    <span className="text-[11px] text-gray-400 w-8 text-right">{avgProgress}%</span>
                  </div>
                </button>
                {!isCollapsed && (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        <th className="px-5 py-2">Proyecto</th>
                        <th className="px-5 py-2">Estado</th>
                        <th className="px-5 py-2">Progreso</th>
                        <th className="px-5 py-2 w-32">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.items.map(p => (
                        <tr
                          key={p.id}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => navigate(`/admin/projects/${p.id}`)}
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                              {p.projectType === "internal" && (
                                <span className="text-[9px] uppercase tracking-wider font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Interno</span>
                              )}
                            </div>
                            {p.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{p.description}</p>}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                              {STATUS_LABELS[p.status]}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-[#2FA4A9] rounded-full transition-all" style={{ width: `${p.progress}%` }} />
                              </div>
                              <span className="text-xs text-gray-500">{p.progress}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              {!isInternal && (
                                <>
                                  <button
                                    onClick={() => copyPortalLink(p.accessToken)}
                                    className="p-1.5 rounded-md text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors"
                                    title="Copiar link del portal"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>
                                  <a
                                    href={`/portal/${p.accessToken}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-md text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors"
                                    title="Abrir portal"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                </>
                              )}
                              <button
                                onClick={() => {
                                  if (confirm(`¿Eliminar "${p.name}" permanentemente?`)) {
                                    deleteProjectMutation.mutate(p.id);
                                  }
                                }}
                                className="p-1.5 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Eliminar proyecto"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!isCreating) setShowCreate(open); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo proyecto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo de proyecto</Label>
              <div className="grid grid-cols-2 gap-2">
                {([["client", "Cliente", Building2], ["internal", "Interno IM3", Wrench]] as const).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, projectType: value, contactId: value === "internal" ? "" : f.contactId }))}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      form.projectType === value
                        ? "border-[#2FA4A9] bg-[#2FA4A9]/5 text-[#2FA4A9]"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nombre del proyecto</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: App Logística - TransCarga" />
            </div>

            <div className="space-y-2">
              <Label>Brief — hacia dónde va este proyecto</Label>
              <Textarea
                value={form.brief}
                onChange={e => setForm(f => ({ ...f, brief: e.target.value }))}
                placeholder="Describe el problema, los usuarios, el alcance, el resultado esperado. Mínimo 2-3 párrafos para que la IA genere fases razonables."
                rows={6}
              />
              <p className="text-[11px] text-gray-400">{form.brief.length} caracteres {form.useAI && form.brief.length < 20 && "· mínimo 20 para generar con IA"}</p>
            </div>

            {form.projectType === "client" && (
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={form.contactId} onValueChange={v => setForm(f => ({ ...f, contactId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar contacto" /></SelectTrigger>
                  <SelectContent>
                    {contactsList.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre} ({c.empresa})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Repo de GitHub (opcional)</Label>
              <Input
                value={form.githubRepoUrl}
                onChange={e => setForm(f => ({ ...f, githubRepoUrl: e.target.value }))}
                placeholder="https://github.com/owner/repo"
              />
              <p className="text-[11px] text-gray-400">Si se conecta, la IA leerá README + docs/ + últimos commits para refinar las fases.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Presupuesto</Label>
                <Input type="number" value={form.totalBudget} onChange={e => setForm(f => ({ ...f, totalBudget: e.target.value }))} placeholder="5000" />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="COP">COP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* IA toggle */}
            <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-[#2FA4A9]/50 transition-colors">
              <input
                type="checkbox"
                checked={form.useAI}
                onChange={e => setForm(f => ({ ...f, useAI: e.target.checked }))}
                className="mt-0.5 accent-[#2FA4A9]"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#2FA4A9]" />
                  Generar fases con IA
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Claude diseña 3-6 fases con tareas y entregables a partir del brief. Toma 10-30 segundos.
                </p>
              </div>
            </label>

            <Button
              onClick={handleCreate}
              disabled={!form.name || isCreating}
              className="w-full bg-[#2FA4A9] hover:bg-[#238b8f]"
            >
              {isCreating
                ? (form.useAI ? "Generando fases con IA…" : "Creando…")
                : (form.useAI ? "Generar proyecto con IA" : "Crear proyecto vacío")
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
