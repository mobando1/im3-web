import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Copy, ExternalLink, Plus, Trash2, Send, Clock, CheckCircle2, Circle, AlertCircle, ChevronDown, ChevronRight, Github, CalendarDays, BarChart3, Diamond, TrendingUp, Package, MessageSquare, Timer, Mic, FolderOpen, Lightbulb, FileText, Image, File, ThumbsUp, X, UserPlus, Users, RefreshCw, Mail } from "lucide-react";
import { format, parseISO, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, eachMonthOfInterval, isSameDay, isSameMonth, addMonths, subMonths, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
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
  githubRepoUrl: string | null;
  githubWebhookSecret: string | null;
  aiTrackingEnabled: boolean;
  progress: number;
  totalHours: number;
  phases: Array<{
    id: string;
    name: string;
    description: string | null;
    orderIndex: number;
    status: string;
    startDate: string | null;
    endDate: string | null;
    estimatedHours: number | null;
    tasks: Array<{
      id: string;
      title: string;
      description: string | null;
      clientFacingTitle: string | null;
      status: string;
      priority: string;
      estimatedHours: number | null;
      actualHours: string | null;
      dueDate: string | null;
      isMilestone: boolean;
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
    clientRating: number | null;
    screenshotUrl: string | null;
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

const TAB_ICONS: Record<string, typeof Circle> = {
  Roadmap: BarChart3,
  Timeline: TrendingUp,
  Calendario: CalendarDays,
  Entregas: Package,
  Horas: Timer,
  Sesiones: Mic,
  Archivos: FolderOpen,
  Ideas: Lightbulb,
  Mensajes: MessageSquare,
  Config: Circle,
};

const tabs = ["Roadmap", "Timeline", "Calendario", "Entregas", "Horas", "Sesiones", "Archivos", "Ideas", "Mensajes", "Config"];

type GithubRepo = {
  id: number;
  fullName: string;
  url: string;
  description: string | null;
  isPrivate: boolean;
  updatedAt: string;
};

function GitHubRepoSelector({ projectId, currentRepo, aiEnabled, onConnected }: {
  projectId: string;
  currentRepo: string | null;
  aiEnabled: boolean;
  onConnected: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: ghStatus } = useQuery<{ configured: boolean; connected: boolean; githubUsername: string | null }>({
    queryKey: ["/api/admin/github/status"],
  });

  const { data: repos = [], isLoading: loadingRepos } = useQuery<GithubRepo[]>({
    queryKey: ["/api/admin/github/repos"],
    enabled: !!ghStatus?.connected,
  });

  const connectRepoMut = useMutation({
    mutationFn: async (repoFullName: string) => {
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/connect-repo`, { repoFullName });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Repositorio conectado con webhook automático" });
      onConnected();
    },
    onError: () => {
      toast({ title: "Error conectando repositorio", variant: "destructive" });
    },
  });

  const disconnectMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/github/disconnect");
    },
    onSuccess: () => {
      toast({ title: "GitHub desconectado" });
      onConnected();
    },
  });

  // Already connected to a repo
  if (currentRepo && aiEnabled) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-800">Conectado</p>
            <p className="text-xs text-emerald-600 truncate">{currentRepo}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              await apiRequest("POST", `/api/admin/projects/${projectId}/analyze-commits`);
              onConnected();
              toast({ title: "Commits analizados" });
            } catch { toast({ title: "Error analizando", variant: "destructive" }); }
          }}>Analizar commits</Button>
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              await apiRequest("POST", `/api/admin/projects/${projectId}/weekly-summary`);
              toast({ title: "Resumen semanal generado" });
            } catch { toast({ title: "Error generando resumen", variant: "destructive" }); }
          }}>Resumen semanal</Button>
        </div>
      </div>
    );
  }

  // GitHub OAuth not configured on server
  if (ghStatus && !ghStatus.configured) {
    return (
      <p className="text-xs text-gray-400">
        GitHub OAuth no está configurado. Agrega GITHUB_CLIENT_ID y GITHUB_CLIENT_SECRET en las variables de entorno.
      </p>
    );
  }

  // Not connected to GitHub yet
  if (ghStatus && !ghStatus.connected) {
    return (
      <div className="space-y-3">
        <a
          href="/api/github/authorize"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Github className="w-4 h-4" />
          Conectar con GitHub
        </a>
        <p className="text-xs text-gray-400">Autoriza acceso para seleccionar tus repositorios automáticamente.</p>
      </div>
    );
  }

  // Connected to GitHub — show repo selector
  const filteredRepos = search
    ? repos.filter(r => r.fullName.toLowerCase().includes(search.toLowerCase()))
    : repos;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Conectado como <span className="font-medium text-gray-700">@{ghStatus?.githubUsername}</span>
        </p>
        <button onClick={() => disconnectMut.mutate()} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
          Desconectar
        </button>
      </div>

      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar repositorio..."
        className="h-9 text-sm"
      />

      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50">
        {loadingRepos ? (
          <p className="text-xs text-gray-400 text-center py-6">Cargando repositorios...</p>
        ) : filteredRepos.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No se encontraron repositorios</p>
        ) : (
          filteredRepos.map(repo => (
            <button
              key={repo.id}
              onClick={() => connectRepoMut.mutate(repo.fullName)}
              disabled={connectRepoMut.isPending}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{repo.fullName}</p>
                {repo.description && <p className="text-xs text-gray-400 truncate">{repo.description}</p>}
              </div>
              {repo.isPrivate && (
                <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium shrink-0">privado</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function AdminProjectDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("Roadmap");
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [calQuickTask, setCalQuickTask] = useState({ title: "", phaseId: "" });

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
  const [delivForm, setDelivForm] = useState({ title: "", description: "", type: "feature", phaseId: "", screenshotUrl: "", demoUrl: "" });

  // Session creation
  const [showAddSession, setShowAddSession] = useState(false);
  const [sessionForm, setSessionForm] = useState({ title: "", date: new Date().toISOString().split("T")[0], duration: "", transcription: "", summary: "", actionItems: "" });

  // File creation
  const [showAddFile, setShowAddFile] = useState(false);
  const [fileForm, setFileForm] = useState({ name: "", type: "document", url: "" });

  // Idea creation
  const [showAddIdea, setShowAddIdea] = useState(false);
  const [ideaForm, setIdeaForm] = useState({ title: "", description: "", priority: "medium" });

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
    onSuccess: () => { invalidate(); setShowAddDeliverable(false); setDelivForm({ title: "", description: "", type: "feature", phaseId: "", screenshotUrl: "", demoUrl: "" }); },
  });

  const updateDelivMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => { await apiRequest("PATCH", `/api/admin/deliverables/${id}`, data); },
    onSuccess: () => { invalidate(); toast({ title: "Entrega actualizada" }); },
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

  const activateProjectMut = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/admin/projects/${params.id}/activate`); },
    onSuccess: () => { invalidate(); toast({ title: "Portal activado — el cliente ya puede acceder" }); },
    onError: () => toast({ title: "Error activando portal", variant: "destructive" }),
  });

  // Sessions, Files, Ideas queries
  const { data: sessions = [] } = useQuery<any[]>({ queryKey: [`/api/admin/projects/${params.id}/sessions`], enabled: activeTab === "Sesiones" });
  const { data: files = [] } = useQuery<any[]>({ queryKey: [`/api/admin/projects/${params.id}/files`], enabled: activeTab === "Archivos" });
  const { data: ideas = [] } = useQuery<any[]>({ queryKey: [`/api/admin/projects/${params.id}/ideas`], enabled: activeTab === "Ideas" });

  const invalidateSessions = () => queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${params.id}/sessions`] });
  const invalidateFiles = () => queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${params.id}/files`] });
  const invalidateIdeas = () => queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${params.id}/ideas`] });

  const addSessionMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("POST", `/api/admin/projects/${params.id}/sessions`, data); },
    onSuccess: () => { invalidateSessions(); setShowAddSession(false); setSessionForm({ title: "", date: new Date().toISOString().split("T")[0], duration: "", transcription: "", summary: "", actionItems: "" }); },
  });

  const deleteSessionMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/sessions/${id}`); },
    onSuccess: invalidateSessions,
  });

  const addFileMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("POST", `/api/admin/projects/${params.id}/files`, data); },
    onSuccess: () => { invalidateFiles(); setShowAddFile(false); setFileForm({ name: "", type: "document", url: "" }); },
  });

  const deleteFileMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/files/${id}`); },
    onSuccess: invalidateFiles,
  });

  const addIdeaMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("POST", `/api/admin/projects/${params.id}/ideas`, data); },
    onSuccess: () => { invalidateIdeas(); setShowAddIdea(false); setIdeaForm({ title: "", description: "", priority: "medium" }); },
  });

  const updateIdeaMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => { await apiRequest("PATCH", `/api/admin/ideas/${id}`, data); },
    onSuccess: invalidateIdeas,
  });

  const deleteIdeaMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/ideas/${id}`); },
    onSuccess: invalidateIdeas,
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

      {/* Planning banner — project generated by AI, pending activation */}
      {project.status === "planning" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Proyecto en borrador — generado por AI</p>
            <p className="text-xs text-amber-600 mt-0.5">Revisa las fases, tareas y entregas antes de activar el portal. El cliente no puede ver este proyecto hasta que lo actives.</p>
          </div>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            onClick={() => activateProjectMut.mutate()}
            disabled={activateProjectMut.isPending}
          >
            {activateProjectMut.isPending ? "Activando..." : "Activar portal →"}
          </Button>
        </div>
      )}

      {/* Stats bar — premium design */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Progreso", value: `${project.progress}%`, icon: TrendingUp, color: "bg-teal-50 text-teal-600", accent: "#2FA4A9" },
          { label: "Horas", value: project.totalHours.toFixed(1), icon: Timer, color: "bg-blue-50 text-blue-600", accent: "#3B82F6" },
          { label: "Entregas", value: `${project.deliverables.filter(d => d.status === "approved").length}/${project.deliverables.length}`, icon: Package, color: "bg-purple-50 text-purple-600", accent: "#8B5CF6" },
          { label: "Mensajes", value: project.messages.length.toString(), icon: MessageSquare, color: "bg-amber-50 text-amber-600", accent: "#D97706" },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 relative overflow-hidden group hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">{s.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              {s.label === "Progreso" && (
                <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${project.progress}%` }} transition={{ duration: 1, ease: "easeOut" }} className="h-full rounded-full" style={{ background: s.accent }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Acceso del cliente — invitar con login + lista */}
      <ClientAccessSection projectId={project.id} />

      {/* Analytics — conectar Google Analytics 4 */}
      <AnalyticsSection projectId={project.id} />

      {/* Tabs — with icons */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(t => {
          const TabIcon = TAB_ICONS[t] || Circle;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === t
                  ? "border-[#2FA4A9] text-[#2FA4A9]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <TabIcon className="w-3.5 h-3.5" />
              {t}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {/* ── ROADMAP ── */}
        {activeTab === "Roadmap" && (
          <div className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                apiRequest("POST", `/api/admin/projects/${params.id}/auto-dates`, { force: true })
                  .then(() => { invalidate(); toast({ title: "Fechas distribuidas automáticamente" }); })
                  .catch(() => toast({ title: "Error distribuyendo fechas", variant: "destructive" }));
              }}>
                <Clock className="w-3.5 h-3.5 mr-1.5" /> Auto-fechas
              </Button>
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
                          {/* Inline date editing for phase */}
                          <div className="flex items-center gap-2 py-2 mb-2 border-b border-gray-50">
                            <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Fechas:</span>
                            <input
                              type="date"
                              value={phase.startDate ? phase.startDate.split("T")[0] : ""}
                              onChange={e => updatePhaseMut.mutate({ id: phase.id, data: { startDate: e.target.value || null } })}
                              className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 focus:border-[#2FA4A9] focus:ring-1 focus:ring-[#2FA4A9]/20 outline-none"
                              onClick={e => e.stopPropagation()}
                            />
                            <span className="text-gray-300">→</span>
                            <input
                              type="date"
                              value={phase.endDate ? phase.endDate.split("T")[0] : ""}
                              onChange={e => updatePhaseMut.mutate({ id: phase.id, data: { endDate: e.target.value || null } })}
                              className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 focus:border-[#2FA4A9] focus:ring-1 focus:ring-[#2FA4A9]/20 outline-none"
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
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
                                <input
                                  type="date"
                                  value={task.dueDate ? task.dueDate.split("T")[0] : ""}
                                  onChange={e => updateTaskMut.mutate({ id: task.id, data: { dueDate: e.target.value || null } })}
                                  className={`text-[10px] border rounded px-1.5 py-0.5 outline-none w-28 ${task.dueDate ? "border-gray-200 text-gray-500" : "border-dashed border-gray-300 text-gray-400"} focus:border-[#2FA4A9]`}
                                  title="Fecha límite"
                                />
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

        {/* ── TIMELINE (Gantt) ── */}
        {activeTab === "Timeline" && (() => {
          const allDates: Date[] = [];
          project.phases.forEach(phase => {
            if (phase.startDate) allDates.push(parseISO(phase.startDate));
            if (phase.endDate) allDates.push(parseISO(phase.endDate));
            phase.tasks.forEach(t => { if (t.dueDate) allDates.push(parseISO(t.dueDate)); });
          });
          if (allDates.length < 2) {
            return (
              <div className="text-center py-20">
                <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm font-medium mb-1">Timeline vacío</p>
                <p className="text-gray-400 text-xs mb-4">Agrega fechas de inicio y fin a las fases en el Roadmap para ver el timeline.</p>
                <Button variant="outline" size="sm" onClick={() => setActiveTab("Roadmap")}>
                  Ir al Roadmap →
                </Button>
              </div>
            );
          }
          const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
          const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
          const totalDays = Math.max(differenceInDays(maxDate, minDate), 1);
          const today = new Date();
          const todayPos = Math.max(0, Math.min(100, (differenceInDays(today, minDate) / totalDays) * 100));

          const PHASE_COLORS = ["#2FA4A9", "#3B82F6", "#8B5CF6", "#D97706", "#EC4899", "#10B981"];

          const getPos = (dateStr: string | null) => {
            if (!dateStr) return null;
            return Math.max(0, Math.min(100, (differenceInDays(parseISO(dateStr), minDate) / totalDays) * 100));
          };

          // Generate monthly tick marks
          const months = eachMonthOfInterval({ start: minDate, end: maxDate });

          return (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-6 overflow-x-auto">
                <div className="relative min-w-[700px]">
                  {/* ── Monthly axis ── */}
                  <div className="relative h-10 mb-4">
                    {/* Baseline */}
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-200" />
                    {/* Month ticks */}
                    {months.map((month, i) => {
                      const pos = Math.max(0, Math.min(100, (differenceInDays(month, minDate) / totalDays) * 100));
                      const isJan = month.getMonth() === 0;
                      return (
                        <div key={i} className="absolute bottom-0" style={{ left: `${pos}%` }}>
                          <div className="absolute bottom-0 w-px h-3 bg-gray-300" />
                          <div className="absolute bottom-[-18px] -translate-x-1/2 whitespace-nowrap">
                            <span className={`text-[10px] ${isJan ? "font-bold text-gray-600" : "text-gray-400"}`}>
                              {format(month, isJan ? "MMM yyyy" : "MMM", { locale: es })}
                            </span>
                          </div>
                          {/* Vertical guide line — behind content */}
                          <div className="absolute top-6 w-px bg-gray-100/50 pointer-events-none" style={{ height: `${project.phases.length * 70 + 40}px`, zIndex: 0 }} />
                        </div>
                      );
                    })}
                    {/* Today marker on axis */}
                    <motion.div
                      className="absolute bottom-0 z-20"
                      style={{ left: `${todayPos}%` }}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                    >
                      <div className="absolute -top-7 -translate-x-1/2 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full shadow-sm">Hoy</div>
                      <div className="absolute bottom-0 w-px h-3 bg-red-400" />
                    </motion.div>
                  </div>

                  {/* Spacer for month labels */}
                  <div className="h-4" />

                  {/* ── Phase bars ── */}
                  <div className="space-y-5">
                    {project.phases.map((phase, idx) => {
                      const color = PHASE_COLORS[idx % PHASE_COLORS.length];
                      const left = getPos(phase.startDate) ?? 0;
                      const right = getPos(phase.endDate) ?? 100;
                      const width = Math.max(right - left, 3);
                      const phaseProgress = phase.tasks.length > 0
                        ? (phase.tasks.filter(t => t.status === "completed").length / phase.tasks.length) * 100
                        : 0;
                      const isComplete = phaseProgress === 100;
                      const completedTasks = phase.tasks.filter(t => t.status === "completed").length;

                      return (
                        <motion.div
                          key={phase.id}
                          className="relative z-10"
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.08, duration: 0.4, ease: "easeOut" }}
                        >
                          {/* Phase header */}
                          <div className="flex items-center gap-3 mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider w-16 shrink-0" style={{ color }}>{`Fase ${idx + 1}`}</span>
                            <span className="text-sm font-semibold text-gray-800">{phase.name}</span>
                            <div className="flex items-center gap-2 ml-auto">
                              {phase.startDate && phase.endDate && (
                                <span className="text-[10px] text-gray-400">
                                  {format(parseISO(phase.startDate), "d MMM", { locale: es })} → {format(parseISO(phase.endDate), "d MMM", { locale: es })}
                                </span>
                              )}
                              <span className={`text-[11px] font-bold ${isComplete ? "text-emerald-600" : "text-gray-500"}`}>{Math.round(phaseProgress)}%</span>
                            </div>
                          </div>
                          {/* Phase bar with hover tooltip */}
                          <div className="relative h-7 rounded-lg ml-16 overflow-hidden group cursor-default" style={{ background: `${color}10` }}>
                            {/* Progress fill — animated */}
                            <motion.div
                              className="absolute h-full rounded-lg"
                              style={{ left: `${left}%`, background: color, opacity: isComplete ? 0.85 : 1 }}
                              initial={{ width: 0 }}
                              animate={{ width: `${width * (phaseProgress / 100)}%` }}
                              transition={{ delay: idx * 0.08 + 0.3, duration: 0.8, ease: "easeOut" }}
                            />
                            {/* Full range outline */}
                            <motion.div
                              className="absolute h-full rounded-lg border-2"
                              style={{ left: `${left}%`, borderColor: color, opacity: 0.25 }}
                              initial={{ width: 0 }}
                              animate={{ width: `${width}%` }}
                              transition={{ delay: idx * 0.08 + 0.1, duration: 0.5, ease: "easeOut" }}
                            />
                            {/* Completada badge */}
                            {isComplete && (
                              <motion.div
                                className="absolute h-full flex items-center"
                                style={{ left: `${left + 1}%` }}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.08 + 0.8, duration: 0.3 }}
                              >
                                <span className="text-white text-[10px] font-bold ml-2 flex items-center gap-1">✓ Completada</span>
                              </motion.div>
                            )}
                            {/* Hover tooltip */}
                            <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200 -top-16 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] rounded-lg px-3 py-2 shadow-lg pointer-events-none whitespace-nowrap z-30">
                              <p className="font-semibold">{phase.name}</p>
                              <p className="text-gray-300">{completedTasks}/{phase.tasks.length} tareas · {Math.round(phaseProgress)}% completado</p>
                              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                            </div>
                          </div>
                          {/* Milestone markers */}
                          {phase.tasks.filter(t => t.isMilestone && t.dueDate).map(task => {
                            const taskLeft = getPos(task.dueDate);
                            if (taskLeft === null) return null;
                            return (
                              <motion.div
                                key={task.id}
                                className="relative h-5 ml-16 mt-0.5"
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.08 + 1, duration: 0.3 }}
                              >
                                <div className="absolute flex items-center gap-1" style={{ left: `${taskLeft}%` }}>
                                  <Diamond className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0 drop-shadow-[0_0_4px_rgba(217,119,6,0.4)]" />
                                  <span className="text-[9px] text-amber-600 font-medium whitespace-nowrap">{task.clientFacingTitle || task.title}</span>
                                </div>
                              </motion.div>
                            );
                          })}
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Today vertical line — full height with pulse */}
                  <motion.div
                    className="absolute z-10"
                    style={{ left: `${todayPos}%`, top: "40px", bottom: "0" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.5 }}
                  >
                    <div className="absolute top-0 bottom-0 w-0.5 bg-red-400/60" />
                    <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 animate-pulse" />
                  </motion.div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── CALENDARIO ── */}
        {activeTab === "Calendario" && (() => {
          const monthStart = startOfMonth(calendarMonth);
          const monthEnd = endOfMonth(calendarMonth);
          const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
          const startDay = monthStart.getDay(); // 0=Sun

          // Collect all events for this month
          type CalEvent = { date: Date; label: string; type: "phase_start" | "phase_end" | "task" | "milestone"; status: string; color: string; taskId?: string; phaseId: string; phaseName: string };
          const events: CalEvent[] = [];
          const PHASE_COLORS_CAL = ["#2FA4A9", "#3B82F6", "#8B5CF6", "#D97706", "#EC4899", "#10B981"];
          project.phases.forEach((phase, idx) => {
            const color = PHASE_COLORS_CAL[idx % PHASE_COLORS_CAL.length];
            if (phase.startDate) events.push({ date: parseISO(phase.startDate), label: `${phase.name} (inicio)`, type: "phase_start", status: phase.status, color, phaseId: phase.id, phaseName: phase.name });
            if (phase.endDate) events.push({ date: parseISO(phase.endDate), label: `${phase.name} (fin)`, type: "phase_end", status: phase.status, color, phaseId: phase.id, phaseName: phase.name });
            phase.tasks.forEach(t => {
              if (t.dueDate) {
                events.push({
                  date: parseISO(t.dueDate),
                  label: t.title,
                  type: t.isMilestone ? "milestone" : "task",
                  status: t.status,
                  color: t.status === "completed" ? "#10B981" : t.status === "in_progress" ? "#3B82F6" : t.status === "blocked" ? "#EF4444" : "#9CA3AF",
                  taskId: t.id,
                  phaseId: phase.id,
                  phaseName: phase.name,
                });
              }
            });
          });

          const getEventsForDay = (day: Date) => events.filter(e => isSameDay(e.date, day));
          const today = new Date();
          const selectedDayEvents = selectedDay ? getEventsForDay(selectedDay) : [];

          return (
            <div className="space-y-4">
              {events.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                  <CalendarDays className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm text-amber-800 font-medium">Calendario vacío</p>
                    <p className="text-xs text-amber-600">Agrega fechas a las fases y tareas en el Roadmap para verlas aquí.</p>
                  </div>
                  <Button variant="outline" size="sm" className="ml-auto shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100" onClick={() => setActiveTab("Roadmap")}>
                    Ir al Roadmap
                  </Button>
                </div>
              )}

              <div className="flex gap-4">
                {/* Calendar grid */}
                <div className={`bg-white rounded-xl border border-gray-200 p-6 ${selectedDay ? "flex-1" : "w-full"} transition-all`}>
                  {/* Month navigation */}
                  <div className="flex items-center justify-between mb-6">
                    <button onClick={() => setCalendarMonth(prev => subMonths(prev, 1))} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                      <ChevronDown className="w-4 h-4 rotate-90" />
                    </button>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-gray-900 capitalize">
                        {format(calendarMonth, "MMMM yyyy", { locale: es })}
                      </h3>
                      <button onClick={() => { setCalendarMonth(new Date()); setSelectedDay(new Date()); }} className="text-[10px] text-[#2FA4A9] font-medium hover:underline">
                        Hoy
                      </button>
                    </div>
                    <button onClick={() => setCalendarMonth(prev => addMonths(prev, 1))} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                      <ChevronDown className="w-4 h-4 -rotate-90" />
                    </button>
                  </div>

                  {/* Day headers */}
                  <div className="grid grid-cols-7 gap-px mb-1">
                    {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map(d => (
                      <div key={d} className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider py-2">{d}</div>
                    ))}
                  </div>

                  {/* Calendar grid */}
                  <div className="grid grid-cols-7 gap-px">
                    {Array.from({ length: startDay }).map((_, i) => (
                      <div key={`empty-${i}`} className="h-24 bg-gray-50/30 rounded-lg" />
                    ))}
                    {days.map(day => {
                      const dayEvents = getEventsForDay(day);
                      const isToday = isSameDay(day, today);
                      const isSelected = selectedDay && isSameDay(day, selectedDay);
                      return (
                        <div
                          key={day.toISOString()}
                          onClick={() => setSelectedDay(day)}
                          className={`h-24 rounded-lg p-1.5 border cursor-pointer transition-all ${
                            isSelected ? "border-[#2FA4A9] bg-teal-50/50 ring-1 ring-[#2FA4A9]/20"
                            : isToday ? "border-[#2FA4A9]/40 bg-teal-50/20"
                            : "border-transparent hover:bg-gray-50 hover:border-gray-200"
                          }`}
                        >
                          <div className={`text-[11px] font-medium mb-1 ${isSelected ? "text-[#2FA4A9] font-bold" : isToday ? "text-[#2FA4A9] font-bold" : "text-gray-500"}`}>
                            {format(day, "d")}
                          </div>
                          <div className="space-y-0.5 overflow-hidden">
                            {dayEvents.slice(0, 3).map((ev, i) => (
                              <div key={i} className="flex items-center gap-1">
                                {ev.type === "milestone" ? (
                                  <Diamond className="w-2.5 h-2.5 shrink-0 text-amber-500 fill-amber-500" />
                                ) : (
                                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ev.color }} />
                                )}
                                <span className="text-[9px] text-gray-600 truncate">{ev.label}</span>
                              </div>
                            ))}
                            {dayEvents.length > 3 && (
                              <span className="text-[9px] text-gray-400">+{dayEvents.length - 3} más</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[10px] text-gray-500">Completada</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-[10px] text-gray-500">En progreso</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-400" /><span className="text-[10px] text-gray-500">Pendiente</span></div>
                    <div className="flex items-center gap-1.5"><Diamond className="w-2.5 h-2.5 text-amber-500 fill-amber-500" /><span className="text-[10px] text-gray-500">Milestone</span></div>
                  </div>
                </div>

                {/* Side panel — day detail */}
                <AnimatePresence>
                  {selectedDay && (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 340, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="shrink-0 overflow-hidden"
                    >
                      <div className="bg-white rounded-xl border border-gray-200 p-5 h-full w-[340px]">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-sm font-bold text-gray-900 capitalize">{format(selectedDay, "EEEE", { locale: es })}</p>
                            <p className="text-xs text-gray-400">{format(selectedDay, "d 'de' MMMM, yyyy", { locale: es })}</p>
                          </div>
                          <button onClick={() => setSelectedDay(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">✕</button>
                        </div>

                        {selectedDayEvents.length === 0 ? (
                          <div className="text-center py-8">
                            <CalendarDays className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                            <p className="text-xs text-gray-400 mb-3">Sin eventos este día</p>
                          </div>
                        ) : (
                          <div className="space-y-2 mb-4">
                            {selectedDayEvents.map((ev, i) => {
                              const StatusIcon = ev.taskId ? (TASK_STATUS_ICONS[ev.status] || Circle) : Circle;
                              return (
                                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors group">
                                  <div className="w-1 h-full rounded-full shrink-0 self-stretch" style={{ background: ev.color }} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 truncate">{ev.label}</p>
                                    <p className="text-[10px] text-gray-400">{ev.phaseName}</p>
                                    {ev.type === "milestone" && <span className="text-[10px] text-amber-600 font-medium">🏁 Milestone</span>}
                                    {(ev.type === "phase_start" || ev.type === "phase_end") && (
                                      <span className="text-[10px] text-gray-400">{ev.type === "phase_start" ? "Inicio de fase" : "Fin de fase"}</span>
                                    )}
                                  </div>
                                  {ev.taskId && (
                                    <button
                                      onClick={() => {
                                        const order = ["pending", "in_progress", "completed"];
                                        const next = order[(order.indexOf(ev.status) + 1) % order.length];
                                        updateTaskMut.mutate({ id: ev.taskId!, data: { status: next } });
                                      }}
                                      className="shrink-0"
                                      title="Cambiar estado"
                                    >
                                      <StatusIcon className={`w-4 h-4 ${TASK_STATUS_COLORS[ev.status]} hover:scale-110 transition-transform`} />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Quick add task */}
                        <div className="border-t border-gray-100 pt-3 mt-3">
                          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Agregar tarea rápida</p>
                          <div className="space-y-2">
                            <Input
                              placeholder="Nombre de la tarea"
                              value={calQuickTask.title}
                              onChange={e => setCalQuickTask(f => ({ ...f, title: e.target.value }))}
                              className="h-8 text-xs"
                            />
                            {project.phases.length > 0 && (
                              <Select value={calQuickTask.phaseId} onValueChange={v => setCalQuickTask(f => ({ ...f, phaseId: v }))}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar fase" /></SelectTrigger>
                                <SelectContent>
                                  {project.phases.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <Button
                              size="sm"
                              className="w-full h-8 text-xs bg-[#2FA4A9] hover:bg-[#238b8f]"
                              disabled={!calQuickTask.title || !calQuickTask.phaseId}
                              onClick={() => {
                                addTaskMut.mutate({
                                  phaseId: calQuickTask.phaseId,
                                  data: {
                                    title: calQuickTask.title,
                                    priority: "medium",
                                    dueDate: format(selectedDay, "yyyy-MM-dd"),
                                  },
                                });
                                setCalQuickTask({ title: "", phaseId: "" });
                              }}
                            >
                              <Plus className="w-3 h-3 mr-1" /> Crear tarea para este día
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })()}

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
                        {d.clientRating && (
                          <p className="text-xs text-gray-400 mt-1">
                            Rating: {"★".repeat(d.clientRating)}{"☆".repeat(5 - d.clientRating)}
                          </p>
                        )}
                        {d.demoUrl && (
                          <a href={d.demoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#2FA4A9] hover:underline mt-1 inline-block">
                            Ver demo
                          </a>
                        )}
                        {d.status === "rejected" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDelivMut.mutate({ id: d.id, data: { status: "delivered", deliveredAt: new Date().toISOString() } });
                            }}
                          >
                            Re-entregar
                          </Button>
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
                  <div className="space-y-1.5">
                    <Label>Screenshot URL <span className="text-gray-400 font-normal">(opcional)</span></Label>
                    <Input value={delivForm.screenshotUrl} onChange={e => setDelivForm(f => ({ ...f, screenshotUrl: e.target.value }))} placeholder="https://..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Demo URL <span className="text-gray-400 font-normal">(opcional)</span></Label>
                    <Input value={delivForm.demoUrl} onChange={e => setDelivForm(f => ({ ...f, demoUrl: e.target.value }))} placeholder="https://..." />
                  </div>
                  <Button
                    className="w-full bg-[#2FA4A9] hover:bg-[#238b8f]"
                    disabled={!delivForm.title}
                    onClick={() => addDelivMut.mutate({ title: delivForm.title, description: delivForm.description || null, type: delivForm.type, status: "delivered", deliveredAt: new Date().toISOString(), phaseId: delivForm.phaseId || null, screenshotUrl: delivForm.screenshotUrl || null, demoUrl: delivForm.demoUrl || null })}
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

        {/* ── SESIONES ── */}
        {activeTab === "Sesiones" && (
          <div className="space-y-4">
            {/* CTA to record */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                <Mic className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Grabar nueva sesión</h3>
                <p className="text-xs text-gray-500 mt-0.5">Abre Acta para grabar, transcribir y analizar la reunión con el cliente.</p>
              </div>
              <a href="https://brave-kindness-production-049c.up.railway.app" target="_blank" rel="noopener noreferrer">
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                  <Mic className="w-3.5 h-3.5 mr-1.5" /> Abrir Acta
                </Button>
              </a>
              <Button size="sm" variant="outline" onClick={() => setShowAddSession(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Registrar manualmente
              </Button>
            </div>

            {sessions.length === 0 ? (
              <div className="text-center py-16">
                <Mic className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Sin sesiones grabadas</p>
                <p className="text-xs text-gray-300 mt-1">Registra reuniones con el cliente para tener todo centralizado.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((s: any) => (
                  <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-5 group">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                        <Mic className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-gray-900">{s.title}</h4>
                          {s.duration && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{s.duration} min</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(s.date).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                          {s.speakers?.length > 0 && ` · ${s.speakers.join(", ")}`}
                        </p>
                        {s.summary && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Resumen</p>
                            <p className="text-sm text-gray-700 leading-relaxed">{s.summary}</p>
                          </div>
                        )}
                        {s.actionItems?.length > 0 && (
                          <div className="mt-2">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Action items</p>
                            <ul className="space-y-1">
                              {(s.actionItems as string[]).map((item: string, i: number) => (
                                <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                                  <CheckCircle2 className="w-3 h-3 text-teal-500 mt-0.5 shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {s.transcription && (
                          <details className="mt-2">
                            <summary className="text-xs text-[#2FA4A9] cursor-pointer font-medium hover:underline">Ver transcripción completa</summary>
                            <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg max-h-60 overflow-y-auto">{s.transcription}</pre>
                          </details>
                        )}
                      </div>
                      <button onClick={() => deleteSessionMut.mutate(s.id)} className="p-1 text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add session dialog */}
            <Dialog open={showAddSession} onOpenChange={setShowAddSession}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>Registrar sesión</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Título</Label>
                      <Input value={sessionForm.title} onChange={e => setSessionForm(f => ({ ...f, title: e.target.value }))} placeholder="Diagnóstico inicial" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Fecha</Label>
                      <Input type="date" value={sessionForm.date} onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duración (minutos)</Label>
                    <Input type="number" value={sessionForm.duration} onChange={e => setSessionForm(f => ({ ...f, duration: e.target.value }))} placeholder="45" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Resumen</Label>
                    <Textarea value={sessionForm.summary} onChange={e => setSessionForm(f => ({ ...f, summary: e.target.value }))} rows={2} placeholder="Resumen de lo que se habló..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Action items <span className="text-gray-400 font-normal">(uno por línea)</span></Label>
                    <Textarea value={sessionForm.actionItems} onChange={e => setSessionForm(f => ({ ...f, actionItems: e.target.value }))} rows={3} placeholder="Enviar propuesta&#10;Definir cronograma&#10;Revisar presupuesto" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Transcripción <span className="text-gray-400 font-normal">(opcional)</span></Label>
                    <Textarea value={sessionForm.transcription} onChange={e => setSessionForm(f => ({ ...f, transcription: e.target.value }))} rows={4} placeholder="Transcripción completa..." />
                  </div>
                  <Button
                    className="w-full bg-[#2FA4A9] hover:bg-[#238b8f]"
                    disabled={!sessionForm.title}
                    onClick={() => addSessionMut.mutate({
                      title: sessionForm.title,
                      date: sessionForm.date,
                      duration: sessionForm.duration ? parseInt(sessionForm.duration) : null,
                      summary: sessionForm.summary || null,
                      transcription: sessionForm.transcription || null,
                      actionItems: sessionForm.actionItems ? sessionForm.actionItems.split("\n").filter(Boolean) : [],
                    })}
                  >
                    Guardar sesión
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* ── ARCHIVOS ── */}
        {activeTab === "Archivos" && (
          <div className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={async () => {
                const folderId = (project as any).driveFolderId || prompt("ID de carpeta de Google Drive:");
                if (!folderId) return;
                try {
                  const res = await apiRequest("POST", `/api/admin/projects/${params.id}/sync-drive`, { folderId });
                  const data = await res.json() as { synced?: number; message?: string };
                  toast({ title: data.message || `${data.synced} archivos sincronizados` });
                  invalidate();
                } catch { toast({ title: "Error sincronizando Drive", variant: "destructive" }); }
              }}>
                <FolderOpen className="w-3.5 h-3.5 mr-1.5" /> Sincronizar Drive
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddFile(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Agregar archivo
              </Button>
            </div>

            {files.length === 0 ? (
              <div className="text-center py-16">
                <FolderOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Sin archivos</p>
                <p className="text-xs text-gray-300 mt-1">Sube contratos, diseños, specs y más.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {files.map((f: any) => {
                  const typeIcons: Record<string, typeof File> = { document: FileText, contract: FileText, image: Image, design: Image, recording: Mic, transcript: FileText };
                  const typeColors: Record<string, string> = { document: "bg-blue-50 text-blue-600", contract: "bg-amber-50 text-amber-600", image: "bg-pink-50 text-pink-600", design: "bg-purple-50 text-purple-600", recording: "bg-red-50 text-red-600", transcript: "bg-teal-50 text-teal-600" };
                  const FileIcon = typeIcons[f.type] || File;
                  const colorClass = typeColors[f.type] || "bg-gray-50 text-gray-500";
                  return (
                    <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 group hover:shadow-sm transition-shadow">
                      <div className={`w-10 h-10 rounded-xl ${colorClass} flex items-center justify-center shrink-0`}>
                        <FileIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-900 hover:text-[#2FA4A9] truncate block">{f.name}</a>
                        <p className="text-[10px] text-gray-400">{f.type} · {new Date(f.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</p>
                      </div>
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-300 hover:text-[#2FA4A9]">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button onClick={() => deleteFileMut.mutate(f.id)} className="p-1 text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <Dialog open={showAddFile} onOpenChange={setShowAddFile}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Agregar archivo</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  {/* Toggle: Upload vs URL */}
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setFileForm(f => ({ ...f, mode: "upload" }))}
                      className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${(fileForm as any).mode !== "url" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
                    >
                      Subir archivo
                    </button>
                    <button
                      onClick={() => setFileForm(f => ({ ...f, mode: "url" }))}
                      className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${(fileForm as any).mode === "url" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
                    >
                      Pegar URL
                    </button>
                  </div>

                  {(fileForm as any).mode === "url" ? (
                    <>
                      <div className="space-y-1.5">
                        <Label>Nombre</Label>
                        <Input value={fileForm.name} onChange={e => setFileForm(f => ({ ...f, name: e.target.value }))} placeholder="Contrato v1.pdf" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Tipo</Label>
                        <Select value={fileForm.type} onValueChange={v => setFileForm(f => ({ ...f, type: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="document">Documento</SelectItem>
                            <SelectItem value="contract">Contrato</SelectItem>
                            <SelectItem value="image">Imagen</SelectItem>
                            <SelectItem value="design">Diseño</SelectItem>
                            <SelectItem value="recording">Grabación</SelectItem>
                            <SelectItem value="transcript">Transcripción</SelectItem>
                            <SelectItem value="other">Otro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>URL del archivo</Label>
                        <Input value={fileForm.url} onChange={e => setFileForm(f => ({ ...f, url: e.target.value }))} placeholder="https://drive.google.com/..." />
                      </div>
                      <Button
                        className="w-full bg-[#2FA4A9] hover:bg-[#238b8f]"
                        disabled={!fileForm.name || !fileForm.url}
                        onClick={() => addFileMut.mutate(fileForm)}
                      >
                        Guardar
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label>Archivo</Label>
                        <input
                          type="file"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) setFileForm(f => ({ ...f, name: file.name, _file: file as any }));
                          }}
                          className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#2FA4A9]/10 file:text-[#2FA4A9] hover:file:bg-[#2FA4A9]/20 file:cursor-pointer"
                        />
                      </div>
                      {(fileForm as any)._file && (
                        <p className="text-xs text-gray-500">
                          {((fileForm as any)._file as File).name} — {(((fileForm as any)._file as File).size / 1024 / 1024).toFixed(1)} MB
                        </p>
                      )}
                      <div className="space-y-1.5">
                        <Label>Tipo</Label>
                        <Select value={fileForm.type} onValueChange={v => setFileForm(f => ({ ...f, type: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Detectar automáticamente</SelectItem>
                            <SelectItem value="document">Documento</SelectItem>
                            <SelectItem value="contract">Contrato</SelectItem>
                            <SelectItem value="image">Imagen</SelectItem>
                            <SelectItem value="design">Diseño</SelectItem>
                            <SelectItem value="recording">Grabación</SelectItem>
                            <SelectItem value="transcript">Transcripción</SelectItem>
                            <SelectItem value="other">Otro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        className="w-full bg-[#2FA4A9] hover:bg-[#238b8f]"
                        disabled={!(fileForm as any)._file || addFileMut.isPending}
                        onClick={async () => {
                          const file = (fileForm as any)._file as File;
                          if (!file) return;
                          const formData = new FormData();
                          formData.append("file", file);
                          formData.append("name", fileForm.name || file.name);
                          formData.append("type", fileForm.type || "auto");
                          try {
                            const res = await fetch(`/api/admin/projects/${params.id}/upload`, {
                              method: "POST",
                              body: formData,
                              credentials: "include",
                            });
                            if (!res.ok) throw new Error((await res.json()).message || "Error");
                            toast({ title: "Archivo subido a Drive" });
                            setShowAddFile(false);
                            setFileForm({ name: "", type: "document", url: "" });
                            invalidate();
                          } catch (err: any) {
                            toast({ title: err.message || "Error subiendo archivo", variant: "destructive" });
                          }
                        }}
                      >
                        {addFileMut.isPending ? "Subiendo..." : "Subir a Drive"}
                      </Button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* ── IDEAS ── */}
        {activeTab === "Ideas" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowAddIdea(true)}>
                <Lightbulb className="w-3.5 h-3.5 mr-1.5" /> Nueva idea
              </Button>
            </div>

            {ideas.length === 0 ? (
              <div className="text-center py-16">
                <Lightbulb className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Sin ideas registradas</p>
                <p className="text-xs text-gray-300 mt-1">Registra ideas, mejoras futuras y recomendaciones para el cliente.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ideas.map((idea: any) => {
                  const statusLabels: Record<string, string> = { suggested: "Sugerida", considering: "En evaluación", planned: "Planeada", implemented: "Implementada", dismissed: "Descartada" };
                  const statusColors: Record<string, string> = { suggested: "bg-gray-100 text-gray-600", considering: "bg-blue-100 text-blue-700", planned: "bg-purple-100 text-purple-700", implemented: "bg-emerald-100 text-emerald-700", dismissed: "bg-red-100 text-red-600" };
                  const prioColors: Record<string, string> = { high: "bg-red-50 text-red-600", medium: "bg-amber-50 text-amber-600", low: "bg-gray-50 text-gray-400" };
                  return (
                    <div key={idea.id} className="bg-white rounded-xl border border-gray-200 p-5 group">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                          <Lightbulb className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-gray-900">{idea.title}</h4>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[idea.status] || statusColors.suggested}`}>{statusLabels[idea.status] || idea.status}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${prioColors[idea.priority] || prioColors.medium}`}>{idea.priority}</span>
                            {idea.suggestedBy === "client" && <span className="text-[10px] bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full">Cliente</span>}
                          </div>
                          {idea.description && <p className="text-sm text-gray-500 mt-1">{idea.description}</p>}
                          {idea.votes > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                              <ThumbsUp className="w-3 h-3" /> {idea.votes} votos
                            </span>
                          )}
                        </div>
                        <Select value={idea.status} onValueChange={v => updateIdeaMut.mutate({ id: idea.id, data: { status: v } })}>
                          <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="suggested">Sugerida</SelectItem>
                            <SelectItem value="considering">En evaluación</SelectItem>
                            <SelectItem value="planned">Planeada</SelectItem>
                            <SelectItem value="implemented">Implementada</SelectItem>
                            <SelectItem value="dismissed">Descartada</SelectItem>
                          </SelectContent>
                        </Select>
                        <button onClick={() => deleteIdeaMut.mutate(idea.id)} className="p-1 text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Dialog open={showAddIdea} onOpenChange={setShowAddIdea}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader><DialogTitle>Nueva idea</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label>Título</Label>
                    <Input value={ideaForm.title} onChange={e => setIdeaForm(f => ({ ...f, title: e.target.value }))} placeholder="Chatbot de WhatsApp para ventas" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Descripción</Label>
                    <Textarea value={ideaForm.description} onChange={e => setIdeaForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Detalles de la idea..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Prioridad</Label>
                    <Select value={ideaForm.priority} onValueChange={v => setIdeaForm(f => ({ ...f, priority: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baja</SelectItem>
                        <SelectItem value="medium">Media</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full bg-[#2FA4A9] hover:bg-[#238b8f]"
                    disabled={!ideaForm.title}
                    onClick={() => addIdeaMut.mutate({ ...ideaForm, suggestedBy: "team" })}
                  >
                    Guardar idea
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
            {/* GitHub first — most visual impact */}
            <div className={`bg-white rounded-xl border p-6 space-y-4 ${project.aiTrackingEnabled ? "border-emerald-200 ring-1 ring-emerald-100" : "border-gray-200"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${project.aiTrackingEnabled ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                  <Github className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">GitHub — Auto-tracking con AI</h3>
                  <p className="text-xs text-gray-500">Conecta un repositorio para que el portal se actualice automáticamente.</p>
                </div>
                {project.aiTrackingEnabled && (
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    Activo
                  </span>
                )}
              </div>

              <GitHubRepoSelector projectId={params.id!} currentRepo={(project as any).githubRepoUrl} aiEnabled={project.aiTrackingEnabled} onConnected={invalidate} />
            </div>

            {/* Project settings */}
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

// ────────────────────────────────────────────────────────────
// Acceso del cliente — invitaciones + lista de cuentas con login
// ────────────────────────────────────────────────────────────

type ClientAccessUser = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  acceptedAt: string | null;
  lastLoginAt: string | null;
  invitedAt: string | null;
};

type PendingInvite = {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
};

function ClientAccessSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<{ users: ClientAccessUser[]; pendingInvites: PendingInvite[] }>({
    queryKey: [`/api/admin/projects/${projectId}/clients`],
  });

  const inviteMut = useMutation({
    mutationFn: async (body: { email: string; name?: string }) => {
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/invite-client`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✓ Invitación enviada" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${projectId}/clients`] });
      setInviteEmail("");
      setInviteName("");
      setInviteOpen(false);
    },
    onError: (err: any) => toast({ title: "Error invitando", description: err?.message, variant: "destructive" }),
  });

  const resendMut = useMutation({
    mutationFn: async (inviteId: string) => {
      await apiRequest("POST", `/api/admin/projects/${projectId}/invites/${inviteId}/resend`);
    },
    onSuccess: () => {
      toast({ title: "✓ Invitación reenviada" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${projectId}/clients`] });
    },
    onError: (err: any) => toast({ title: "Error reenviando", description: err?.message, variant: "destructive" }),
  });

  const unlinkMut = useMutation({
    mutationFn: async (clientId: string) => {
      await apiRequest("POST", `/api/admin/projects/${projectId}/clients/${clientId}/unlink`);
    },
    onSuccess: () => {
      toast({ title: "✓ Acceso revocado" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${projectId}/clients`] });
    },
    onError: (err: any) => toast({ title: "Error revocando", description: err?.message, variant: "destructive" }),
  });

  const users = data?.users || [];
  const pending = data?.pendingInvites || [];
  const total = users.length + pending.length;

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Email inválido", variant: "destructive" });
      return;
    }
    inviteMut.mutate({ email, name: inviteName.trim() || undefined });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#2FA4A9]" />
          <span className="text-sm font-semibold text-gray-900">Acceso del cliente</span>
          {total > 0 && (
            <span className="text-xs px-2 py-0.5 bg-[#2FA4A9]/10 text-[#2FA4A9] rounded-full font-medium">
              {users.length} con login{pending.length > 0 ? ` · ${pending.length} pendiente${pending.length === 1 ? "" : "s"}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); setInviteOpen(true); }}
            className="h-8 gap-1.5 bg-[#2FA4A9] hover:bg-[#238b8f] text-white text-xs"
          >
            <UserPlus className="w-3.5 h-3.5" /> Invitar cliente
          </Button>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-2">
          {isLoading ? (
            <p className="text-xs text-gray-400 py-2">Cargando...</p>
          ) : total === 0 ? (
            <p className="text-xs text-gray-400 py-2">
              Ningún cliente tiene login a este proyecto todavía. Envía una invitación para que pueda acceder con email + contraseña.
            </p>
          ) : (
            <>
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{u.name || u.email}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        u.status === "active" ? "bg-emerald-50 text-emerald-700" :
                        u.status === "invited" ? "bg-amber-50 text-amber-700" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {u.status === "active" ? "Activo" : u.status === "invited" ? "Invitado" : "Deshabilitado"}
                      </span>
                    </div>
                    {u.name && <p className="text-xs text-gray-500 truncate">{u.email}</p>}
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {u.lastLoginAt ? `Último login: ${format(parseISO(u.lastLoginAt), "d MMM yyyy HH:mm", { locale: es })}` : "Nunca ha entrado"}
                    </p>
                  </div>
                  <button
                    onClick={() => { if (confirm(`¿Revocar acceso de ${u.email} a este proyecto? La cuenta no se elimina, solo se desvincula.`)) unlinkMut.mutate(u.id); }}
                    className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Revocar acceso a este proyecto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {pending.map((inv) => {
                const expired = new Date(inv.expiresAt).getTime() < Date.now();
                return (
                  <div key={inv.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3 h-3 text-amber-500" />
                        <p className="text-sm font-medium text-gray-900 truncate">{inv.email}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          expired ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                        }`}>
                          {expired ? "Expirada" : "Invitación pendiente"}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Enviada {format(parseISO(inv.createdAt), "d MMM HH:mm", { locale: es })} · vence {format(parseISO(inv.expiresAt), "d MMM HH:mm", { locale: es })}
                      </p>
                    </div>
                    <button
                      onClick={() => resendMut.mutate(inv.id)}
                      disabled={resendMut.isPending}
                      className="p-1.5 rounded text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors disabled:opacity-50"
                      title="Reenviar invitación (genera link nuevo)"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar cliente al portal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <p className="text-sm text-gray-500">
              Le enviaremos un email con un link para configurar su contraseña. El link es válido por 7 días.
            </p>
            <div>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="cliente@empresa.com"
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="invite-name">Nombre (opcional)</Label>
              <Input
                id="invite-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Juan Pérez"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={inviteMut.isPending} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white">
                {inviteMut.isPending ? "Enviando..." : "Enviar invitación"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AnalyticsSection — conectar GA4 (cliente es propietario, IM3 lee)
// ─────────────────────────────────────────────────────────────────

type AnalyticsConnection = {
  configured: boolean;
  serviceAccountEmail: string | null;
  connection: {
    id: string;
    ga4PropertyId: string;
    propertyTimezone: string | null;
    status: "pending" | "connected" | "error";
    lastSyncedAt: string | null;
    lastError: string | null;
  } | null;
};

function AnalyticsSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [propertyId, setPropertyId] = useState("");
  const [showConnect, setShowConnect] = useState(false);

  const { data, isLoading } = useQuery<AnalyticsConnection>({
    queryKey: [`/api/admin/projects/${projectId}/analytics`],
  });

  const connectMut = useMutation({
    mutationFn: async (ga4PropertyId: string) => {
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/analytics/connect`, { ga4PropertyId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Conectado", description: "Backfill de últimos 30 días corriendo en background." });
      setShowConnect(false);
      setPropertyId("");
      queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${projectId}/analytics`] });
    },
    onError: (err: any) => {
      toast({ title: "No se pudo conectar", description: err?.message || "Verifica que el Property ID sea correcto y que el service account tenga permisos.", variant: "destructive" });
    },
  });

  const testMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/analytics/test`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Conexión OK" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${projectId}/analytics`] });
    },
    onError: (err: any) => {
      toast({ title: "Test falló", description: err?.message || "Sin acceso a la propiedad", variant: "destructive" });
    },
  });

  const syncMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/analytics/sync-now`);
      return res.json();
    },
    onSuccess: () => toast({ title: "Sync iniciado", description: "Verás los datos actualizados en unos segundos." }),
  });

  const disconnectMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/admin/projects/${projectId}/analytics`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Desconectado" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${projectId}/analytics`] });
    },
  });

  const copyInstructions = () => {
    const email = data?.serviceAccountEmail || "(service account email)";
    const text = `Hola, para conectar tu Google Analytics al portal de IM3:

1. Entra a analytics.google.com y selecciona tu propiedad
2. Click en "Admin" (engranaje abajo izquierda)
3. En la columna del medio, click "Property Access Management"
4. Click el botón "+" arriba a la derecha → "Add users"
5. Email a agregar: ${email}
6. Roles: marca "Viewer" (no necesita más)
7. Desmarca "Notify new users by email"
8. Click "Add"

Cuando lo hayas hecho, avísame y conecto tu GA4 al portal. ¡Gracias!`;
    navigator.clipboard.writeText(text);
    toast({ title: "Instrucciones copiadas", description: "Pegalas en WhatsApp/email al cliente." });
  };

  if (isLoading) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#2FA4A9]" />
          <h3 className="text-sm font-semibold text-gray-900">Analytics (Google Analytics 4)</h3>
        </div>
        {data?.connection?.status === "connected" && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Conectado
          </span>
        )}
        {data?.connection?.status === "error" && (
          <span className="inline-flex items-center gap-1 text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Error
          </span>
        )}
      </div>

      {!data?.configured && (
        <p className="text-xs text-amber-600">Service account de Google no configurado en el servidor (revisar GOOGLE_SERVICE_ACCOUNT_EMAIL en .env).</p>
      )}

      {data?.configured && !data.connection && !showConnect && (
        <div>
          <p className="text-xs text-gray-500 mb-3">Conecta el GA4 del cliente para mostrar métricas en su portal. El cliente debe agregar nuestro service account como Viewer en su propiedad GA4.</p>
          <Button size="sm" onClick={() => setShowConnect(true)} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white">
            Conectar GA4
          </Button>
        </div>
      )}

      {data?.configured && (showConnect || data.connection?.status === "error") && !data.connection?.status?.includes("connected") && (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-700 mb-2">📋 Pídele al cliente que haga estos 5 pasos en su Google Analytics:</p>
            <ol className="list-decimal list-inside text-xs text-gray-600 space-y-1 mb-3">
              <li>Entra a analytics.google.com → tu propiedad</li>
              <li>Admin → Property Access Management</li>
              <li>Click "+" → Add users</li>
              <li>
                Email: <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200 text-[11px]">{data.serviceAccountEmail || "(no configurado)"}</code>
              </li>
              <li>Role: <strong>Viewer</strong> (suficiente). Click Add.</li>
            </ol>
            <Button size="sm" variant="outline" onClick={copyInstructions} className="text-xs">
              <Copy className="w-3 h-3 mr-1.5" /> Copiar instrucciones para WhatsApp
            </Button>
          </div>

          <div>
            <Label htmlFor="ga4-property-id" className="text-xs">GA4 Property ID</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="ga4-property-id"
                placeholder="ej. 535230812"
                value={propertyId || data.connection?.ga4PropertyId || ""}
                onChange={(e) => setPropertyId(e.target.value)}
                className="text-sm"
              />
              <Button
                size="sm"
                onClick={() => connectMut.mutate(propertyId || data.connection?.ga4PropertyId || "")}
                disabled={connectMut.isPending || (!propertyId && !data.connection?.ga4PropertyId)}
                className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white"
              >
                {connectMut.isPending ? "Probando..." : "Probar y conectar"}
              </Button>
            </div>
            {data.connection?.lastError && (
              <p className="text-xs text-rose-600 mt-2">{data.connection.lastError}</p>
            )}
            <p className="text-[11px] text-gray-400 mt-1">Solo el número, no incluyas "properties/". Lo encuentras en GA4 → Admin → Property Settings.</p>
          </div>
        </div>
      )}

      {data?.connection?.status === "connected" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-400">Property ID</span>
              <div className="text-gray-900 font-mono">{data.connection.ga4PropertyId}</div>
            </div>
            <div>
              <span className="text-gray-400">Zona horaria</span>
              <div className="text-gray-900">{data.connection.propertyTimezone || "—"}</div>
            </div>
            <div className="col-span-2">
              <span className="text-gray-400">Último sync</span>
              <div className="text-gray-900">{data.connection.lastSyncedAt ? new Date(data.connection.lastSyncedAt).toLocaleString("es") : "Aún no se ha sincronizado"}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
              <RefreshCw className="w-3 h-3 mr-1.5" /> {syncMut.isPending ? "Sincronizando..." : "Sync ahora"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
              {testMut.isPending ? "Probando..." : "Probar conexión"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">
              Desconectar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
