import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Copy, ExternalLink, Plus, Trash2, Send, Clock, CheckCircle2, Circle, AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Github, CalendarDays, BarChart3, Diamond, TrendingUp, Package, MessageSquare, Timer, Mic, FolderOpen, Lightbulb, FileText, Image, File, ThumbsUp, X, UserPlus, Users, RefreshCw, Mail, Sparkles, Pencil, Wrench, Building2, GripVertical, History, Bot } from "lucide-react";
import { format, parseISO, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, eachMonthOfInterval, isSameDay, isSameMonth, addMonths, subMonths, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ToastAction } from "@/components/ui/toast";
import { EditableText } from "@/components/ui/editable-text";
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
      assigneeName: string | null;
      orderIndex: number;
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
    phaseId: string | null;
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

type DelivStatus = "pending" | "delivered" | "approved" | "rejected";

const DELIV_STATUS_META: Record<DelivStatus, { icon: typeof Circle; iconClass: string; ringClass: string; label: string; dotClass: string }> = {
  pending:   { icon: Circle,        iconClass: "text-gray-400",    ringClass: "ring-gray-200 hover:ring-gray-300 bg-white",         label: "Pendiente",  dotClass: "bg-gray-300" },
  delivered: { icon: Send,          iconClass: "text-blue-500",    ringClass: "ring-blue-200 hover:ring-blue-300 bg-blue-50/40",     label: "Entregado",  dotClass: "bg-blue-400" },
  approved:  { icon: CheckCircle2,  iconClass: "text-emerald-500", ringClass: "ring-emerald-200 hover:ring-emerald-300 bg-emerald-50/40", label: "Aprobado",  dotClass: "bg-emerald-400" },
  rejected:  { icon: AlertCircle,   iconClass: "text-red-500",     ringClass: "ring-red-200 hover:ring-red-300 bg-red-50/40",        label: "Rechazado",  dotClass: "bg-red-400" },
};

const DELIV_TYPE_META: Record<string, { icon: typeof Circle; label: string }> = {
  feature:  { icon: Sparkles, label: "Feature" },
  bugfix:   { icon: Wrench,   label: "Bug" },
  design:   { icon: Image,    label: "Diseño" },
  document: { icon: FileText, label: "Doc" },
  video:    { icon: Mic,      label: "Video" },
  other:    { icon: Diamond,  label: "Otro" },
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
  Actividad: History,
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

const tabs = ["Roadmap", "Actividad", "Timeline", "Calendario", "Entregas", "Horas", "Sesiones", "Archivos", "Ideas", "Mensajes", "Config"];

// Single source of truth for category metadata.
// avatarBg = solid color for the fixed-width avatar (keeps title baselines aligned).
// dotBg + textColor = tinted variants for the meta row underneath each title.
const ACTIVITY_CATEGORY_META: Record<string, {
  icon: typeof Circle;
  label: string;
  avatarBg: string;
  textColor: string;
  dotBg: string;
}> = {
  feature:        { icon: Sparkles,    label: "Nueva funcionalidad", avatarBg: "bg-emerald-500", textColor: "text-emerald-700", dotBg: "bg-emerald-500" },
  bugfix:         { icon: AlertCircle, label: "Bug fix",             avatarBg: "bg-red-500",     textColor: "text-red-700",     dotBg: "bg-red-500"     },
  improvement:    { icon: TrendingUp,  label: "Mejora",              avatarBg: "bg-blue-500",    textColor: "text-blue-700",    dotBg: "bg-blue-500"    },
  infrastructure: { icon: Building2,   label: "Infraestructura",     avatarBg: "bg-purple-500",  textColor: "text-purple-700",  dotBg: "bg-purple-500"  },
  meeting:        { icon: Users,       label: "Reunión",             avatarBg: "bg-amber-500",   textColor: "text-amber-700",   dotBg: "bg-amber-500"   },
  milestone:      { icon: Diamond,     label: "Hito",                avatarBg: "bg-pink-500",    textColor: "text-pink-700",    dotBg: "bg-pink-500"    },
};

const ACTIVITY_SOURCE_META: Record<string, { label: string; icon: typeof Circle; color: string }> = {
  github_webhook: { label: "GitHub", icon: Github,   color: "text-gray-700" },
  manual:         { label: "Manual", icon: Pencil,   color: "text-blue-600" },
  system:         { label: "Sistema", icon: Sparkles, color: "text-purple-600" },
};

type ActivityEntry = {
  id: string;
  projectId: string;
  phaseId: string | null;
  source: string;
  commitShas: string[] | null;
  summaryLevel1: string;
  summaryLevel2: string | null;
  summaryLevel3: string | null;
  category: string;
  aiGenerated: boolean;
  isSignificant: boolean;
  createdAt: string;
};

type WeeklySummaryMessage = {
  id: string;
  content: string;
  createdAt: string;
};

function timeAgoEs(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)}d`;
  return format(d, "d MMM yyyy", { locale: es });
}

type GithubRepo = {
  id: number;
  fullName: string;
  url: string;
  description: string | null;
  isPrivate: boolean;
  updatedAt: string;
};

/**
 * Sortable row wrapper. Renders the children with drag-handle props.
 * Disable when sort is not "manual" so users can't reorder while a sort is applied.
 */
function SortableRow({ id, disabled, children }: {
  id: string;
  disabled?: boolean;
  children: (args: { handleListeners: Record<string, unknown> | undefined; isDragging: boolean }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : "auto",
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children({ handleListeners: disabled ? undefined : listeners, isDragging })}
    </div>
  );
}

function AssigneeChip({ value, onSave }: { value: string | null; onSave: (next: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  // Sync draft from external value, but only when not editing — avoid clobbering user input mid-typing.
  useEffect(() => { if (!editing) setDraft(value ?? ""); }, [value, editing]);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { const v = draft.trim(); if (v !== (value ?? "")) onSave(v || null); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === "Enter") { e.currentTarget.blur(); }
          if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
        }}
        placeholder="Nombre"
        className="text-[10px] border border-gray-300 rounded px-1.5 py-0.5 outline-none focus:border-[#2FA4A9] w-24"
      />
    );
  }

  if (!value) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[10px] text-gray-400 hover:text-[#2FA4A9] inline-flex items-center gap-0.5 transition-colors"
        aria-label="Asignar a alguien"
      >
        <UserPlus className="w-3 h-3" /> asignar
      </button>
    );
  }

  const initial = value.trim().charAt(0).toUpperCase() || "?";
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-full pl-0.5 pr-2 py-0.5 transition-colors max-w-[140px]"
      title={`Asignado a ${value} — clic para cambiar`}
    >
      <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[9px] font-semibold shrink-0">{initial}</span>
      <span className="truncate">{value}</span>
    </button>
  );
}

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
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              const res = await apiRequest("POST", `/api/admin/projects/${projectId}/analyze`);
              const data = await res.json().catch(() => ({}));
              onConnected();
              toast({
                title: data?.results > 0 ? `${data.results} entrada(s) generada(s)` : "Análisis completado",
                description: data?.message || "Mira el tab Actividad para ver los resúmenes",
              });
            } catch (err: any) {
              toast({ title: "Error analizando", description: err?.message, variant: "destructive" });
            }
          }}>
            <Bot className="w-3.5 h-3.5 mr-1.5" />
            Analizar commits
          </Button>
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              const res = await apiRequest("POST", `/api/admin/projects/${projectId}/weekly-summary`);
              const data = await res.json().catch(() => ({}));
              onConnected();
              toast({ title: "Resumen semanal generado", description: "Disponible en el tab Actividad" });
              if (data?.summary) {
                window.dispatchEvent(new CustomEvent("im3:show-weekly-summary", { detail: { summary: data.summary } }));
              }
            } catch (err: any) {
              toast({ title: "Error generando resumen", description: err?.message, variant: "destructive" });
            }
          }}>
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Resumen semanal
          </Button>
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
  const [delivFilter, setDelivFilter] = useState<"all" | "pending" | "delivered" | "approved" | "rejected">("all");
  const [delivStatusMenu, setDelivStatusMenu] = useState<string | null>(null);

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

  // Activity feed (timeline de cambios — commits, manual entries, sistema)
  const [showManualActivity, setShowManualActivity] = useState(false);
  const [manualActivityForm, setManualActivityForm] = useState({
    summaryLevel1: "",
    summaryLevel2: "",
    summaryLevel3: "",
    category: "feature",
    phaseId: "",
    isSignificant: false,
  });
  const [activityFilter, setActivityFilter] = useState<string>("all"); // all | <category> | manual | github_webhook
  const [expandedActivity, setExpandedActivity] = useState<Set<string>>(new Set());
  const [showLevel3, setShowLevel3] = useState<Set<string>>(new Set());
  const [weeklySummaryModal, setWeeklySummaryModal] = useState<{ open: boolean; summary: string | null; date?: string }>({ open: false, summary: null });

  // Messages
  const [msgContent, setMsgContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // AI phase generation (fresh / append) — multi-step flow:
  // step "brief": user writes brief + selects repo
  // step "questions": Claude asks 3-5 clarifying questions
  // step "generating": AI is designing phases / generating tasks
  // step "repo-failed": fases creadas pero el repo seleccionado no se pudo leer — surface explícito
  const [showAIPhase, setShowAIPhase] = useState<false | "fresh" | "append">(false);
  const [aiPhaseStep, setAIPhaseStep] = useState<"brief" | "questions" | "generating" | "repo-failed">("brief");
  const [aiPhaseForm, setAIPhaseForm] = useState({ brief: "", githubRepoUrl: "" });
  const [aiClarifyQuestions, setAIClarifyQuestions] = useState<Array<{ id: string; question: string; hint?: string; options?: string[] }>>([]);
  const [aiClarifyAnswers, setAIClarifyAnswers] = useState<Record<string, string>>({});
  const [aiGenStep, setAIGenStep] = useState<0 | 1 | 2 | 3>(0); // 0=idle, 1=reading repo, 2=designing phases, 3=generating tasks
  // Track if the user wanted the repo read but the backend couldn't load it.
  // Surfaces a persistent warning rather than a silent failure.
  const [aiRepoLoadFailed, setAIRepoLoadFailed] = useState(false);
  const [aiPhaseResult, setAIPhaseResult] = useState<{ phasesCreated: number; tasksCreated: number; mode: string } | null>(null);

  // Editar info del proyecto (cliente, tipo, repo, etc.)
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [editInfoForm, setEditInfoForm] = useState({
    name: "",
    contactId: "",
    projectType: "client" as "client" | "internal",
    githubRepoUrl: "",
    totalBudget: "",
    currency: "USD",
    status: "planning",
  });

  // Edit project
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  // Confirm-before-destroy: holds the entity awaiting user confirmation. Cleared on confirm/cancel.
  type PendingDelete =
    | { kind: "phase"; id: string; name: string; taskCount: number; deliverableCount: number }
    | { kind: "task"; id: string; title: string }
    | { kind: "deliverable"; id: string; title: string };
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
  // Per-phase filter and sort (Roadmap)
  type PhaseFilter = "all" | "pending" | "overdue" | "completed";
  type PhaseSort = "manual" | "date" | "priority";
  const [phaseFilter, setPhaseFilter] = useState<Record<string, PhaseFilter>>({});
  const [phaseSort, setPhaseSort] = useState<Record<string, PhaseSort>>({});

  // Queries que dependen de los modals (se cargan solo si están abiertos)
  const { data: githubStatus } = useQuery<{ configured: boolean; connected: boolean; githubUsername: string | null }>({
    queryKey: ["/api/admin/github/status"],
    enabled: showAIPhase !== false || showEditInfo,
  });

  const { data: githubRepos = [] } = useQuery<Array<{ id: number; fullName: string; url: string; description: string | null; isPrivate: boolean }>>({
    queryKey: ["/api/admin/github/repos"],
    enabled: (showAIPhase !== false || showEditInfo) && !!githubStatus?.connected,
  });

  const { data: contactsList = [] } = useQuery<Array<{ id: string; nombre: string; empresa: string }>>({
    queryKey: ["/api/admin/contacts"],
    select: (data: any) => (Array.isArray(data) ? data : data?.contacts || []),
    enabled: showEditInfo,
  });

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
      setEditInfoForm({
        name: project.name,
        contactId: project.contactId || "",
        projectType: ((project as any).projectType || "client") as "client" | "internal",
        githubRepoUrl: project.githubRepoUrl || "",
        totalBudget: project.totalBudget?.toString() || "",
        currency: project.currency,
        status: project.status,
      });
      // Auto-expand all phases
      setExpandedPhases(new Set(project.phases.map(p => p.id)));
    }
  }, [project]);

  useEffect(() => {
    if (activeTab === "Mensajes") messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeTab, project?.messages]);

  // Hydrate AI phase form when the modal opens (bug 1A: pick up project's saved repo)
  // and reset clarification state so each modal opening starts fresh.
  useEffect(() => {
    if (showAIPhase !== false && project) {
      setAIPhaseForm({ brief: "", githubRepoUrl: project.githubRepoUrl || "" });
      setAIPhaseStep("brief");
      setAIClarifyQuestions([]);
      setAIClarifyAnswers({});
      setAIGenStep(0);
      setAIRepoLoadFailed(false);
      setAIPhaseResult(null);
    }
  }, [showAIPhase, project?.githubRepoUrl]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${params.id}`] });

  // Mutations
  const addPhaseMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("POST", `/api/admin/projects/${params.id}/phases`, data); },
    onSuccess: () => { invalidate(); setShowAddPhase(false); setPhaseForm({ name: "", description: "", estimatedHours: "", startDate: "", endDate: "" }); },
  });

  const clarifyBriefMut = useMutation({
    mutationFn: async (data: { brief: string; githubRepoUrl?: string; mode: "fresh" | "append" }) => {
      const res = await apiRequest("POST", `/api/admin/projects/${params.id}/clarify-brief`, data);
      return res.json();
    },
    onSuccess: (data: { questions: Array<{ id: string; question: string; hint?: string; options?: string[] }>; repoLoaded: boolean }) => {
      setAIClarifyQuestions(data.questions || []);
      // Si el usuario seleccionó repo pero el backend no pudo cargarlo, dejar evidencia
      // visible en el step "questions" en vez de fallar silenciosamente.
      const repoWasRequested = !!aiPhaseForm.githubRepoUrl;
      setAIRepoLoadFailed(repoWasRequested && data.repoLoaded === false);
      setAIPhaseStep("questions");
    },
    onError: (err: any) => {
      toast({ title: "Error generando preguntas", description: err?.message, variant: "destructive" });
    },
  });

  const generatePhasesAIMut = useMutation({
    mutationFn: async (data: {
      brief: string;
      githubRepoUrl?: string;
      mode: "fresh" | "append";
      clarifications?: Array<{ question: string; answer: string }>;
    }) => {
      const res = await apiRequest("POST", `/api/admin/projects/${params.id}/generate-phases`, data);
      return res.json();
    },
    onSuccess: (data: { mode: string; phasesCreated?: number; tasksCreated?: number; repoLoaded?: boolean }) => {
      invalidate();
      const repoWasRequested = !!(aiPhaseForm.githubRepoUrl || project?.githubRepoUrl);
      const repoFailed = repoWasRequested && data.repoLoaded === false;

      // Surface el fallo del repo en el modal en vez de cerrar silenciosamente.
      // Las fases YA se crearon; el usuario decide si las acepta o regenera.
      if (repoFailed) {
        setAIPhaseResult({
          mode: data.mode,
          phasesCreated: data.phasesCreated ?? 0,
          tasksCreated: data.tasksCreated ?? 0,
        });
        setAIPhaseStep("repo-failed");
        return;
      }

      setShowAIPhase(false);
      toast({
        title: data.mode === "fresh" ? "Fases generadas con IA" : "Fase añadida con IA",
        description: `${data.phasesCreated ?? 0} fases · ${data.tasksCreated ?? 0} tareas${data.repoLoaded ? " · repo leído" : ""}`,
      });
    },
    onError: (err: any) => {
      setAIPhaseStep("questions");
      toast({ title: "Error generando fases", description: err?.message, variant: "destructive" });
    },
  });

  // Optimistic step animation when "generating": cycle through "leyendo repo / diseñando / tareas".
  useEffect(() => {
    if (aiPhaseStep !== "generating") return;
    const hasRepo = !!(aiPhaseForm.githubRepoUrl || project?.githubRepoUrl);
    setAIGenStep(hasRepo ? 1 : 2);
    const t1 = hasRepo ? setTimeout(() => setAIGenStep(2), 6000) : null;
    const t2 = setTimeout(() => setAIGenStep(3), hasRepo ? 14000 : 10000);
    return () => { if (t1) clearTimeout(t1); clearTimeout(t2); };
  }, [aiPhaseStep, aiPhaseForm.githubRepoUrl, project?.githubRepoUrl]);

  const updateProjectInfoMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/admin/projects/${params.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setShowEditInfo(false);
      toast({ title: "Información del proyecto actualizada" });
    },
    onError: (err: any) => {
      toast({ title: "Error actualizando proyecto", description: err?.message, variant: "destructive" });
    },
  });

  const addTaskMut = useMutation({
    mutationFn: async ({ phaseId, data }: { phaseId: string; data: Record<string, unknown> }) => { await apiRequest("POST", `/api/admin/phases/${phaseId}/tasks`, data); },
    onSuccess: () => { invalidate(); setAddingTaskPhase(null); setTaskForm({ title: "", priority: "medium", dueDate: "", isMilestone: false }); },
  });

  const updateTaskMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => { await apiRequest("PATCH", `/api/admin/tasks/${id}`, data); },
    onSuccess: invalidate,
  });

  const restoreTaskMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/admin/tasks/${id}/restore`); },
    onSuccess: () => { invalidate(); toast({ title: "Tarea restaurada" }); },
  });

  const deleteTaskMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/tasks/${id}`); },
    onSuccess: (_data, taskId) => {
      invalidate();
      toast({
        title: "Tarea eliminada",
        description: "Puedes deshacer si fue por error.",
        action: (
          <ToastAction altText="Deshacer" onClick={() => restoreTaskMut.mutate(taskId)}>
            Deshacer
          </ToastAction>
        ),
      });
    },
  });

  const updatePhaseMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => { await apiRequest("PATCH", `/api/admin/phases/${id}`, data); },
    onSuccess: invalidate,
  });

  // Drag-to-reorder mutations
  const reorderTasksMut = useMutation({
    mutationFn: async ({ phaseId, taskIds }: { phaseId: string; taskIds: string[] }) => {
      await apiRequest("POST", `/api/admin/phases/${phaseId}/reorder-tasks`, { taskIds });
    },
    onSuccess: invalidate,
    onError: () => { invalidate(); toast({ title: "No se pudo reordenar — recargado", variant: "destructive" }); },
  });
  const reorderPhasesMut = useMutation({
    mutationFn: async ({ phaseIds }: { phaseIds: string[] }) => {
      await apiRequest("POST", `/api/admin/projects/${params.id}/reorder-phases`, { phaseIds });
    },
    onSuccess: invalidate,
    onError: () => { invalidate(); toast({ title: "No se pudo reordenar — recargado", variant: "destructive" }); },
  });

  const restorePhaseMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/admin/phases/${id}/restore`); },
    onSuccess: () => { invalidate(); toast({ title: "Fase restaurada", description: "Tareas y entregables recuperados." }); },
  });

  const deletePhaseMut = useMutation({
    mutationFn: async ({ id, taskCount }: { id: string; taskCount: number }) => {
      await apiRequest("DELETE", `/api/admin/phases/${id}`);
      return { id, taskCount };
    },
    onSuccess: (result) => {
      invalidate();
      toast({
        title: "Fase eliminada",
        description: result.taskCount > 0 ? `${result.taskCount} tarea${result.taskCount === 1 ? "" : "s"} también ocultadas. Puedes deshacer.` : "Puedes deshacer si fue por error.",
        action: (
          <ToastAction altText="Deshacer" onClick={() => restorePhaseMut.mutate(result.id)}>
            Deshacer
          </ToastAction>
        ),
      });
    },
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

  // Activity feed
  const { data: activityEntries = [], isLoading: activityLoading } = useQuery<ActivityEntry[]>({
    queryKey: [`/api/admin/projects/${params.id}/activity`],
    enabled: activeTab === "Actividad",
  });
  const { data: weeklySummaries = [] } = useQuery<WeeklySummaryMessage[]>({
    queryKey: [`/api/admin/projects/${params.id}/weekly-summaries`],
    enabled: activeTab === "Actividad",
  });
  const invalidateActivity = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${params.id}/activity`] });
    queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${params.id}/weekly-summaries`] });
  };

  const addManualActivityMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/admin/projects/${params.id}/activity`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateActivity();
      setShowManualActivity(false);
      setManualActivityForm({ summaryLevel1: "", summaryLevel2: "", summaryLevel3: "", category: "feature", phaseId: "", isSignificant: false });
      toast({ title: "Actividad registrada" });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "No se pudo registrar", variant: "destructive" }),
  });

  const deleteActivityMut = useMutation({
    mutationFn: async (entryId: string) => { await apiRequest("DELETE", `/api/admin/projects/${params.id}/activity/${entryId}`); },
    onSuccess: () => { invalidateActivity(); toast({ title: "Entrada eliminada" }); },
  });

  const analyzeCommitsMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/projects/${params.id}/analyze`);
      return res.json() as Promise<{ message: string; results: number }>;
    },
    onSuccess: (data) => {
      invalidateActivity();
      toast({
        title: data.results > 0 ? `${data.results} entrada(s) generada(s)` : "Análisis completado",
        description: data.message,
      });
    },
    onError: (err: any) => toast({ title: "Error analizando commits", description: err?.message, variant: "destructive" }),
  });

  const generateWeeklySummaryMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/projects/${params.id}/weekly-summary`);
      return res.json() as Promise<{ message: string; summary: string }>;
    },
    onSuccess: (data) => {
      invalidateActivity();
      setWeeklySummaryModal({ open: true, summary: data.summary, date: new Date().toISOString() });
    },
    onError: (err: any) => toast({ title: "No se pudo generar resumen", description: err?.message || "Sin actividad esta semana", variant: "destructive" }),
  });

  // Listener para abrir el modal del resumen cuando se dispara desde GitHubRepoSelector
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ summary: string }>;
      if (ce.detail?.summary) {
        setWeeklySummaryModal({ open: true, summary: ce.detail.summary, date: new Date().toISOString() });
      }
    };
    window.addEventListener("im3:show-weekly-summary", handler);
    return () => window.removeEventListener("im3:show-weekly-summary", handler);
  }, []);

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

  // ── Drag-and-drop sensors ──
  // - PointerSensor with distance 8: regular click doesn't trigger drag
  // - TouchSensor with delay 250ms: tap-to-edit still works on mobile, long-press starts drag
  // - KeyboardSensor: accessibility (Space + arrows)
  // MUST be declared before any conditional return below to satisfy Rules of Hooks
  // (otherwise the hook count differs between the loading render and the loaded
  // render → React error #310).
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  const handlePhaseDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = project.phases.findIndex(p => p.id === active.id);
    const newIndex = project.phases.findIndex(p => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(project.phases, oldIndex, newIndex);
    reorderPhasesMut.mutate({ phaseIds: newOrder.map(p => p.id) });
  };

  const handleTaskDragEnd = (phaseId: string, allPhaseTasks: { id: string }[]) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = allPhaseTasks.findIndex(t => t.id === active.id);
    const newIndex = allPhaseTasks.findIndex(t => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(allPhaseTasks, oldIndex, newIndex);
    reorderTasksMut.mutate({ phaseId, taskIds: newOrder.map(t => t.id) });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <button onClick={() => navigate("/admin/projects")} className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors shrink-0" aria-label="Volver">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{project.name}</h1>
            {project.contactName && <p className="text-sm text-gray-500 mt-0.5 truncate">{project.contactName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-start shrink-0">
          <button
            onClick={copyPortalLink}
            className="group p-2 rounded-lg text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 active:scale-[0.95] transition-all"
            title="Copiar link portal del cliente (legacy)"
            aria-label="Copiar link portal"
          >
            <Copy className="w-4 h-4 group-hover:scale-110 transition-transform" />
          </button>
          <button
            onClick={() => setShowEditInfo(true)}
            className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 hover:shadow-sm active:scale-[0.97] transition-all"
            title="Editar información del proyecto"
            aria-label="Editar"
          >
            <Pencil className="w-3.5 h-3.5 group-hover:rotate-6 transition-transform" />
            <span className="hidden sm:inline">Editar</span>
          </button>
          <a
            href={`/portal/projects/${project.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-lg bg-[#2FA4A9] text-white text-sm font-medium hover:bg-[#238b8f] hover:shadow-md active:scale-[0.97] transition-all"
            title="Abre el portal completo como lo ve el cliente (con tab Analytics)"
            aria-label="Ver como cliente"
          >
            <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            <span className="hidden sm:inline">Ver como cliente</span>
            <span className="sm:hidden">Ver</span>
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
            className="group bg-amber-600 hover:bg-amber-700 hover:shadow-md text-white shrink-0 active:scale-[0.97] transition-all"
            onClick={() => activateProjectMut.mutate()}
            disabled={activateProjectMut.isPending}
          >
            {activateProjectMut.isPending ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Activando...
              </>
            ) : (
              <>
                Activar portal
                <span className="ml-1 group-hover:translate-x-0.5 transition-transform">→</span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* Stats bar — cada card con sublinea contextual + mini-barra cuando aplica */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {(() => {
          const approvedDeliv = project.deliverables.filter(d => d.status === "approved").length;
          const totalDeliv = project.deliverables.length;
          const delivPct = totalDeliv > 0 ? Math.round((approvedDeliv / totalDeliv) * 100) : 0;
          const completedTasks = project.phases.reduce((s, p) => s + p.tasks.filter(t => t.status === "completed").length, 0);
          const totalTasks = project.phases.reduce((s, p) => s + p.tasks.length, 0);
          return [
            {
              label: "Progreso",
              value: `${project.progress}%`,
              hint: totalTasks > 0 ? `${completedTasks}/${totalTasks} tareas` : "Sin tareas todavía",
              icon: TrendingUp,
              color: "bg-teal-50 text-teal-600",
              accent: "#2FA4A9",
              barPct: project.progress,
            },
            {
              label: "Horas",
              value: project.totalHours.toFixed(1),
              hint: project.totalHours > 0 ? "estimadas + registradas" : "Aún sin horas",
              icon: Timer,
              color: "bg-blue-50 text-blue-600",
              accent: "#3B82F6",
              barPct: null,
            },
            {
              label: "Entregas",
              value: `${approvedDeliv}/${totalDeliv}`,
              hint: totalDeliv > 0 ? `${delivPct}% aprobadas` : "Sin entregas",
              icon: Package,
              color: "bg-purple-50 text-purple-600",
              accent: "#8B5CF6",
              barPct: totalDeliv > 0 ? delivPct : null,
            },
            {
              label: "Mensajes",
              value: project.messages.length.toString(),
              hint: project.messages.length === 0 ? "Sin mensajes" : `del cliente y equipo`,
              icon: MessageSquare,
              color: "bg-amber-50 text-amber-600",
              accent: "#D97706",
              barPct: null,
            },
          ];
        })().map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 md:p-4 relative overflow-hidden group hover:shadow-md hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] md:text-[11px] text-gray-400 font-semibold uppercase tracking-wider truncate">{s.label}</p>
                  <p className="text-xl md:text-2xl font-bold text-gray-900 mt-0.5 md:mt-1 tabular-nums">{s.value}</p>
                  <p className="text-[10px] md:text-[11px] text-gray-400 mt-0.5 truncate">{s.hint}</p>
                </div>
                <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl ${s.color} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-4 h-4 md:w-5 md:h-5" />
                </div>
              </div>
              {s.barPct !== null && (
                <div className="mt-2 md:mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${s.barPct}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: s.accent }}
                  />
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

      {/* Reportes / Sugerencias del cliente */}
      <ProjectFeedbackSection projectId={project.id} />

      {/* Calendario de reuniones del proyecto */}
      <MeetingsSection projectId={project.id} />

      {/* Tabs — con icono + count badge (mensajes, entregas pendientes) y dot
          rojo si hay actividad sin atender (mensajes del cliente sin leer). */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto scroll-smooth scrollbar-thin -mx-4 px-4 sm:mx-0 sm:px-0">
        {tabs.map(t => {
          const TabIcon = TAB_ICONS[t] || Circle;
          // Tab metadata — count opcional, dot rojo cuando hay item nuevo
          let count: number | null = null;
          let hasUrgent = false;
          if (t === "Mensajes") {
            const fromClient = project.messages.filter(m => m.senderType === "client" && !m.isRead).length;
            count = project.messages.length || null;
            hasUrgent = fromClient > 0;
          } else if (t === "Entregas") {
            count = project.deliverables.length || null;
          } else if (t === "Roadmap") {
            count = project.phases.length || null;
          }
          const isActive = activeTab === t;
          return (
            <button
              key={t}
              onClick={(e) => {
                setActiveTab(t);
                e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
              }}
              className={`relative px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
                isActive
                  ? "border-[#2FA4A9] text-[#2FA4A9]"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
              }`}
            >
              <TabIcon className={`w-3.5 h-3.5 transition-transform ${isActive ? "scale-110" : ""}`} />
              {t}
              {count !== null && count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold tabular-nums transition-colors ${
                  isActive
                    ? "bg-[#2FA4A9]/10 text-[#2FA4A9]"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {count}
                </span>
              )}
              {hasUrgent && (
                <span
                  className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse"
                  title="Mensajes sin leer del cliente"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {/* ── ROADMAP ── */}
        {activeTab === "Roadmap" && (
          <div className="space-y-4">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                className="group hover:border-gray-400 hover:bg-gray-50 hover:shadow-sm active:scale-[0.97] transition-all"
                onClick={() => {
                  apiRequest("POST", `/api/admin/projects/${params.id}/auto-dates`, { force: true })
                    .then(() => { invalidate(); toast({ title: "Fechas distribuidas automáticamente" }); })
                    .catch(() => toast({ title: "Error distribuyendo fechas", variant: "destructive" }));
                }}
              >
                <Clock className="w-3.5 h-3.5 sm:mr-1.5 group-hover:rotate-12 transition-transform" />
                <span className="hidden sm:inline">Auto-fechas</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAIPhase("append")}
                className="group border-[#2FA4A9]/30 text-[#2FA4A9] hover:bg-[#2FA4A9]/10 hover:border-[#2FA4A9] hover:shadow-sm active:scale-[0.97] transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5 group-hover:scale-110 transition-transform" />
                Fase IA
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddPhase(true)}
                className="group hover:border-gray-400 hover:bg-gray-50 hover:shadow-sm active:scale-[0.97] transition-all"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5 group-hover:rotate-90 transition-transform" />
                Fase manual
              </Button>
            </div>

            {project.phases.length === 0 ? (
              <div className="text-center py-12 space-y-4 bg-gradient-to-br from-[#2FA4A9]/5 to-transparent rounded-xl border border-dashed border-[#2FA4A9]/20">
                <div className="w-14 h-14 rounded-2xl bg-[#2FA4A9]/10 text-[#2FA4A9] flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-gray-900">Aún no hay fases en este proyecto</p>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    Describe hacia dónde va el proyecto y deja que Claude diseñe 3-6 fases con tareas y entregables.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
                  <Button
                    onClick={() => setShowAIPhase("fresh")}
                    className="group bg-[#2FA4A9] hover:bg-[#238b8f] hover:shadow-md active:scale-[0.97] transition-all gap-2"
                  >
                    <Sparkles className="w-4 h-4 group-hover:scale-110 group-hover:rotate-12 transition-transform" />
                    Generar fases con IA
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowAddPhase(true)}
                    className="group hover:border-gray-400 hover:bg-gray-50 hover:shadow-sm active:scale-[0.97] transition-all gap-2"
                  >
                    <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                    Crear manualmente
                  </Button>
                </div>
              </div>
            ) : (
              <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handlePhaseDragEnd}>
                <SortableContext items={project.phases.map(p => p.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {project.phases.map((phase, idx) => {
                  const isExpanded = expandedPhases.has(phase.id);
                  const completed = phase.tasks.filter(t => t.status === "completed").length;
                  const phaseProgress = phase.tasks.length > 0 ? Math.round((completed / phase.tasks.length) * 100) : 0;

                  // Phase summary calcs (vencidas / esta semana)
                  const phaseToday = new Date();
                  phaseToday.setHours(0, 0, 0, 0);
                  const weekFromNow = new Date(phaseToday);
                  weekFromNow.setDate(weekFromNow.getDate() + 7);
                  const overdueCount = phase.tasks.filter(t => t.dueDate && t.status !== "completed" && new Date(t.dueDate) < phaseToday).length;
                  const thisWeekCount = phase.tasks.filter(t => {
                    if (!t.dueDate || t.status === "completed") return false;
                    const due = new Date(t.dueDate);
                    return due >= phaseToday && due <= weekFromNow;
                  }).length;

                  // Filter + sort
                  const filterKey: PhaseFilter = phaseFilter[phase.id] || "all";
                  const sortKey: PhaseSort = phaseSort[phase.id] || "manual";
                  let visibleTasks = phase.tasks;
                  if (filterKey === "pending") visibleTasks = visibleTasks.filter(t => t.status !== "completed");
                  else if (filterKey === "overdue") visibleTasks = visibleTasks.filter(t => t.dueDate && t.status !== "completed" && new Date(t.dueDate) < phaseToday);
                  else if (filterKey === "completed") visibleTasks = visibleTasks.filter(t => t.status === "completed");

                  if (sortKey === "date") {
                    visibleTasks = [...visibleTasks].sort((a, b) => {
                      if (!a.dueDate && !b.dueDate) return 0;
                      if (!a.dueDate) return 1;
                      if (!b.dueDate) return -1;
                      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                    });
                  } else if (sortKey === "priority") {
                    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
                    visibleTasks = [...visibleTasks].sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
                  }

                  // Status visual: drives the colored rail on the left edge of the card
                  // and the color of the progress bar so each phase is scannable at a glance.
                  const statusVisual = phase.status === "completed"
                    ? { rail: "bg-emerald-500", bar: "bg-emerald-500", chipBg: "bg-emerald-500", chipText: "text-white" }
                    : phase.status === "in_progress"
                      ? { rail: "bg-[#2FA4A9]", bar: "bg-[#2FA4A9]", chipBg: "bg-[#2FA4A9]", chipText: "text-white" }
                      : { rail: "bg-gray-300", bar: "bg-gray-300", chipBg: "bg-gray-100", chipText: "text-gray-500" };
                  return (
                    <SortableRow key={phase.id} id={phase.id}>
                      {({ handleListeners }) => (
                    <div className="relative bg-white rounded-xl border border-gray-200 overflow-hidden transition-all hover:shadow-md hover:border-gray-300">
                      {/* Status rail — color del estado en el borde izquierdo, escaneable al
                          recorrer el roadmap sin tener que leer cada chip individual */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusVisual.rail}`} aria-hidden="true" />
                      {/* Phase header */}
                      <div
                        className="flex items-start gap-2 sm:gap-3 px-3 sm:px-5 py-3 sm:py-4 cursor-pointer hover:bg-gray-50/60 transition-colors"
                        onClick={() => togglePhase(phase.id)}
                      >
                        {/* Drag handle (long-press on mobile, click+drag on desktop) */}
                        <button
                          {...(handleListeners || {})}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 shrink-0 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none transition-colors"
                          aria-label="Reordenar fase"
                        >
                          <GripVertical className="w-4 h-4" />
                        </button>
                        <div className="mt-1 shrink-0">
                          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                        </div>
                        <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center justify-center min-w-[42px] px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold rounded ${statusVisual.chipBg} ${statusVisual.chipText} tracking-wide`}>FASE {idx + 1}</span>
                            <h3 className="font-medium text-gray-900 break-words">
                              <EditableText
                                value={phase.name}
                                kind="phase-name"
                                onSave={(name) => new Promise<void>((resolve, reject) => {
                                  updatePhaseMut.mutate(
                                    { id: phase.id, data: { name } },
                                    { onSuccess: () => resolve(), onError: (err) => reject(err) }
                                  );
                                })}
                              />
                            </h3>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5 break-words">
                            <EditableText
                              value={phase.description || ""}
                              kind="phase-description"
                              multiline
                              placeholder="Sin descripción — clic para añadir"
                              size="sm"
                              onSave={(description) => new Promise<void>((resolve, reject) => {
                                updatePhaseMut.mutate(
                                  { id: phase.id, data: { description } },
                                  { onSuccess: () => resolve(), onError: (err) => reject(err) }
                                );
                              })}
                            />
                          </div>
                          {(phase.startDate || phase.endDate) && (
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {phase.startDate ? new Date(phase.startDate).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "?"} — {phase.endDate ? new Date(phase.endDate).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "?"}
                            </p>
                          )}
                          {/* Summary chips: vencidas / esta semana */}
                          {(overdueCount > 0 || thisWeekCount > 0) && (
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {overdueCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                  <AlertCircle className="w-3 h-3" /> {overdueCount} vencida{overdueCount === 1 ? "" : "s"}
                                </span>
                              )}
                              {thisWeekCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                  <Clock className="w-3 h-3" /> {thisWeekCount} esta semana
                                </span>
                              )}
                            </div>
                          )}
                          {/* Mobile: compact progress + status under metadata */}
                          <div className="flex items-center gap-2 mt-2 sm:hidden">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full ${statusVisual.bar} rounded-full transition-all duration-500`} style={{ width: `${phaseProgress}%` }} />
                            </div>
                            <span className="text-[11px] text-gray-500 font-medium tabular-nums w-9 text-right">{phaseProgress}%</span>
                            <Select
                              value={phase.status}
                              onValueChange={v => { updatePhaseMut.mutate({ id: phase.id, data: { status: v } }); }}
                            >
                              <SelectTrigger className="h-7 w-28 text-xs shrink-0" onClick={e => e.stopPropagation()}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pendiente</SelectItem>
                                <SelectItem value="in_progress">En progreso</SelectItem>
                                <SelectItem value="completed">Completada</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {/* Desktop: progress + status inline at right */}
                        <div className="hidden sm:flex items-center gap-3 shrink-0">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${statusVisual.bar} rounded-full transition-all duration-500`} style={{ width: `${phaseProgress}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 w-8 text-right tabular-nums">{phaseProgress}%</span>
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
                        </div>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            const phaseDeliverables = project.deliverables.filter(d => d.phaseId === phase.id).length;
                            setPendingDelete({
                              kind: "phase",
                              id: phase.id,
                              name: phase.name,
                              taskCount: phase.tasks.length,
                              deliverableCount: phaseDeliverables,
                            });
                          }}
                          className="p-1 mt-0.5 rounded text-gray-300 hover:text-red-500 transition-colors shrink-0"
                          title="Eliminar fase"
                          aria-label="Eliminar fase"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Tasks */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-3 sm:px-5 py-3 space-y-1">
                          {/* Inline date editing for phase */}
                          <div className="flex items-center gap-2 flex-wrap py-2 mb-2 border-b border-gray-50">
                            <div className="flex items-center gap-1.5">
                              <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Fechas:</span>
                            </div>
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
                          {/* Filter + sort toolbar */}
                          {phase.tasks.length > 1 && (
                            <div className="flex items-center justify-between gap-2 flex-wrap py-2 mb-1">
                              <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-0.5 flex-wrap">
                                {([
                                  { key: "all" as const, label: "Todas", count: phase.tasks.length },
                                  { key: "pending" as const, label: "Pendientes", count: phase.tasks.filter(t => t.status !== "completed").length },
                                  { key: "overdue" as const, label: "Vencidas", count: overdueCount },
                                  { key: "completed" as const, label: "Listas", count: completed },
                                ]).map(f => {
                                  if (f.key !== "all" && f.count === 0) return null;
                                  const active = filterKey === f.key;
                                  return (
                                    <button
                                      key={f.key}
                                      onClick={() => setPhaseFilter(p => ({ ...p, [phase.id]: f.key }))}
                                      className={`text-[10px] px-2 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
                                        active ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                                      } ${f.key === "overdue" && f.count > 0 && !active ? "text-red-600" : ""}`}
                                    >
                                      <span>{f.label}</span>
                                      <span className="text-gray-400 tabular-nums">{f.count}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              <Select value={sortKey} onValueChange={v => setPhaseSort(p => ({ ...p, [phase.id]: v as PhaseSort }))}>
                                <SelectTrigger className="h-7 text-xs w-32 shrink-0">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="manual">Orden manual</SelectItem>
                                  <SelectItem value="date">Por fecha</SelectItem>
                                  <SelectItem value="priority">Por prioridad</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          {visibleTasks.length > 0 && (
                            <div className="hidden md:grid grid-cols-[16px_20px_1fr_128px_92px_24px] items-center gap-3 px-1 pb-1.5 border-b border-gray-50 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                              <span></span>
                              <span></span>
                              <span>Descripción</span>
                              <span>Fecha de entrega</span>
                              <span className="text-center">Nivel</span>
                              <span></span>
                            </div>
                          )}
                          {phase.tasks.length > 0 && visibleTasks.length === 0 && (
                            <p className="text-xs text-gray-400 italic py-3 text-center">No hay tareas que coincidan con este filtro.</p>
                          )}
                          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleTaskDragEnd(phase.id, visibleTasks)}>
                            <SortableContext items={visibleTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                          {visibleTasks.map(task => {
                            const Icon = TASK_STATUS_ICONS[task.status] || Circle;
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const isOverdue = !!task.dueDate && task.status !== "completed" && new Date(task.dueDate) < today;
                            const priorityClasses =
                              task.priority === "high" ? "bg-red-50 text-red-600 hover:bg-red-100" :
                              task.priority === "medium" ? "bg-amber-50 text-amber-600 hover:bg-amber-100" :
                              "bg-gray-100 text-gray-500 hover:bg-gray-200";
                            return (
                              <SortableRow key={task.id} id={task.id} disabled={sortKey !== "manual"}>
                                {({ handleListeners }) => (
                              <div className={`flex flex-col gap-1.5 md:grid md:grid-cols-[16px_20px_1fr_128px_92px_24px] md:items-center md:gap-3 py-2 group ${task.isMilestone ? "bg-amber-50/50 -mx-2 px-2 rounded-lg" : ""}`}>
                                {/* Mobile row 1 / Desktop cols 1-3 + 6 */}
                                <div className="flex items-start gap-2 md:contents">
                                  {/* Drag handle (hidden when sort isn't manual) */}
                                  {handleListeners ? (
                                    <button
                                      {...handleListeners}
                                      className="shrink-0 mt-0.5 md:mt-0 md:justify-self-start text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
                                      aria-label="Reordenar tarea"
                                    >
                                      <GripVertical className="w-3.5 h-3.5" />
                                    </button>
                                  ) : (
                                    <span className="shrink-0 w-3.5 md:w-4 md:justify-self-start" />
                                  )}
                                  <button onClick={() => cycleTaskStatus(task)} className="shrink-0 mt-0.5 md:mt-0 md:justify-self-start" aria-label="Cambiar estado">
                                    <Icon className={`w-4 h-4 ${TASK_STATUS_COLORS[task.status]}`} />
                                  </button>
                                  <div className="text-sm flex-1 min-w-0">
                                    <div className={`flex items-start gap-1.5 ${task.status === "completed" ? "line-through text-gray-400" : "text-gray-700"} ${task.isMilestone ? "font-semibold" : ""}`}>
                                      {task.isMilestone && <span className="text-amber-500 text-sm shrink-0">🏁</span>}
                                      <div className="min-w-0 flex-1 break-words">
                                        <EditableText
                                          value={task.title}
                                          kind="task-title"
                                          onSave={(title) => new Promise<void>((resolve, reject) => {
                                            updateTaskMut.mutate(
                                              { id: task.id, data: { title } },
                                              { onSuccess: () => resolve(), onError: (err) => reject(err) }
                                            );
                                          })}
                                        />
                                      </div>
                                    </div>
                                    {/* Assignee chip — outside the line-through wrapper so it doesn't get crossed out */}
                                    <div className="mt-0.5">
                                      <AssigneeChip
                                        value={task.assigneeName}
                                        onSave={(next) => updateTaskMut.mutate({ id: task.id, data: { assigneeName: next } })}
                                      />
                                    </div>
                                  </div>
                                  {/* Mobile-only delete (always visible) */}
                                  <button
                                    onClick={() => setPendingDelete({ kind: "task", id: task.id, title: task.title })}
                                    className="md:hidden p-1 -mr-1 rounded text-gray-300 hover:text-red-500 shrink-0"
                                    aria-label="Eliminar tarea"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {/* Mobile row 2 / Desktop cols 3-4 + 5 */}
                                <div className="flex items-center gap-2 ml-6 md:ml-0 md:contents">
                                  <input
                                    type="date"
                                    value={task.dueDate ? task.dueDate.split("T")[0] : ""}
                                    onChange={e => updateTaskMut.mutate({ id: task.id, data: { dueDate: e.target.value || null } })}
                                    className={`text-[10px] border rounded px-1.5 py-1 outline-none w-32 md:w-full ${
                                      isOverdue
                                        ? "border-red-300 text-red-600 bg-red-50"
                                        : task.dueDate
                                          ? "border-gray-200 text-gray-600"
                                          : "border-dashed border-gray-300 text-gray-400"
                                    } focus:border-[#2FA4A9]`}
                                    title={isOverdue ? "Fecha vencida" : "Fecha límite"}
                                  />
                                  <select
                                    value={task.priority}
                                    onChange={e => updateTaskMut.mutate({ id: task.id, data: { priority: e.target.value } })}
                                    className={`appearance-none text-[10px] px-2 py-1 rounded font-medium border-0 outline-none cursor-pointer transition-colors md:justify-self-center ${priorityClasses}`}
                                    aria-label="Nivel de prioridad"
                                  >
                                    <option value="low">Bajo</option>
                                    <option value="medium">Medio</option>
                                    <option value="high">Alto</option>
                                  </select>
                                  {/* Desktop-only delete (hover-revealed) */}
                                  <button
                                    onClick={() => setPendingDelete({ kind: "task", id: task.id, title: task.title })}
                                    className="hidden md:flex p-1 rounded text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all md:justify-self-end"
                                    aria-label="Eliminar tarea"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                                )}
                              </SortableRow>
                            );
                          })}
                            </SortableContext>
                          </DndContext>

                          {addingTaskPhase === phase.id ? (
                            <div className="space-y-2 pt-2">
                              <Input
                                value={taskForm.title}
                                onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                                placeholder="Nueva tarea..."
                                className="h-9 text-sm"
                                autoFocus
                                onKeyDown={e => { if (e.key === "Enter" && taskForm.title) addTaskMut.mutate({ phaseId: phase.id, data: { ...taskForm, dueDate: taskForm.dueDate || null } }); if (e.key === "Escape") setAddingTaskPhase(null); }}
                              />
                              <div className="flex items-center gap-2 flex-wrap">
                                <Input
                                  type="date"
                                  value={taskForm.dueDate}
                                  onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))}
                                  className="h-8 text-xs flex-1 min-w-[140px]"
                                  placeholder="Fecha límite"
                                />
                                <Select value={taskForm.priority} onValueChange={v => setTaskForm(f => ({ ...f, priority: v }))}>
                                  <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="low">Bajo</SelectItem>
                                    <SelectItem value="medium">Medio</SelectItem>
                                    <SelectItem value="high">Alto</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={taskForm.isMilestone}
                                    onChange={e => setTaskForm(f => ({ ...f, isMilestone: e.target.checked }))}
                                    className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                                  />
                                  🏁 Milestone
                                </label>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setAddingTaskPhase(null)}>
                                    Cancelar
                                  </Button>
                                  <Button size="sm" className="h-8 bg-[#2FA4A9] hover:bg-[#238b8f]" disabled={!taskForm.title} onClick={() => { if (taskForm.title) addTaskMut.mutate({ phaseId: phase.id, data: { ...taskForm, dueDate: taskForm.dueDate || null } }); }}>
                                    <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
                                  </Button>
                                </div>
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
                      )}
                    </SortableRow>
                  );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
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

        {/* ── ACTIVIDAD (feed de cambios) ── */}
        {activeTab === "Actividad" && (() => {
          const filteredEntries = activityEntries.filter(e => {
            if (activityFilter === "all") return true;
            if (activityFilter === "manual" || activityFilter === "github_webhook" || activityFilter === "system") {
              return e.source === activityFilter;
            }
            return e.category === activityFilter;
          });
          const counts = {
            all: activityEntries.length,
            manual: activityEntries.filter(e => e.source === "manual").length,
            github: activityEntries.filter(e => e.source === "github_webhook").length,
          };
          const grouped: Array<[string, ActivityEntry[]]> = [];
          let currentDate = "";
          let currentBucket: ActivityEntry[] = [];
          for (const entry of filteredEntries) {
            const dateKey = format(parseISO(entry.createdAt), "yyyy-MM-dd");
            if (dateKey !== currentDate) {
              if (currentBucket.length) grouped.push([currentDate, currentBucket]);
              currentDate = dateKey;
              currentBucket = [];
            }
            currentBucket.push(entry);
          }
          if (currentBucket.length) grouped.push([currentDate, currentBucket]);

          const formatGroupDate = (dateKey: string) => {
            const d = parseISO(dateKey);
            const today = new Date();
            const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
            if (format(today, "yyyy-MM-dd") === dateKey) return "Hoy";
            if (format(yesterday, "yyyy-MM-dd") === dateKey) return "Ayer";
            return format(d, "EEEE d 'de' MMMM, yyyy", { locale: es });
          };

          const filterChips: Array<{ key: string; label: string; count?: number }> = [
            { key: "all", label: "Todas", count: counts.all },
            { key: "github_webhook", label: "GitHub", count: counts.github },
            { key: "manual", label: "Manuales", count: counts.manual },
            { key: "feature", label: "Features" },
            { key: "bugfix", label: "Bugs" },
            { key: "improvement", label: "Mejoras" },
            { key: "infrastructure", label: "Infra" },
            { key: "meeting", label: "Reuniones" },
            { key: "milestone", label: "Hitos" },
          ];

          return (
            <div className="space-y-4">
              {/* Header con acciones */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-gray-900">Bitácora del proyecto</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Trazabilidad completa: commits analizados con IA, cambios de diseño, decisiones y notas internas.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {project.githubRepoUrl && project.aiTrackingEnabled && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => analyzeCommitsMut.mutate()}
                      disabled={analyzeCommitsMut.isPending}
                      className={`group border-gray-300 hover:border-[#2FA4A9] hover:bg-[#2FA4A9]/5 hover:text-[#2FA4A9] hover:shadow-sm active:scale-[0.97] transition-all ${analyzeCommitsMut.isPending ? "border-[#2FA4A9] bg-[#2FA4A9]/5 text-[#2FA4A9] ring-2 ring-[#2FA4A9]/20 animate-pulse" : ""}`}
                    >
                      {analyzeCommitsMut.isPending ? (
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 mr-1.5 group-hover:rotate-6 transition-transform" />
                      )}
                      {analyzeCommitsMut.isPending ? "Analizando commits..." : "Analizar commits"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateWeeklySummaryMut.mutate()}
                    disabled={generateWeeklySummaryMut.isPending}
                    className={`group border-gray-300 hover:border-violet-500 hover:bg-violet-50 hover:text-violet-700 hover:shadow-sm active:scale-[0.97] transition-all ${generateWeeklySummaryMut.isPending ? "border-violet-500 bg-violet-50 text-violet-700 ring-2 ring-violet-200 animate-pulse" : ""}`}
                  >
                    {generateWeeklySummaryMut.isPending ? (
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 mr-1.5 group-hover:scale-110 transition-transform" />
                    )}
                    {generateWeeklySummaryMut.isPending ? "Generando resumen..." : "Resumen semanal"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowManualActivity(true)}
                    className="group bg-[#2FA4A9] hover:bg-[#238b8f] hover:shadow-md active:scale-[0.97] transition-all"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5 group-hover:rotate-90 transition-transform" />
                    Registrar actividad
                  </Button>
                </div>
              </div>

              {/* Banner: AI tracking off */}
              {!project.aiTrackingEnabled && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-amber-800 font-medium">Análisis automático de commits desactivado</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Conecta un repo en <button className="underline" onClick={() => setActiveTab("Config")}>Config</button> para que el cron diario (6 AM Bogotá) analice commits y los publique aquí.
                    </p>
                  </div>
                </div>
              )}

              {/* Filtros */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                {filterChips.map(chip => {
                  const active = activityFilter === chip.key;
                  const categoryDot = ACTIVITY_CATEGORY_META[chip.key]?.dotBg;
                  return (
                    <button
                      key={chip.key}
                      onClick={() => setActivityFilter(chip.key)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                        active ? "bg-gray-900 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800"
                      }`}
                    >
                      {categoryDot && (
                        <span className={`w-1.5 h-1.5 rounded-full ${categoryDot} ${active ? "ring-2 ring-white/30" : ""}`} />
                      )}
                      <span>{chip.label}</span>
                      {chip.count !== undefined && (
                        <span className={`text-[10px] tabular-nums ${active ? "text-gray-300" : "text-gray-400"}`}>{chip.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Resúmenes semanales — destacados */}
              {weeklySummaries.length > 0 && activityFilter === "all" && (
                <div className="bg-gradient-to-br from-[#2FA4A9]/5 to-blue-50 border border-[#2FA4A9]/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-[#2FA4A9]" />
                    <h4 className="text-sm font-semibold text-gray-800">Resúmenes semanales</h4>
                    <span className="text-[10px] text-gray-400 ml-auto">{weeklySummaries.length} generado(s)</span>
                  </div>
                  <div className="space-y-2">
                    {weeklySummaries.slice(0, 3).map(s => (
                      <button
                        key={s.id}
                        onClick={() => setWeeklySummaryModal({ open: true, summary: s.content, date: s.createdAt })}
                        className="w-full text-left bg-white rounded-lg p-3 hover:shadow-sm border border-gray-100 hover:border-[#2FA4A9]/40 transition-all group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[11px] text-gray-500 font-medium">
                            {format(parseISO(s.createdAt), "EEEE d MMM, yyyy", { locale: es })}
                          </p>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#2FA4A9] transition-colors" />
                        </div>
                        <p className="text-xs text-gray-700 line-clamp-2">{s.content.slice(0, 200)}{s.content.length > 200 ? "..." : ""}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Feed cronológico */}
              {activityLoading ? (
                <p className="text-center text-sm text-gray-400 py-12">Cargando bitácora...</p>
              ) : grouped.length === 0 ? (
                // Empty state contextual — sugiere la accion correcta segun
                // el estado del proyecto (sin repo / repo conectado sin entradas / filtro activo).
                <div className="bg-white rounded-xl border border-gray-200 border-dashed py-16 px-6 text-center">
                  <History className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  {activityFilter !== "all" ? (
                    <>
                      <p className="text-sm font-medium text-gray-600 mb-1">Sin entradas para este filtro</p>
                      <p className="text-xs text-gray-400 mb-4 max-w-sm mx-auto">
                        Cambia o limpia el filtro para ver toda la actividad del proyecto.
                      </p>
                      <Button size="sm" variant="outline" onClick={() => setActivityFilter("all")}>
                        Mostrar todo
                      </Button>
                    </>
                  ) : !project.githubRepoUrl ? (
                    <>
                      <p className="text-sm font-medium text-gray-600 mb-1">Conecta un repo para análisis automático</p>
                      <p className="text-xs text-gray-400 mb-4 max-w-sm mx-auto">
                        Vincula un repositorio de GitHub en Config y el cron diario analizará tus commits con IA. Mientras tanto puedes registrar actividad manual.
                      </p>
                      <div className="flex items-center gap-2 justify-center flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => setActiveTab("Config")}>
                          <Github className="w-3.5 h-3.5 mr-1.5" />
                          Conectar GitHub
                        </Button>
                        <Button size="sm" className="bg-[#2FA4A9] hover:bg-[#238b8f]" onClick={() => setShowManualActivity(true)}>
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          Registrar manual
                        </Button>
                      </div>
                    </>
                  ) : !project.aiTrackingEnabled ? (
                    <>
                      <p className="text-sm font-medium text-gray-600 mb-1">El análisis automático está apagado</p>
                      <p className="text-xs text-gray-400 mb-4 max-w-sm mx-auto">
                        Activa "AI tracking" en Config para que el cron diario analice los commits del repo conectado.
                      </p>
                      <Button size="sm" variant="outline" onClick={() => setActiveTab("Config")}>
                        Ir a Config
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-600 mb-1">Sin actividad analizada todavía</p>
                      <p className="text-xs text-gray-400 mb-4 max-w-sm mx-auto">
                        El cron corre cada día a las 6 AM Bogotá. Si no quieres esperar, click "Analizar commits" para procesar los últimos 20 ahora, o registra actividad manual (decisiones, reuniones).
                      </p>
                      <div className="flex items-center gap-2 justify-center flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => analyzeCommitsMut.mutate()}
                          disabled={analyzeCommitsMut.isPending}
                          className="hover:border-[#2FA4A9] hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/5"
                        >
                          {analyzeCommitsMut.isPending ? (
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Bot className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          {analyzeCommitsMut.isPending ? "Analizando..." : "Analizar commits ahora"}
                        </Button>
                        <Button size="sm" className="bg-[#2FA4A9] hover:bg-[#238b8f]" onClick={() => setShowManualActivity(true)}>
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          Registrar manual
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {grouped.map(([dateKey, entries]) => (
                    <div key={dateKey}>
                      <div className="sticky top-0 z-10 bg-gray-50 -mx-4 px-4 sm:mx-0 sm:px-3 py-1.5 mb-2 rounded-md">
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                          {formatGroupDate(dateKey)}
                          <span className="ml-2 text-[10px] font-normal text-gray-400 normal-case">{entries.length} entrada(s)</span>
                        </p>
                      </div>
                      {/* relative + absolute line gives the timeline-rail vibe of Linear/Stripe.
                          The line lives at left:30px (matches avatar center: 12 padding + 18 half of 36).
                          Avatars are bg-color and overlap the line, masking it at each row. */}
                      <div className="space-y-2 relative">
                        {entries.length > 1 && (
                          <div
                            className="absolute left-[30px] top-6 bottom-6 w-px bg-gradient-to-b from-gray-200 via-gray-200 to-transparent pointer-events-none"
                            aria-hidden="true"
                          />
                        )}
                        {entries.map(entry => {
                          const isExpanded = expandedActivity.has(entry.id);
                          const showFullDetail = showLevel3.has(entry.id);
                          const sourceMeta = ACTIVITY_SOURCE_META[entry.source] || ACTIVITY_SOURCE_META.system;
                          const SourceIcon = sourceMeta.icon;
                          const categoryMeta = ACTIVITY_CATEGORY_META[entry.category] || ACTIVITY_CATEGORY_META.feature;
                          const CategoryIcon = categoryMeta.icon;
                          return (
                            <div
                              key={entry.id}
                              className={`relative bg-white rounded-xl border ${entry.isSignificant ? "border-[#2FA4A9]/40 shadow-sm" : "border-gray-200"} overflow-hidden group transition-all hover:shadow-sm`}
                            >
                              {entry.isSignificant && (
                                // Solid teal rail on the left edge — much more scannable
                                // than the subtle border alone when skimming the feed.
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#2FA4A9]" aria-hidden="true" />
                              )}
                              <div
                                className="flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50/60 transition-colors"
                                onClick={() => {
                                  setExpandedActivity(prev => {
                                    const next = new Set(prev);
                                    next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                    return next;
                                  });
                                }}
                              >
                                {/* Fixed-width avatar — guarantees every title starts on the same vertical line */}
                                <div className={`w-9 h-9 rounded-lg ${categoryMeta.avatarBg} flex items-center justify-center shrink-0 shadow-sm`}>
                                  <CategoryIcon className="w-4 h-4 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-900 leading-snug font-medium">{entry.summaryLevel1}</p>
                                  <div className="flex items-center gap-x-2 gap-y-1 mt-1.5 flex-wrap text-xs text-gray-500">
                                    <span className={`inline-flex items-center gap-1.5 ${categoryMeta.textColor} font-semibold`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${categoryMeta.dotBg}`} />
                                      {categoryMeta.label}
                                    </span>
                                    <span className="text-gray-300">·</span>
                                    <span className={`inline-flex items-center gap-1 ${sourceMeta.color}`}>
                                      <SourceIcon className="w-3 h-3" />
                                      {sourceMeta.label}
                                    </span>
                                    {entry.aiGenerated && (
                                      <>
                                        <span className="text-gray-300">·</span>
                                        <span className="inline-flex items-center gap-1 text-purple-600">
                                          <Bot className="w-3 h-3" /> IA
                                        </span>
                                      </>
                                    )}
                                    {entry.isSignificant && (
                                      <>
                                        <span className="text-gray-300">·</span>
                                        <span className="text-[#2FA4A9] font-medium">★ Significativo</span>
                                      </>
                                    )}
                                    {entry.commitShas && entry.commitShas.length > 0 && (
                                      <>
                                        <span className="text-gray-300">·</span>
                                        <span className="text-gray-400">
                                          {entry.commitShas.length} commit{entry.commitShas.length !== 1 ? "s" : ""}
                                        </span>
                                      </>
                                    )}
                                    <span className="text-gray-400 ml-auto whitespace-nowrap">{timeAgoEs(entry.createdAt)}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm("¿Eliminar esta entrada? No se puede deshacer.")) {
                                      deleteActivityMut.mutate(entry.id);
                                    }
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                                  title="Eliminar entrada"
                                  aria-label="Eliminar"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {isExpanded && (entry.summaryLevel2 || entry.summaryLevel3) && (
                                <div className="border-t border-gray-100 p-3 bg-gray-50/50 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                                  {entry.summaryLevel2 && (
                                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{entry.summaryLevel2}</p>
                                  )}
                                  {entry.summaryLevel3 && (
                                    <>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowLevel3(prev => {
                                            const next = new Set(prev);
                                            next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                            return next;
                                          });
                                        }}
                                        className="text-xs text-[#2FA4A9] hover:underline mt-2 flex items-center gap-1"
                                      >
                                        {showFullDetail ? "Ocultar detalle técnico" : "Ver detalle técnico"}
                                        <ChevronDown className={`w-3 h-3 transition-transform ${showFullDetail ? "rotate-180" : ""}`} />
                                      </button>
                                      {showFullDetail && (
                                        <div className="mt-2 text-xs text-gray-500 leading-relaxed whitespace-pre-wrap bg-white rounded-lg p-3 border border-gray-100">
                                          {entry.summaryLevel3}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

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

              {(() => {
                const dayDetailBody = selectedDay ? (
                  <>
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
                              <div className="w-1 rounded-full shrink-0 self-stretch" style={{ background: ev.color }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 break-words">{ev.label}</p>
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
                                  aria-label="Cambiar estado"
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
                          className="h-9 text-sm"
                        />
                        {project.phases.length > 0 && (
                          <Select value={calQuickTask.phaseId} onValueChange={v => setCalQuickTask(f => ({ ...f, phaseId: v }))}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar fase" /></SelectTrigger>
                            <SelectContent>
                              {project.phases.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button
                          size="sm"
                          className="w-full h-9 text-sm bg-[#2FA4A9] hover:bg-[#238b8f]"
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
                          <Plus className="w-3.5 h-3.5 mr-1" /> Crear tarea para este día
                        </Button>
                      </div>
                    </div>
                  </>
                ) : null;

                return (
                  <div className="flex gap-4">
                    {/* Calendar grid */}
                    <div className={`bg-white rounded-xl border border-gray-200 p-3 sm:p-6 ${selectedDay ? "md:flex-1" : ""} w-full transition-all`}>
                      {/* Month navigation */}
                      <div className="flex items-center justify-between mb-4 sm:mb-6">
                        <button onClick={() => setCalendarMonth(prev => subMonths(prev, 1))} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Mes anterior">
                          <ChevronDown className="w-4 h-4 rotate-90" />
                        </button>
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <h3 className="text-base sm:text-lg font-bold text-gray-900 capitalize truncate">
                            {format(calendarMonth, "MMMM yyyy", { locale: es })}
                          </h3>
                          <button onClick={() => { setCalendarMonth(new Date()); setSelectedDay(new Date()); }} className="text-[10px] text-[#2FA4A9] font-medium hover:underline shrink-0">
                            Hoy
                          </button>
                        </div>
                        <button onClick={() => setCalendarMonth(prev => addMonths(prev, 1))} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Mes siguiente">
                          <ChevronDown className="w-4 h-4 -rotate-90" />
                        </button>
                      </div>

                      {/* Day headers */}
                      <div className="grid grid-cols-7 gap-px mb-1">
                        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map(d => (
                          <div key={d} className="text-center text-[9px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-wider py-1.5 sm:py-2">
                            <span className="hidden sm:inline">{d}</span>
                            <span className="sm:hidden">{d.charAt(0)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Calendar grid */}
                      <div className="grid grid-cols-7 gap-px">
                        {Array.from({ length: startDay }).map((_, i) => (
                          <div key={`empty-${i}`} className="h-14 sm:h-24 bg-gray-50/30 rounded-lg" />
                        ))}
                        {days.map(day => {
                          const dayEvents = getEventsForDay(day);
                          const isToday = isSameDay(day, today);
                          const isSelected = selectedDay && isSameDay(day, selectedDay);
                          return (
                            <div
                              key={day.toISOString()}
                              onClick={() => setSelectedDay(day)}
                              className={`h-14 sm:h-24 rounded-lg p-1 sm:p-1.5 border cursor-pointer transition-all ${
                                isSelected ? "border-[#2FA4A9] bg-teal-50/50 ring-1 ring-[#2FA4A9]/20"
                                : isToday ? "border-[#2FA4A9]/40 bg-teal-50/20"
                                : "border-transparent hover:bg-gray-50 hover:border-gray-200"
                              }`}
                            >
                              <div className={`text-[10px] sm:text-[11px] font-medium mb-0.5 sm:mb-1 ${isSelected ? "text-[#2FA4A9] font-bold" : isToday ? "text-[#2FA4A9] font-bold" : "text-gray-500"}`}>
                                {format(day, "d")}
                              </div>
                              {/* Mobile: dots only */}
                              <div className="flex items-center gap-0.5 flex-wrap sm:hidden">
                                {dayEvents.slice(0, 4).map((ev, i) => (
                                  ev.type === "milestone" ? (
                                    <Diamond key={i} className="w-2 h-2 text-amber-500 fill-amber-500" />
                                  ) : (
                                    <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: ev.color }} />
                                  )
                                ))}
                                {dayEvents.length > 4 && <span className="text-[8px] text-gray-400">+{dayEvents.length - 4}</span>}
                              </div>
                              {/* Desktop: labels */}
                              <div className="hidden sm:block space-y-0.5 overflow-hidden">
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
                      <div className="flex items-center gap-3 sm:gap-4 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100 flex-wrap">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[10px] text-gray-500">Completada</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-[10px] text-gray-500">En progreso</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-400" /><span className="text-[10px] text-gray-500">Pendiente</span></div>
                        <div className="flex items-center gap-1.5"><Diamond className="w-2.5 h-2.5 text-amber-500 fill-amber-500" /><span className="text-[10px] text-gray-500">Milestone</span></div>
                      </div>
                    </div>

                    {/* Desktop side panel — day detail */}
                    <AnimatePresence>
                      {selectedDay && (
                        <motion.div
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: 340, opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="shrink-0 overflow-hidden hidden md:block"
                        >
                          <div className="bg-white rounded-xl border border-gray-200 p-5 h-full w-[340px]">
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <p className="text-sm font-bold text-gray-900 capitalize">{format(selectedDay, "EEEE", { locale: es })}</p>
                                <p className="text-xs text-gray-400">{format(selectedDay, "d 'de' MMMM, yyyy", { locale: es })}</p>
                              </div>
                              <button onClick={() => setSelectedDay(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400" aria-label="Cerrar">✕</button>
                            </div>
                            {dayDetailBody}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Mobile: bottom sheet for day detail */}
                    <Sheet open={!!selectedDay} onOpenChange={(open) => { if (!open) setSelectedDay(null); }}>
                      <SheetContent side="bottom" className="md:hidden max-h-[85vh] overflow-y-auto rounded-t-2xl">
                        {selectedDay && (
                          <>
                            <SheetHeader className="text-left">
                              <SheetTitle className="capitalize">{format(selectedDay, "EEEE d 'de' MMMM", { locale: es })}</SheetTitle>
                            </SheetHeader>
                            <div className="pt-4">
                              {dayDetailBody}
                            </div>
                          </>
                        )}
                      </SheetContent>
                    </Sheet>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* ── ENTREGAS ── */}
        {activeTab === "Entregas" && (() => {
          const counts: Record<string, number> = { all: project.deliverables.length, pending: 0, delivered: 0, approved: 0, rejected: 0 };
          for (const d of project.deliverables) counts[d.status] = (counts[d.status] || 0) + 1;
          const visible = delivFilter === "all" ? project.deliverables : project.deliverables.filter(d => d.status === delivFilter);
          const STATUS_ORDER: DelivStatus[] = ["pending", "delivered", "approved", "rejected"];
          const sorted = [...visible].sort((a, b) => STATUS_ORDER.indexOf(a.status as DelivStatus) - STATUS_ORDER.indexOf(b.status as DelivStatus));
          const filterTabs: Array<{ key: typeof delivFilter; label: string }> = [
            { key: "all",       label: "Todas" },
            { key: "pending",   label: "Pendientes" },
            { key: "delivered", label: "Entregadas" },
            { key: "approved",  label: "Aprobadas" },
            { key: "rejected",  label: "Rechazadas" },
          ];

          return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
                {filterTabs.map(t => {
                  const c = counts[t.key] ?? 0;
                  const active = delivFilter === t.key;
                  if (t.key !== "all" && c === 0) return null;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setDelivFilter(t.key)}
                      className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      {t.key !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${DELIV_STATUS_META[t.key as DelivStatus].dotClass}`} />}
                      <span>{t.label}</span>
                      <span className={`text-[10px] tabular-nums ${active ? "text-gray-400" : "text-gray-400"}`}>{c}</span>
                    </button>
                  );
                })}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddDeliverable(true)}
                className="group hover:border-gray-400 hover:bg-gray-50 hover:shadow-sm active:scale-[0.97] transition-all"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5 group-hover:rotate-90 transition-transform" />
                Nueva entrega
              </Button>
            </div>

            {project.deliverables.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 py-16 text-center">
                <Package className="w-8 h-8 text-gray-300 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-sm text-gray-500">Aún no hay entregas registradas.</p>
                <p className="text-xs text-gray-400 mt-1">Crea la primera para empezar a trackear el progreso del proyecto.</p>
              </div>
            ) : sorted.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 py-12 text-center">
                <p className="text-sm text-gray-500">No hay entregas con este filtro.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {sorted.map(d => {
                    const status = (d.status as DelivStatus) in DELIV_STATUS_META ? (d.status as DelivStatus) : "pending";
                    const StatusIcon = DELIV_STATUS_META[status].icon;
                    const typeMeta = DELIV_TYPE_META[d.type] || DELIV_TYPE_META.other;
                    const TypeIcon = typeMeta.icon;
                    const dateLabel = d.approvedAt ? `Aprobado ${format(parseISO(d.approvedAt), "d MMM", { locale: es })}` : d.deliveredAt ? `Entregado ${format(parseISO(d.deliveredAt), "d MMM", { locale: es })}` : null;
                    return (
                      <div key={d.id} className="group relative flex items-start gap-3.5 px-4 py-3.5 hover:bg-gray-50/70 transition-colors">
                        {/* Status icon — interactive */}
                        <div className="relative shrink-0 mt-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDelivStatusMenu(delivStatusMenu === d.id ? null : d.id); }}
                            className={`w-7 h-7 rounded-full ring-1 ring-inset flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${DELIV_STATUS_META[status].ringClass}`}
                            title={`${DELIV_STATUS_META[status].label} — clic para cambiar`}
                          >
                            <StatusIcon className={`w-3.5 h-3.5 ${DELIV_STATUS_META[status].iconClass}`} strokeWidth={2.25} />
                          </button>
                          {delivStatusMenu === d.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setDelivStatusMenu(null)} />
                              <div className="absolute left-0 top-9 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150">
                                {STATUS_ORDER.map(s => {
                                  const M = DELIV_STATUS_META[s];
                                  const Ico = M.icon;
                                  const isCurrent = s === status;
                                  return (
                                    <button
                                      key={s}
                                      disabled={isCurrent}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDelivStatusMenu(null);
                                        const data: Record<string, unknown> = { status: s };
                                        if (s === "delivered" && !d.deliveredAt) data.deliveredAt = new Date().toISOString();
                                        if (s === "approved" && !d.approvedAt) data.approvedAt = new Date().toISOString();
                                        updateDelivMut.mutate({ id: d.id, data });
                                      }}
                                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${isCurrent ? "bg-gray-50 text-gray-400 cursor-default" : "text-gray-700 hover:bg-gray-50"}`}
                                    >
                                      <Ico className={`w-3.5 h-3.5 ${M.iconClass}`} strokeWidth={2.25} />
                                      <span className="flex-1 text-left">{M.label}</span>
                                      {isCurrent && <span className="text-[10px] text-gray-400">actual</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Body */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0 text-sm font-medium text-gray-900 leading-snug">
                              <EditableText
                                value={d.title}
                                kind="deliverable-title"
                                onSave={(title) => new Promise<void>((resolve, reject) => {
                                  updateDelivMut.mutate(
                                    { id: d.id, data: { title } },
                                    { onSuccess: () => resolve(), onError: (err) => reject(err) }
                                  );
                                })}
                              />
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 pt-0.5 text-[11px] text-gray-400">
                              <TypeIcon className="w-3 h-3" strokeWidth={2} />
                              <span>{typeMeta.label}</span>
                            </div>
                          </div>

                          <div className="text-[13px] text-gray-500 mt-0.5 leading-relaxed">
                            <EditableText
                              value={d.description || ""}
                              kind="deliverable-description"
                              multiline
                              placeholder="Añadir descripción"
                              onSave={(description) => new Promise<void>((resolve, reject) => {
                                updateDelivMut.mutate(
                                  { id: d.id, data: { description } },
                                  { onSuccess: () => resolve(), onError: (err) => reject(err) }
                                );
                              })}
                            />
                          </div>

                          {/* Metadata row: date · rating · demo */}
                          {(dateLabel || d.clientRating || d.demoUrl) && (
                            <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                              {dateLabel && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" strokeWidth={2} />
                                  {dateLabel}
                                </span>
                              )}
                              {d.clientRating && (
                                <span className="flex items-center gap-0.5 text-amber-500">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <span key={i} className={i < d.clientRating! ? "text-amber-500" : "text-gray-200"}>★</span>
                                  ))}
                                </span>
                              )}
                              {d.demoUrl && (
                                <a
                                  href={d.demoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[#2FA4A9] hover:text-[#238b8f] transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3" strokeWidth={2} />
                                  Ver demo
                                </a>
                              )}
                            </div>
                          )}

                          {/* Client comment */}
                          {d.clientComment && (
                            <div className="mt-2 flex gap-2 bg-amber-50/70 border border-amber-100 rounded-md px-2.5 py-1.5">
                              <MessageSquare className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" strokeWidth={2} />
                              <p className="text-[12px] text-amber-800 leading-relaxed">{d.clientComment}</p>
                            </div>
                          )}
                        </div>

                        {/* Trash — always visible mobile, hover-revealed desktop */}
                        <button
                          onClick={() => setPendingDelete({ kind: "deliverable", id: d.id, title: d.title })}
                          className="self-start p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0"
                          title="Eliminar entrega"
                          aria-label="Eliminar entrega"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    );
                  })}
                </div>
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
          );
        })()}

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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                {Object.entries(
                  project.timeLogs.reduce((acc, l) => {
                    acc[l.category] = (acc[l.category] || 0) + parseFloat(l.hours);
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([cat, hrs]) => (
                  <div key={cat} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                    <p className="text-[11px] sm:text-xs text-gray-400 truncate">{CATEGORY_LABELS[cat] || cat}</p>
                    <p className="text-base sm:text-lg font-bold text-gray-900">{hrs.toFixed(1)}h</p>
                  </div>
                ))}
              </div>
            )}

            {project.timeLogs.length === 0 ? (
              <p className="text-center text-gray-400 py-12">No hay horas registradas.</p>
            ) : (
              <>
                {/* Mobile: card list */}
                <div className="md:hidden space-y-2">
                  {project.timeLogs.map(l => (
                    <div key={l.id} className="bg-white rounded-xl border border-gray-200 p-3 group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900 break-words">{l.description}</p>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400 flex-wrap">
                            <span>{l.date}</span>
                            <span className="text-gray-300">·</span>
                            <span>{CATEGORY_LABELS[l.category] || l.category}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-semibold text-gray-900 tabular-nums">{parseFloat(l.hours).toFixed(1)}h</span>
                          <button onClick={() => deleteTimeMut.mutate(l.id)} className="p-1 rounded text-gray-300 hover:text-red-500" aria-label="Eliminar">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: table */}
                <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                            <button onClick={() => deleteTimeMut.mutate(l.id)} className="p-1 rounded text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all" aria-label="Eliminar">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
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
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                  <Mic className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">Grabar nueva sesión</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Abre Acta para grabar, transcribir y analizar la reunión con el cliente.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href="https://brave-kindness-production-049c.up.railway.app" target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-initial">
                  <Button size="sm" className="bg-purple-600 hover:bg-purple-700 w-full">
                    <Mic className="w-3.5 h-3.5 mr-1.5" /> Abrir Acta
                  </Button>
                </a>
                <Button size="sm" variant="outline" onClick={() => setShowAddSession(true)} className="flex-1 sm:flex-initial">
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> <span className="hidden sm:inline">Registrar manualmente</span><span className="sm:hidden">Manual</span>
                </Button>
              </div>
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
                      <button onClick={() => deleteSessionMut.mutate(s.id)} className="p-1 text-gray-300 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-all" aria-label="Eliminar sesión">
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
            <div className="flex justify-end gap-2 flex-wrap">
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
                <FolderOpen className="w-3.5 h-3.5 mr-1.5" /> <span className="hidden sm:inline">Sincronizar </span>Drive
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddFile(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> <span className="hidden sm:inline">Agregar </span>Archivo
              </Button>
            </div>

            {files.length === 0 ? (
              <div className="text-center py-16">
                <FolderOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Sin archivos</p>
                <p className="text-xs text-gray-300 mt-1">Sube contratos, diseños, specs y más.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {files.map((f: any) => {
                  const typeIcons: Record<string, typeof File> = { document: FileText, contract: FileText, image: Image, design: Image, recording: Mic, transcript: FileText };
                  const typeColors: Record<string, string> = { document: "bg-blue-50 text-blue-600", contract: "bg-amber-50 text-amber-600", image: "bg-pink-50 text-pink-600", design: "bg-purple-50 text-purple-600", recording: "bg-red-50 text-red-600", transcript: "bg-teal-50 text-teal-600" };
                  const FileIcon = typeIcons[f.type] || File;
                  const colorClass = typeColors[f.type] || "bg-gray-50 text-gray-500";
                  return (
                    <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex items-center gap-3 group hover:shadow-sm transition-shadow">
                      <div className={`w-10 h-10 rounded-xl ${colorClass} flex items-center justify-center shrink-0`}>
                        <FileIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-900 hover:text-[#2FA4A9] truncate block">{f.name}</a>
                        <p className="text-[10px] text-gray-400">{f.type} · {new Date(f.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</p>
                      </div>
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-[#2FA4A9] shrink-0" aria-label="Abrir archivo">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button onClick={() => deleteFileMut.mutate(f.id)} className="p-1 text-gray-300 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0" aria-label="Eliminar archivo">
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
                  const prioLabels: Record<string, string> = { high: "Alto", medium: "Medio", low: "Bajo" };
                  const prioColors: Record<string, string> = { high: "bg-red-50 text-red-600", medium: "bg-amber-50 text-amber-600", low: "bg-gray-100 text-gray-500" };
                  return (
                    <div key={idea.id} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 group">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                          <Lightbulb className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-gray-900 break-words">{idea.title}</h4>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[idea.status] || statusColors.suggested}`}>{statusLabels[idea.status] || idea.status}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${prioColors[idea.priority] || prioColors.medium}`}>{prioLabels[idea.priority] || idea.priority}</span>
                            {idea.suggestedBy === "client" && <span className="text-[10px] bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full">Cliente</span>}
                          </div>
                          {idea.description && <p className="text-sm text-gray-500 mt-1 break-words">{idea.description}</p>}
                          {idea.votes > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                              <ThumbsUp className="w-3 h-3" /> {idea.votes} votos
                            </span>
                          )}
                          {/* Mobile: status select + delete on second row */}
                          <div className="flex items-center gap-2 mt-3 sm:hidden">
                            <Select value={idea.status} onValueChange={v => updateIdeaMut.mutate({ id: idea.id, data: { status: v } })}>
                              <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="suggested">Sugerida</SelectItem>
                                <SelectItem value="considering">En evaluación</SelectItem>
                                <SelectItem value="planned">Planeada</SelectItem>
                                <SelectItem value="implemented">Implementada</SelectItem>
                                <SelectItem value="dismissed">Descartada</SelectItem>
                              </SelectContent>
                            </Select>
                            <button onClick={() => deleteIdeaMut.mutate(idea.id)} className="p-2 text-gray-300 hover:text-red-500 shrink-0" aria-label="Eliminar idea">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {/* Desktop: status select + delete inline */}
                        <Select value={idea.status} onValueChange={v => updateIdeaMut.mutate({ id: idea.id, data: { status: v } })}>
                          <SelectTrigger className="h-7 w-32 text-xs hidden sm:flex"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="suggested">Sugerida</SelectItem>
                            <SelectItem value="considering">En evaluación</SelectItem>
                            <SelectItem value="planned">Planeada</SelectItem>
                            <SelectItem value="implemented">Implementada</SelectItem>
                            <SelectItem value="dismissed">Descartada</SelectItem>
                          </SelectContent>
                        </Select>
                        <button onClick={() => deleteIdeaMut.mutate(idea.id)} className="hidden sm:block p-1 text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all" aria-label="Eliminar idea">
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
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col h-[60vh] sm:h-[500px] min-h-[400px]">
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3">
              {project.messages.length === 0 ? (
                <p className="text-center text-gray-400 py-12">No hay mensajes. Envía el primero.</p>
              ) : (
                project.messages.map(m => (
                  <div key={m.id} className={`flex ${m.senderType === "team" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 sm:px-4 py-2.5 ${
                      m.senderType === "team"
                        ? "bg-[#2FA4A9] text-white rounded-br-md"
                        : "bg-gray-100 text-gray-900 rounded-bl-md"
                    }`}>
                      <p className={`text-[10px] font-medium mb-0.5 ${m.senderType === "team" ? "text-white/70" : "text-gray-400"}`}>{m.senderName}</p>
                      <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                      <p className={`text-[10px] mt-1 ${m.senderType === "team" ? "text-white/50" : "text-gray-300"}`}>
                        {new Date(m.createdAt).toLocaleString("es-CO", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t border-gray-100 p-3 sm:p-4 flex gap-2">
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
                className="bg-[#2FA4A9] hover:bg-[#238b8f] shrink-0"
                aria-label="Enviar"
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                onClick={() => setConfirmDeleteProject(true)}
              >
                Eliminar proyecto
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Generar / Añadir fase con IA — multi-step */}
      <Dialog open={showAIPhase !== false} onOpenChange={(open) => {
        if (!generatePhasesAIMut.isPending && !clarifyBriefMut.isPending && !open) setShowAIPhase(false);
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {showAIPhase === "fresh" ? "Generar fases con IA" : "Añadir fase con IA"}
            </DialogTitle>
          </DialogHeader>

          {/* Step indicator — circular dots con barra conectora.
              Past steps quedan llenas, current con ring teal pulsante,
              future en gris. Patron estandar de wizards (Linear, Notion). */}
          {aiPhaseStep !== "repo-failed" && (() => {
            const steps = [
              { key: "brief",      label: "Brief" },
              { key: "questions",  label: "Preguntas" },
              { key: "generating", label: "Generación" },
            ] as const;
            const currentIdx = steps.findIndex(s => s.key === aiPhaseStep);
            return (
              <div className="flex items-center gap-1 pt-1 pb-1">
                {steps.map((s, i) => {
                  const isPast = i < currentIdx;
                  const isCurrent = i === currentIdx;
                  return (
                    <div key={s.key} className="flex items-center gap-1 flex-1">
                      <div className="flex items-center gap-2 shrink-0">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                            isPast
                              ? "bg-[#2FA4A9] text-white"
                              : isCurrent
                                ? "bg-[#2FA4A9] text-white ring-4 ring-[#2FA4A9]/20 animate-pulse"
                                : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                        </div>
                        <span className={`text-[11px] font-medium ${isCurrent ? "text-[#2FA4A9]" : isPast ? "text-gray-700" : "text-gray-400"}`}>
                          {s.label}
                        </span>
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`flex-1 h-px ${isPast ? "bg-[#2FA4A9]" : "bg-gray-200"} transition-colors`} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {aiPhaseStep === "brief" && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>
                  {showAIPhase === "fresh"
                    ? "Brief — hacia dónde va este proyecto"
                    : "¿Qué fase añadimos? Describe el cambio o lo que sigue"}
                </Label>
                <Textarea
                  value={aiPhaseForm.brief}
                  onChange={e => setAIPhaseForm(f => ({ ...f, brief: e.target.value }))}
                  placeholder={showAIPhase === "fresh"
                    ? "Describe el problema, los usuarios, el alcance, el resultado esperado. Mínimo 2-3 párrafos."
                    : "Ej: ahora también vamos a integrar pagos con Stripe y necesito que la IA arme una fase para esa parte."}
                  rows={6}
                />
                <p className="text-[11px] text-gray-400">{aiPhaseForm.brief.length} caracteres {aiPhaseForm.brief.length < 20 && "· mínimo 20"}</p>
              </div>

              <div className="space-y-2">
                <Label>Repo de GitHub (opcional)</Label>
                {githubStatus?.connected ? (
                  <Select
                    value={aiPhaseForm.githubRepoUrl || "__none__"}
                    onValueChange={v => setAIPhaseForm(f => ({ ...f, githubRepoUrl: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar repositorio" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="__none__">— Sin repositorio —</SelectItem>
                      {githubRepos.map(r => (
                        <SelectItem key={r.id} value={r.url}>
                          <span className="flex items-center gap-2">
                            <span>{r.fullName}</span>
                            {r.isPrivate && <span className="text-[9px] uppercase tracking-wider font-semibold bg-gray-100 text-gray-500 px-1 rounded">privado</span>}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-dashed border-gray-200 bg-gray-50">
                    <p className="text-xs text-gray-500">GitHub no está conectado.</p>
                    <a href="/api/github/authorize" className="text-xs font-medium text-[#2FA4A9] hover:underline">
                      Conectar GitHub →
                    </a>
                  </div>
                )}
                <p className="text-[11px] text-gray-400">Si seleccionas un repo, la IA leerá README + docs/ + últimos commits para ajustar las fases al estado real.</p>
              </div>

              {showAIPhase === "append" && project.phases.length > 0 && (
                <div className="text-[11px] text-gray-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
                  Se añadirá UNA nueva fase al final del proyecto. Las {project.phases.length} fases existentes no se tocan.
                </div>
              )}

              <Button
                onClick={() => {
                  if (aiPhaseForm.brief.trim().length < 20) {
                    toast({ title: "Brief demasiado corto", variant: "destructive" });
                    return;
                  }
                  clarifyBriefMut.mutate({
                    brief: aiPhaseForm.brief.trim(),
                    githubRepoUrl: aiPhaseForm.githubRepoUrl || undefined,
                    mode: showAIPhase === "fresh" ? "fresh" : "append",
                  });
                }}
                disabled={clarifyBriefMut.isPending || aiPhaseForm.brief.trim().length < 20}
                className="group w-full bg-[#2FA4A9] hover:bg-[#238b8f] hover:shadow-md active:scale-[0.99] transition-all gap-2"
              >
                {clarifyBriefMut.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Analizando brief…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 group-hover:scale-110 group-hover:rotate-12 transition-transform" />
                    Continuar — Claude hará preguntas
                  </>
                )}
              </Button>
            </div>
          )}

          {aiPhaseStep === "questions" && (
            <div className="space-y-4 pt-2">
              {aiRepoLoadFailed && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-800">
                    <strong>El repo seleccionado no se pudo leer.</strong> Las preguntas y las fases se generarán <em>sin</em> contexto del código actual.
                    Razones probables: token de GitHub revocado, repo borrado, o tu cuenta no tiene acceso. Considera <a href="/api/github/authorize" className="underline font-medium">reconectar GitHub</a> y reintentar.
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-500">
                Claude detectó {aiClarifyQuestions.length} áreas que vale la pena aclarar antes de proponer fases. Responde lo que sepas — puedes saltarte preguntas dejándolas vacías.
              </p>

              {aiClarifyQuestions.length === 0 ? (
                <p className="text-sm text-gray-400 italic text-center py-6">No se generaron preguntas. Continúa para generar las fases con el brief original.</p>
              ) : (
                <div className="space-y-4">
                  {aiClarifyQuestions.map((q, i) => (
                    <div key={q.id || i} className="space-y-2">
                      <Label className="text-sm">
                        <span className="text-[#2FA4A9] mr-1">{i + 1}.</span>
                        {q.question}
                      </Label>
                      {q.hint && <p className="text-[11px] text-gray-400 -mt-1">{q.hint}</p>}
                      {q.options && q.options.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {q.options.map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setAIClarifyAnswers(a => ({ ...a, [q.id]: opt }))}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                aiClarifyAnswers[q.id] === opt
                                  ? "border-[#2FA4A9] bg-[#2FA4A9]/10 text-[#2FA4A9]"
                                  : "border-gray-200 text-gray-600 hover:border-gray-300"
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                          <Input
                            value={aiClarifyAnswers[q.id] && !q.options?.includes(aiClarifyAnswers[q.id]) ? aiClarifyAnswers[q.id] : ""}
                            onChange={e => setAIClarifyAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                            placeholder="O responde libremente…"
                            className="text-xs"
                          />
                        </div>
                      ) : (
                        <Textarea
                          value={aiClarifyAnswers[q.id] || ""}
                          onChange={e => setAIClarifyAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                          placeholder="Tu respuesta…"
                          rows={2}
                          className="text-sm"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAIPhaseStep("brief")} className="flex-1">
                  Atrás
                </Button>
                <Button
                  onClick={() => {
                    setAIPhaseStep("generating");
                    const clarifications = aiClarifyQuestions
                      .map(q => ({ question: q.question, answer: (aiClarifyAnswers[q.id] || "").trim() }))
                      .filter(c => c.answer.length > 0);
                    generatePhasesAIMut.mutate({
                      brief: aiPhaseForm.brief.trim(),
                      githubRepoUrl: aiPhaseForm.githubRepoUrl || undefined,
                      mode: showAIPhase === "fresh" ? "fresh" : "append",
                      clarifications: clarifications.length > 0 ? clarifications : undefined,
                    });
                  }}
                  className="flex-1 bg-[#2FA4A9] hover:bg-[#238b8f] gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Generar fases
                </Button>
              </div>
            </div>
          )}

          {aiPhaseStep === "generating" && (
            <div className="space-y-4 pt-2">
              <p className="text-xs text-gray-500">Claude está construyendo el plan. Esto suele tomar 15–30 segundos.</p>
              <div className="space-y-2">
                {(() => {
                  const hasRepo = !!(aiPhaseForm.githubRepoUrl || project?.githubRepoUrl);
                  const steps = [
                    ...(hasRepo ? [{ id: 1, label: "Leyendo repositorio en GitHub", hint: "Lee README, schema, endpoints y commits" }] : []),
                    { id: 2, label: "Diseñando fases con Claude Sonnet", hint: "Detecta qué está hecho vs. pendiente" },
                    { id: 3, label: "Distribuyendo tareas y entregables", hint: "4–8 tareas por fase + dependencias" },
                  ];
                  return steps.map((s, i) => {
                    const status = aiGenStep > s.id ? "done" : aiGenStep === s.id ? "running" : "pending";
                    return (
                      <div
                        key={s.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-all duration-300 ${
                          status === "done" ? "border-emerald-200 bg-emerald-50" :
                          status === "running" ? "border-[#2FA4A9]/40 bg-[#2FA4A9]/5 shadow-sm scale-[1.01]" :
                          "border-gray-200 bg-gray-50/50"
                        }`}
                        style={{ animationDelay: `${i * 100}ms` }}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
                          status === "done" ? "bg-emerald-500 text-white" :
                          status === "running" ? "bg-[#2FA4A9] text-white ring-4 ring-[#2FA4A9]/20" :
                          "bg-gray-200 text-gray-400"
                        }`}>
                          {status === "done" ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : status === "running" ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Circle className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-tight ${
                            status === "done" ? "text-emerald-700 font-medium" :
                            status === "running" ? "text-gray-900 font-semibold" :
                            "text-gray-400"
                          }`}>
                            {s.label}
                          </p>
                          {s.hint && (
                            <p className={`text-[11px] mt-0.5 ${
                              status === "running" ? "text-gray-600" : "text-gray-400"
                            }`}>
                              {s.hint}
                            </p>
                          )}
                        </div>
                        {status === "running" && (
                          <span className="text-[10px] font-bold text-[#2FA4A9] uppercase tracking-wider animate-pulse">
                            En curso
                          </span>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
              {generatePhasesAIMut.isPending && (
                <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Trabajando… no cierres esta ventana.</span>
                </div>
              )}
            </div>
          )}

          {aiPhaseStep === "repo-failed" && aiPhaseResult && (
            <div className="space-y-4 pt-2">
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-900">
                      Las fases se generaron, pero el repo no se pudo leer
                    </p>
                    <p className="text-xs text-amber-800 mt-1">
                      Repo: <code className="bg-amber-100 px-1 rounded">{aiPhaseForm.githubRepoUrl || project.githubRepoUrl}</code>
                    </p>
                  </div>
                </div>
                <div className="ml-8 space-y-2">
                  <p className="text-xs text-amber-800 font-medium">Resultado:</p>
                  <p className="text-xs text-amber-800">
                    Se crearon <strong>{aiPhaseResult.phasesCreated} fases</strong> y <strong>{aiPhaseResult.tasksCreated} tareas</strong>, pero <em>sin contexto del código actual</em>. Las fases NO reflejan qué partes ya están implementadas — todas quedan como pendientes aunque tengas avance real.
                  </p>
                  <p className="text-xs text-amber-800 font-medium pt-1">Razones probables:</p>
                  <ul className="list-disc list-inside text-xs text-amber-800 space-y-0.5">
                    <li>El token OAuth de GitHub fue revocado o expiró</li>
                    <li>El repo fue borrado, renombrado o trasladado de owner</li>
                    <li>Tu cuenta GitHub conectada no tiene acceso al repo</li>
                  </ul>
                  <p className="text-xs text-amber-800 pt-1">
                    Mira los logs del servidor (línea con <code className="bg-amber-100 px-1 rounded">generate-phases:</code>) para ver el código exacto del error.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <a href="/api/github/authorize" className="flex-1">
                  <Button variant="outline" className="w-full gap-2">
                    <Github className="w-4 h-4" />
                    Reconectar GitHub
                  </Button>
                </a>
                <Button
                  onClick={() => setShowAIPhase(false)}
                  className="flex-1 bg-[#2FA4A9] hover:bg-[#238b8f]"
                >
                  Entiendo, continuar igual
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm-before-delete dialog (fases, tareas, entregas). Usa AlertDialog con estilo destructivo. */}
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.kind === "phase" && `¿Eliminar fase "${pendingDelete.name}"?`}
              {pendingDelete?.kind === "task" && `¿Eliminar tarea "${pendingDelete.title}"?`}
              {pendingDelete?.kind === "deliverable" && `¿Eliminar entrega "${pendingDelete.title}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {pendingDelete?.kind === "phase" && (
                  <>
                    <p>Esta acción ocultará la fase junto con:</p>
                    <ul className="list-disc list-inside text-sm space-y-0.5">
                      <li>{pendingDelete.taskCount} tarea{pendingDelete.taskCount === 1 ? "" : "s"}</li>
                      <li>{pendingDelete.deliverableCount} entrega{pendingDelete.deliverableCount === 1 ? "" : "s"}</li>
                    </ul>
                    <p className="text-[#2FA4A9] text-sm font-medium">Podrás deshacer durante unos segundos desde el toast que aparece.</p>
                  </>
                )}
                {pendingDelete?.kind === "task" && (
                  <p>Podrás deshacer durante unos segundos desde el toast.</p>
                )}
                {pendingDelete?.kind === "deliverable" && (
                  <p>Esta acción es <strong>permanente</strong> — la entrega no se podrá recuperar.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              onClick={() => {
                if (!pendingDelete) return;
                if (pendingDelete.kind === "phase") {
                  deletePhaseMut.mutate({ id: pendingDelete.id, taskCount: pendingDelete.taskCount });
                } else if (pendingDelete.kind === "task") {
                  deleteTaskMut.mutate(pendingDelete.id);
                } else {
                  deleteDelivMut.mutate(pendingDelete.id);
                }
                setPendingDelete(null);
              }}
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación de borrar proyecto entero (permanente) */}
      <AlertDialog open={confirmDeleteProject} onOpenChange={setConfirmDeleteProject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este proyecto?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-gray-600">
                <p>Vas a eliminar <strong className="text-gray-900">{project.name}</strong> y todo su contenido:</p>
                <ul className="list-disc list-inside text-xs space-y-0.5 text-gray-500">
                  <li>{project.phases.length} fase{project.phases.length === 1 ? "" : "s"} y todas sus tareas</li>
                  <li>{project.deliverables.length} entrega{project.deliverables.length === 1 ? "" : "s"}</li>
                  <li>{project.totalHours.toFixed(1)}h registradas</li>
                  <li>{project.messages.length} mensaje{project.messages.length === 1 ? "" : "s"}</li>
                </ul>
                <p className="text-red-600 font-medium">Esta acción es permanente y no se puede deshacer.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              onClick={() => { setConfirmDeleteProject(false); deleteProjectMut.mutate(); }}
            >
              Sí, eliminar proyecto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: Editar info del proyecto */}
      <Dialog open={showEditInfo} onOpenChange={(open) => { if (!updateProjectInfoMut.isPending && !open) setShowEditInfo(false); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar información del proyecto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Tipo de proyecto</Label>
              <div className="grid grid-cols-2 gap-2">
                {([["client", "Cliente", Building2], ["internal", "Interno IM3", Wrench]] as const).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEditInfoForm(f => ({ ...f, projectType: value, contactId: value === "internal" ? "" : f.contactId }))}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      editInfoForm.projectType === value
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
              <Label>Nombre</Label>
              <Input value={editInfoForm.name} onChange={e => setEditInfoForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            {editInfoForm.projectType === "client" && (
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select
                  value={editInfoForm.contactId || "__none__"}
                  onValueChange={v => {
                    if (v === "__create__") {
                      setShowEditInfo(false);
                      navigate("/admin/contacts?new=true");
                      return;
                    }
                    setEditInfoForm(f => ({ ...f, contactId: v === "__none__" ? "" : v }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar contacto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sin cliente asignado —</SelectItem>
                    {contactsList.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre} ({c.empresa})</SelectItem>
                    ))}
                    <SelectSeparator />
                    <SelectItem value="__create__" className="text-[#2FA4A9] font-medium">
                      + Crear nuevo contacto
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Repo de GitHub</Label>
              {githubStatus?.connected ? (
                <Select
                  value={editInfoForm.githubRepoUrl || "__none__"}
                  onValueChange={v => setEditInfoForm(f => ({ ...f, githubRepoUrl: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar repositorio" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none__">— Sin repositorio —</SelectItem>
                    {githubRepos.map(r => (
                      <SelectItem key={r.id} value={r.url}>
                        <span className="flex items-center gap-2">
                          <span>{r.fullName}</span>
                          {r.isPrivate && <span className="text-[9px] uppercase tracking-wider font-semibold bg-gray-100 text-gray-500 px-1 rounded">privado</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={editInfoForm.githubRepoUrl}
                  onChange={e => setEditInfoForm(f => ({ ...f, githubRepoUrl: e.target.value }))}
                  placeholder="https://github.com/owner/repo"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={editInfoForm.status} onValueChange={v => setEditInfoForm(f => ({ ...f, status: v }))}>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Presupuesto</Label>
                <Input type="number" value={editInfoForm.totalBudget} onChange={e => setEditInfoForm(f => ({ ...f, totalBudget: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={editInfoForm.currency} onValueChange={v => setEditInfoForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="COP">COP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={() => {
                if (editInfoForm.projectType === "client" && !editInfoForm.contactId) {
                  toast({ title: "Falta cliente", description: "Selecciona un contacto o cambia a tipo Interno.", variant: "destructive" });
                  return;
                }
                updateProjectInfoMut.mutate({
                  name: editInfoForm.name,
                  contactId: editInfoForm.projectType === "internal" ? null : (editInfoForm.contactId || null),
                  projectType: editInfoForm.projectType,
                  githubRepoUrl: editInfoForm.githubRepoUrl || null,
                  status: editInfoForm.status,
                  totalBudget: editInfoForm.totalBudget ? parseInt(editInfoForm.totalBudget) : null,
                  currency: editInfoForm.currency,
                });
              }}
              disabled={updateProjectInfoMut.isPending || !editInfoForm.name}
              className="w-full bg-[#2FA4A9] hover:bg-[#238b8f]"
            >
              {updateProjectInfoMut.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: registrar actividad manual */}
      <Dialog open={showManualActivity} onOpenChange={setShowManualActivity}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar actividad</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-gray-500">
              Captura cambios que no son commits: diseño, decisiones, refactors, reuniones internas, cambios de estrategia.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Título <span className="text-red-500">*</span></Label>
              <Input
                value={manualActivityForm.summaryLevel1}
                onChange={e => setManualActivityForm(f => ({ ...f, summaryLevel1: e.target.value }))}
                placeholder="Ej: Rediseño completo del flujo de onboarding"
                maxLength={300}
              />
              <p className="text-[10px] text-gray-400 text-right">{manualActivityForm.summaryLevel1.length}/300</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Categoría</Label>
                <Select
                  value={manualActivityForm.category}
                  onValueChange={v => setManualActivityForm(f => ({ ...f, category: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTIVITY_CATEGORY_META).map(([key, meta]) => {
                      const Icon = meta.icon;
                      return (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-md ${meta.avatarBg} flex items-center justify-center shrink-0`}>
                              <Icon className="w-3 h-3 text-white" />
                            </span>
                            {meta.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fase (opcional)</Label>
                <Select
                  value={manualActivityForm.phaseId || "_none"}
                  onValueChange={v => setManualActivityForm(f => ({ ...f, phaseId: v === "_none" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Sin fase" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sin fase</SelectItem>
                    {project.phases.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descripción para el cliente (opcional)</Label>
              <Textarea
                value={manualActivityForm.summaryLevel2}
                onChange={e => setManualActivityForm(f => ({ ...f, summaryLevel2: e.target.value }))}
                placeholder="Explicación clara, sin jerga técnica. Qué cambió y por qué importa."
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Detalle técnico (opcional)</Label>
              <Textarea
                value={manualActivityForm.summaryLevel3}
                onChange={e => setManualActivityForm(f => ({ ...f, summaryLevel3: e.target.value }))}
                placeholder="Implementación, decisiones técnicas, alternativas consideradas, problemas resueltos."
                rows={4}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={manualActivityForm.isSignificant}
                onChange={e => setManualActivityForm(f => ({ ...f, isSignificant: e.target.checked }))}
                className="rounded border-gray-300 text-[#2FA4A9] focus:ring-[#2FA4A9]"
              />
              Marcar como cambio significativo (visible al cliente como destacado)
            </label>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowManualActivity(false)}
                disabled={addManualActivityMut.isPending}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-[#2FA4A9] hover:bg-[#238b8f]"
                disabled={!manualActivityForm.summaryLevel1.trim() || addManualActivityMut.isPending}
                onClick={() => {
                  addManualActivityMut.mutate({
                    summaryLevel1: manualActivityForm.summaryLevel1.trim(),
                    summaryLevel2: manualActivityForm.summaryLevel2.trim() || null,
                    summaryLevel3: manualActivityForm.summaryLevel3.trim() || null,
                    category: manualActivityForm.category,
                    phaseId: manualActivityForm.phaseId || null,
                    isSignificant: manualActivityForm.isSignificant,
                  });
                }}
              >
                {addManualActivityMut.isPending ? "Guardando..." : "Registrar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: resumen semanal */}
      <Dialog open={weeklySummaryModal.open} onOpenChange={(open) => { if (!open) setWeeklySummaryModal({ open: false, summary: null }); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#2FA4A9]" />
              Resumen semanal
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2 space-y-3">
            {weeklySummaryModal.date && (
              <p className="text-xs text-gray-400">
                Generado {format(parseISO(weeklySummaryModal.date), "EEEE d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
              </p>
            )}
            <div className="bg-gradient-to-br from-[#2FA4A9]/5 to-blue-50 border border-[#2FA4A9]/20 rounded-xl p-4">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{weeklySummaryModal.summary}</p>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              <p className="text-[11px] text-gray-400">
                Este resumen también queda guardado y visible para el cliente en su portal.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (weeklySummaryModal.summary) {
                    navigator.clipboard.writeText(weeklySummaryModal.summary);
                    toast({ title: "Resumen copiado al portapapeles" });
                  }
                }}
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copiar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

// ─────────────────────────────────────────────────────────────────
// ProjectFeedbackSection — triage de reportes del cliente
// ─────────────────────────────────────────────────────────────────

type FeedbackItem = {
  id: string;
  projectId: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  attachmentUrls: string[];
  createdBy: string | null;
  reporterName: string | null;
  adminResponse: string | null;
  resolvedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

// ─────────────────────────────────────────────────────────────────
// MeetingsSection — admin agenda reuniones recurrentes con cliente
// ─────────────────────────────────────────────────────────────────

type Meeting = {
  id: string;
  clientProjectId: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  notes: string | null;
  meetLink: string | null;
  googleCalendarEventId: string | null;
  status: string;
  appointmentType: string;
};

function MeetingsSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(45);
  const [notes, setNotes] = useState("");

  const { data: meetings = [], isLoading } = useQuery<Meeting[]>({
    queryKey: [`/api/admin/projects/${projectId}/meetings`],
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/meetings`, { title, date, time, duration, notes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reunión agendada", description: "Se notificó al cliente con magic link al portal." });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${projectId}/meetings`] });
      setShowForm(false);
      setTitle(""); setDate(""); setTime(""); setDuration(45); setNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "No se pudo crear", variant: "destructive" });
    },
  });

  const cancelMut = useMutation({
    mutationFn: async (meetingId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/projects/${projectId}/meetings/${meetingId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reunión cancelada" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${projectId}/meetings`] });
    },
  });

  if (isLoading) return null;

  const upcoming = meetings.filter(m => m.status === "scheduled" && `${m.date} ${m.time}` >= new Date().toISOString().slice(0, 16));
  const past = meetings.filter(m => !(m.status === "scheduled" && `${m.date} ${m.time}` >= new Date().toISOString().slice(0, 16)));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[#2FA4A9]" />
          <h3 className="text-sm font-semibold text-gray-900">Reuniones del proyecto</h3>
          {upcoming.length > 0 && (
            <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
              {upcoming.length} próxima{upcoming.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Nueva reunión
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 mb-4 space-y-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Revisión semanal de avance" className="mt-1 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Hora</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Duración (min)</Label>
              <Input type="number" min={15} max={180} value={duration} onChange={(e) => setDuration(parseInt(e.target.value, 10) || 45)} className="mt-1 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Notas (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Agenda de la reunión..." className="mt-1 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-[#2FA4A9] hover:bg-[#238b8f]"
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !title || !date || !time}
            >
              {createMut.isPending ? "Creando..." : "Crear y notificar al cliente"}
            </Button>
          </div>
        </div>
      )}

      {meetings.length === 0 ? (
        <p className="text-xs text-gray-400">No hay reuniones agendadas para este proyecto.</p>
      ) : (
        <div className="space-y-2">
          {[...upcoming, ...past].map((m) => (
            <div key={m.id} className={`border rounded-lg p-3 ${m.status === "cancelled" ? "border-gray-100 bg-gray-50/50 opacity-60" : "border-gray-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{m.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    📅 {m.date} · 🕒 {m.time} · ⏱️ {m.duration} min
                    {m.status === "cancelled" && " · ❌ Cancelada"}
                  </p>
                  {m.notes && <p className="text-xs text-gray-500 mt-1.5 italic">{m.notes}</p>}
                  {m.meetLink && (
                    <a href={m.meetLink} target="_blank" rel="noopener noreferrer" className="text-xs text-[#2FA4A9] hover:underline inline-flex items-center gap-1 mt-1.5">
                      <ExternalLink className="w-3 h-3" />
                      {m.meetLink}
                    </a>
                  )}
                </div>
                {m.status === "scheduled" && (
                  <button
                    onClick={() => { if (confirm("¿Cancelar esta reunión?")) cancelMut.mutate(m.id); }}
                    className="text-gray-300 hover:text-rose-500 p-1"
                    title="Cancelar reunión"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectFeedbackSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responseDraft, setResponseDraft] = useState<Record<string, string>>({});

  const { data: items = [], isLoading } = useQuery<FeedbackItem[]>({
    queryKey: [`/api/admin/projects/${projectId}/feedback`],
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/admin/projects/${projectId}/feedback/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${projectId}/feedback`] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "No se pudo actualizar", variant: "destructive" });
    },
  });

  const TYPE_META: Record<string, { label: string; emoji: string }> = {
    bug: { label: "Bug", emoji: "🐛" },
    request: { label: "Cambio", emoji: "✨" },
    improvement: { label: "Mejora", emoji: "💡" },
    question: { label: "Pregunta", emoji: "❓" },
  };
  const STATUS_META: Record<string, { label: string; color: string }> = {
    open: { label: "Abierto", color: "bg-gray-100 text-gray-700" },
    triaged: { label: "Revisado", color: "bg-blue-100 text-blue-700" },
    in_progress: { label: "En progreso", color: "bg-amber-100 text-amber-700" },
    resolved: { label: "Resuelto", color: "bg-emerald-100 text-emerald-700" },
    wont_fix: { label: "No procede", color: "bg-slate-100 text-slate-600" },
  };

  const openCount = items.filter(i => i.status === "open" || i.status === "triaged").length;

  if (isLoading) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#2FA4A9]" />
          <h3 className="text-sm font-semibold text-gray-900">Reportes y sugerencias del cliente</h3>
        </div>
        {openCount > 0 && (
          <span className="text-[11px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            {openCount} pendiente{openCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-gray-400">El cliente aún no ha reportado nada.</p>
      ) : (
        <div className="space-y-2">
          {items.map((fb) => {
            const tm = TYPE_META[fb.type] || TYPE_META.request;
            const sm = STATUS_META[fb.status] || STATUS_META.open;
            const isOpen = expandedId === fb.id;
            return (
              <div key={fb.id} className="border border-gray-100 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedId(isOpen ? null : fb.id)}
                  className="w-full text-left px-3 py-2.5 flex items-start gap-3 hover:bg-gray-50"
                >
                  <span className="text-base shrink-0 mt-0.5">{tm.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 truncate">{fb.title}</p>
                      <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${sm.color}`}>{sm.label}</span>
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">{fb.priority}</span>
                      {fb.resolvedTaskId && <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">→ task</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {new Date(fb.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                      {fb.reporterName && ` · ${fb.reporterName}`}
                      {fb.attachmentUrls?.length > 0 && ` · ${fb.attachmentUrls.length} adjunto${fb.attachmentUrls.length > 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-300 shrink-0 mt-1 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-3 bg-gray-50/40">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{fb.description}</p>

                    {fb.attachmentUrls?.length > 0 && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-1.5">Adjuntos</p>
                        <div className="flex flex-wrap gap-2">
                          {fb.attachmentUrls.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs text-gray-700 hover:bg-[#2FA4A9]/[0.05] hover:border-[#2FA4A9]/30 hover:text-[#2FA4A9]"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Adjunto {i + 1}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Status</Label>
                        <select
                          value={fb.status}
                          onChange={(e) => updateMut.mutate({ id: fb.id, body: { status: e.target.value } })}
                          className="mt-1 w-full h-9 rounded-lg border border-gray-200 bg-white text-sm px-2 focus:border-[#2FA4A9] focus:ring-1 focus:ring-[#2FA4A9] outline-none"
                        >
                          <option value="open">Abierto</option>
                          <option value="triaged">Revisado</option>
                          <option value="in_progress">En progreso</option>
                          <option value="resolved">Resuelto</option>
                          <option value="wont_fix">No procede</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Prioridad</Label>
                        <select
                          value={fb.priority}
                          onChange={(e) => updateMut.mutate({ id: fb.id, body: { priority: e.target.value } })}
                          className="mt-1 w-full h-9 rounded-lg border border-gray-200 bg-white text-sm px-2 focus:border-[#2FA4A9] focus:ring-1 focus:ring-[#2FA4A9] outline-none"
                        >
                          <option value="low">Baja</option>
                          <option value="normal">Normal</option>
                          <option value="high">Alta</option>
                          <option value="urgent">Urgente</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Respuesta al cliente</Label>
                      <Textarea
                        value={responseDraft[fb.id] ?? fb.adminResponse ?? ""}
                        onChange={(e) => setResponseDraft({ ...responseDraft, [fb.id]: e.target.value })}
                        rows={2}
                        placeholder="Tu respuesta será visible para el cliente en el portal..."
                        className="mt-1 text-sm"
                      />
                      <div className="flex justify-end mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateMut.mutate({ id: fb.id, body: { adminResponse: responseDraft[fb.id] ?? fb.adminResponse ?? "" } })}
                          disabled={updateMut.isPending}
                        >
                          Guardar respuesta
                        </Button>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                      {!fb.resolvedTaskId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateMut.mutate({ id: fb.id, body: { convertToTask: true } })}
                          disabled={updateMut.isPending}
                          className="gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Convertir en tarea
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
