import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useClientAuth } from "@/hooks/useClientAuth";
import { Send, CheckCircle2, Circle, Clock, AlertCircle, ChevronDown, ChevronRight, ExternalLink, X, Zap, ArrowRight, FileText, Mic, Image, ClipboardCheck, FileSignature, FolderOpen, Download, Lightbulb, ThumbsUp, Plus, Diamond, File, StickyNote, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ── Types ──

type PortalOverview = {
  name: string;
  description: string | null;
  status: string;
  projectType?: "client" | "internal";
  startDate: string | null;
  estimatedEndDate: string | null;
  contactName: string | null;
  progress: number;
  totalHours: number;
  taskCount: number;
  completedTaskCount: number;
  unreadMessageCount: number;
  healthStatus: string;
  healthNote: string | null;
};

type Phase = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  progress: number;
  tasks: Array<{ id: string; title: string; clientFacingTitle: string | null; status: string; priority: string; isMilestone?: boolean; dueDate?: string | null }>;
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
  screenshotUrl: string | null;
  demoUrl: string | null;
};

type ActivityEntry = {
  id: string;
  summaryLevel1: string;
  summaryLevel2: string | null;
  summaryLevel3: string | null;
  category: string;
  isSignificant: boolean;
  createdAt: string;
};

type PulseData = {
  currentFocus: {
    title: string;
    description: string | null;
    phaseName: string | null;
    progress: number;
    lastActivityAt: string | null;
  } | null;
  recentActivity: ActivityEntry[];
};

type InvestmentData = {
  totalBudget: number | null;
  currency: string;
  totalHours: number;
  thisWeekHours: number;
  byCategory: Record<string, number>;
  byWeek: Record<string, number>;
  meetingPct: number;
  buildPct: number;
};

type Message = {
  id: string;
  senderType: string;
  senderName: string;
  content: string;
  isRead: boolean;
  createdAt: string;
};

type PortalSession = {
  id: string;
  title: string;
  date: string;
  duration: number | null;
  summary: string | null;
  actionItems: string[] | null;
  transcription: string | null;
  speakers: string[] | null;
  status: string;
  createdAt: string;
};

type PortalIdea = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  priority: string | null;
  status: string | null;
  suggestedBy: string | null;
  votes: number | null;
  createdAt: string;
};

// ── Constants ──

const HEALTH_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  on_track: { border: "border-l-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" },
  ahead: { border: "border-l-[#2FA4A9]", bg: "bg-[#2FA4A9]/5", text: "text-[#2FA4A9]" },
  at_risk: { border: "border-l-amber-500", bg: "bg-amber-50", text: "text-amber-700" },
  behind: { border: "border-l-red-500", bg: "bg-red-50", text: "text-red-700" },
};

const CATEGORY_LABELS: Record<string, string> = {
  feature: "Funcionalidad",
  bugfix: "Corrección",
  improvement: "Mejora",
  infrastructure: "Infraestructura",
  meeting: "Reunión",
  milestone: "Hito",
  development: "Desarrollo",
  design: "Diseño",
  support: "Soporte",
  planning: "Planeación",
};

const CATEGORY_COLORS: Record<string, string> = {
  feature: "bg-blue-100 text-blue-700",
  bugfix: "bg-orange-100 text-orange-700",
  improvement: "bg-purple-100 text-purple-700",
  infrastructure: "bg-gray-100 text-gray-600",
  meeting: "bg-amber-100 text-amber-700",
  milestone: "bg-emerald-100 text-emerald-700",
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

const PHASE_DOT_COLORS: Record<string, string> = {
  completed: "bg-emerald-500",
  in_progress: "bg-blue-500",
  pending: "bg-gray-300",
};

const DELIV_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  delivered: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

const sections = ["Pulso", "Timeline", "Roadmap", "Entregas", "Calendario", "Documentos", "Sesiones", "Archivos", "Ideas", "Reportes", "Inversión", "Mensajes"];

// ── Helpers ──

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

function formatWeekday(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Hoy";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "short" });
}

// ── Expandable Activity Entry ──

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [showLevel3, setShowLevel3] = useState(false);

  return (
    <div className="group">
      <div
        className="flex items-start gap-3 py-2 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${CATEGORY_COLORS[entry.category] || "bg-gray-100 text-gray-600"}`}>
          {CATEGORY_LABELS[entry.category] || entry.category}
        </span>
        <p className="text-sm text-gray-700 flex-1">{entry.summaryLevel1}</p>
        <span className="text-[10px] text-gray-300 shrink-0 mt-0.5">{timeAgo(entry.createdAt)}</span>
      </div>

      {expanded && entry.summaryLevel2 && (
        <div className="ml-14 mr-4 pb-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <p className="text-sm text-gray-500 leading-relaxed">{entry.summaryLevel2}</p>

          {entry.summaryLevel3 && (
            <>
              <button
                onClick={() => setShowLevel3(!showLevel3)}
                className="text-xs text-[#2FA4A9] hover:underline mt-2 flex items-center gap-1"
              >
                {showLevel3 ? "Ocultar detalle" : "Ver detalle completo"}
                <ChevronDown className={`w-3 h-3 transition-transform ${showLevel3 ? "rotate-180" : ""}`} />
              </button>
              {showLevel3 && (
                <div className="mt-2 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                  {entry.summaryLevel3}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Portal Component ──

export default function Portal() {
  const params = useParams<{ token?: string; projectId?: string }>();
  const isAuthMode = !!params.projectId;
  const { isAuthenticated, isLoading: authLoading, isAdminPreview } = useClientAuth();
  const [, navigate] = useLocation();

  // Auth mode: redirect to login if not authenticated
  useEffect(() => {
    if (isAuthMode && !authLoading && !isAuthenticated) {
      navigate("/portal/login");
    }
  }, [isAuthMode, authLoading, isAuthenticated, navigate]);

  // Oculta el widget del tutor AI en el portal del cliente
  useEffect(() => {
    document.documentElement.setAttribute("data-hide-widgets", "1");
    return () => document.documentElement.removeAttribute("data-hide-widgets");
  }, []);

  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState("Pulso");
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [msgContent, setMsgContent] = useState("");
  const [clientName, setClientName] = useState(() => localStorage.getItem("portal_client_name") || "");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [delivFilter, setDelivFilter] = useState<string>("all");
  const [timelineFilter, setTimelineFilter] = useState<string>("all");
  const [timelineView, setTimelineView] = useState<"gantt" | "feed">(() => {
    if (typeof window === "undefined") return "gantt";
    return (localStorage.getItem("portal_timeline_view") as "gantt" | "feed") || "gantt";
  });
  useEffect(() => { try { localStorage.setItem("portal_timeline_view", timelineView); } catch {} }, [timelineView]);
  const [showIdeaForm, setShowIdeaForm] = useState(false);
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDesc, setIdeaDesc] = useState("");
  // Quick note (proyectos internos)
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSignificant, setNoteSignificant] = useState(false);
  // Feedback / reportes
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [fbType, setFbType] = useState<"bug" | "request" | "improvement" | "question">("request");
  const [fbTitle, setFbTitle] = useState("");
  const [fbDesc, setFbDesc] = useState("");
  const [fbPriority, setFbPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [fbAttachments, setFbAttachments] = useState<string[]>([""]);
  const [fbReporter, setFbReporter] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Either /portal/:token (legacy magic link) or /portal/projects/:projectId (auth).
  // Backend rewrites /api/portal/projects/:projectId/* → /api/portal/<accessToken>/* so handlers are shared.
  const identifier = params.projectId || params.token || "";
  const base = isAuthMode
    ? `/api/portal/projects/${params.projectId}`
    : `/api/portal/${params.token}`;
  const token = identifier; // used for localStorage keys below — kept stable per project

  // Queries
  const { data: overview, isLoading, error } = useQuery<PortalOverview>({ queryKey: [base] });
  const { data: pulse } = useQuery<PulseData>({ queryKey: [`${base}/pulse`], enabled: !!overview, refetchInterval: 60000 });
  const { data: activityEntries = [] } = useQuery<ActivityEntry[]>({ queryKey: [`${base}/activity`], enabled: !!overview });
  const { data: phases = [] } = useQuery<Phase[]>({ queryKey: [`${base}/phases`], enabled: !!overview });
  const { data: deliverables = [] } = useQuery<Deliverable[]>({ queryKey: [`${base}/deliverables`], enabled: !!overview });
  const { data: investment } = useQuery<InvestmentData>({ queryKey: [`${base}/investment`], enabled: !!overview });
  const { data: messages = [] } = useQuery<Message[]>({ queryKey: [`${base}/messages`], enabled: !!overview });
  const { data: files = [] } = useQuery<Array<{ id: string; name: string; type: string; url: string; size: number | null; uploadedBy: string; createdAt: string }>>({
    queryKey: [`${base}/files`], enabled: !!overview,
  });
  const { data: sessions = [] } = useQuery<PortalSession[]>({ queryKey: [`${base}/sessions`], enabled: !!overview });
  const { data: ideas = [] } = useQuery<PortalIdea[]>({ queryKey: [`${base}/ideas`], enabled: !!overview });
  const { data: feedbackItems = [] } = useQuery<Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    priority: string;
    status: string;
    attachmentUrls: string[];
    reporterName: string | null;
    adminResponse: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }>>({
    queryKey: [`/api/portal/projects/${params.projectId}/feedback`],
    enabled: !!overview && isAuthMode,
  });

  // Reuniones del proyecto (calendario)
  const { data: meetings = [] } = useQuery<Array<{
    id: string;
    title: string;
    date: string;
    time: string;
    duration: number;
    notes: string | null;
    meetLink: string | null;
    status: string;
  }>>({
    queryKey: [`${base}/meetings`],
    enabled: !!overview,
  });

  // Analytics preview (only in auth mode, only if connected)
  const { data: analyticsPreview } = useQuery<{
    status: string;
    totals: { sessions: number; users: number; pageviews: number } | null;
  }>({
    queryKey: [`/api/portal/projects/${params.projectId}/analytics`],
    enabled: !!overview && isAuthMode,
  });

  useEffect(() => {
    if (phases.length > 0) setExpandedPhases(new Set(phases.map(p => p.id)));
  }, [phases]);

  useEffect(() => {
    if (activeSection === "Mensajes") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      fetch(`${base}/messages/read`, { method: "PATCH" });
    }
  }, [activeSection, messages]);

  useEffect(() => {
    if (clientName) localStorage.setItem("portal_client_name", clientName);
  }, [clientName]);

  // "What's new" tracking
  const lastVisitKey = `portal_last_visit_${token}`;
  const [lastVisit] = useState(() => {
    const saved = localStorage.getItem(lastVisitKey);
    return saved ? new Date(saved) : new Date(0);
  });

  useEffect(() => {
    // Update last visit timestamp after a short delay so badges show briefly
    const timer = setTimeout(() => {
      localStorage.setItem(lastVisitKey, new Date().toISOString());
    }, 5000);
    return () => clearTimeout(timer);
  }, [lastVisitKey]);

  const newActivityCount = activityEntries.filter(a => new Date(a.createdAt) > lastVisit).length;
  const newDeliverableCount = deliverables.filter(d => d.deliveredAt && new Date(d.deliveredAt) > lastVisit).length;

  // Mutations
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
    mutationFn: async ({ id, status, comment, rating }: { id: string; status: string; comment: string; rating: number }) => {
      await fetch(`${base}/deliverables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, clientComment: comment || null, clientRating: rating || null }),
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`${base}/deliverables`] }); setReviewingId(null); setReviewComment(""); setReviewRating(0); },
  });

  const createIdeaMut = useMutation({
    mutationFn: async ({ title, description }: { title: string; description: string }) => {
      await fetch(`${base}/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`${base}/ideas`] }); setShowIdeaForm(false); setIdeaTitle(""); setIdeaDesc(""); },
  });

  const voteIdeaMut = useMutation({
    mutationFn: async (ideaId: string) => {
      await fetch(`${base}/ideas/${ideaId}/vote`, { method: "PATCH" });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`${base}/ideas`] }); },
  });

  const createFeedbackMut = useMutation({
    mutationFn: async (payload: { type: string; title: string; description: string; priority: string; attachmentUrls: string[]; reporterName: string | null }) => {
      const res = await fetch(`/api/portal/projects/${params.projectId}/feedback`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Error");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/portal/projects/${params.projectId}/feedback`] });
      setShowFeedbackForm(false);
      setFbTitle(""); setFbDesc(""); setFbType("request"); setFbPriority("normal"); setFbAttachments([""]); setFbReporter("");
    },
  });

  const uploadFeedbackFileMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/portal/projects/${params.projectId}/feedback/upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Upload falló");
      return res.json() as Promise<{ url: string; name: string }>;
    },
    onSuccess: (data) => {
      setFbAttachments(prev => {
        const next = prev.filter(u => u.length > 0);
        next.push(data.url);
        return next.length > 0 ? next : [""];
      });
    },
  });

  const createQuickNoteMut = useMutation({
    mutationFn: async ({ text, isSignificant }: { text: string; isSignificant: boolean }) => {
      await fetch(`${base}/quick-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, isSignificant }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${base}/activity`] });
      queryClient.invalidateQueries({ queryKey: [`${base}/pulse`] });
      setShowNoteForm(false);
      setNoteText("");
      setNoteSignificant(false);
    },
  });

  // Loading & error states
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
          <p className="text-gray-500">El link puede haber expirado o ser inválido.</p>
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

  // Group activity by day (with optional filter)
  const filteredActivities = timelineFilter === "all" ? activityEntries : activityEntries.filter(e => e.category === timelineFilter);
  const activityByDay: Record<string, ActivityEntry[]> = {};
  for (const entry of filteredActivities) {
    const dayKey = new Date(entry.createdAt).toISOString().split("T")[0];
    if (!activityByDay[dayKey]) activityByDay[dayKey] = [];
    activityByDay[dayKey].push(entry);
  }
  const activityCategories = [...new Set(activityEntries.map(e => e.category))];

  const pendingDeliverables = deliverables.filter(d => d.status === "delivered");
  const healthStyle = HEALTH_STYLES[overview.healthStatus] || HEALTH_STYLES.on_track;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Banner de admin preview — solo cuando un admin está viendo el portal del cliente */}
      {isAdminPreview && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-center text-xs text-amber-900 sticky top-0 z-50">
          <strong>Vista previa de admin</strong> — estás viendo el portal como lo ve el cliente.
          {" "}
          <a href="/admin/projects" className="underline hover:text-amber-700">Volver al admin</a>
        </div>
      )}
      {/* ── HEADER + HEALTH BANNER ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          {/* Top row: logo + project name */}
          <div className="flex items-center gap-3 py-3">
            <img src="/assets/im3-logo.png" alt="IM3" className="h-5" />
            <div className="h-4 w-px bg-gray-200" />
            <h1 className="text-sm font-semibold text-gray-900 truncate">{overview.name}</h1>
          </div>

          {/* Health banner */}
          <div className={`rounded-lg border-l-4 ${healthStyle.border} ${healthStyle.bg} px-4 py-3 mb-3`}>
            <div className="flex items-center justify-between">
              <p className={`text-sm font-medium ${healthStyle.text}`}>
                {overview.healthNote || "Tu proyecto avanza según lo planeado."}
              </p>
              {overview.estimatedEndDate && (
                <span className="text-xs text-gray-400 shrink-0 ml-4">
                  Entrega: {new Date(overview.estimatedEndDate).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}
                </span>
              )}
            </div>
            {/* Progress bar */}
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1 h-2 bg-white/60 rounded-full overflow-hidden">
                <div className="h-full bg-[#2FA4A9] rounded-full transition-all duration-700" style={{ width: `${overview.progress}%` }} />
              </div>
              <span className="text-xs font-semibold text-gray-500">{overview.progress}%</span>
            </div>
          </div>

          {/* Section nav */}
          <div className="flex gap-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-0">
            {isAuthMode && (
              <Link
                href={`/portal/projects/${params.projectId}/analytics`}
                className="px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors border-transparent text-gray-400 hover:text-gray-700"
              >
                Analytics
              </Link>
            )}
            {sections.map(s => (
              <button
                key={s}
                onClick={() => setActiveSection(s)}
                className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeSection === s
                    ? "border-[#2FA4A9] text-[#2FA4A9]"
                    : "border-transparent text-gray-400 hover:text-gray-700"
                }`}
              >
                {s}
                {s === "Mensajes" && overview.unreadMessageCount > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">
                    {overview.unreadMessageCount}
                  </span>
                )}
                {s === "Entregas" && pendingDeliverables.length > 0 && (
                  <span className="ml-1.5 bg-blue-500 text-white text-[10px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">
                    {pendingDeliverables.length}
                  </span>
                )}
                {s === "Timeline" && newActivityCount > 0 && (
                  <span className="ml-1.5 bg-[#2FA4A9] text-white text-[10px] font-bold rounded-full px-1.5 h-4 inline-flex items-center justify-center">
                    {newActivityCount}
                  </span>
                )}
                {s === "Entregas" && newDeliverableCount > 0 && pendingDeliverables.length === 0 && (
                  <span className="ml-1.5 bg-[#2FA4A9] text-white text-[10px] font-bold rounded-full px-1.5 h-4 inline-flex items-center justify-center">
                    {newDeliverableCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* ── PULSO ── */}
        {activeSection === "Pulso" && (
          <div className="space-y-6">
            {/* Nota rápida — solo proyectos internos */}
            {overview.projectType === "internal" && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                {!showNoteForm ? (
                  <button
                    onClick={() => setShowNoteForm(true)}
                    className="w-full flex items-center gap-3 text-left text-sm text-gray-500 hover:text-[#2FA4A9] transition-colors"
                  >
                    <StickyNote className="w-4 h-4 shrink-0" />
                    <span>Capturar una decisión, idea o avance del día...</span>
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <StickyNote className="w-4 h-4 text-[#2FA4A9]" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Nota rápida</span>
                    </div>
                    <Textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Ej: 'Decidimos usar magic-link híbrido en vez de password puro porque la fricción mata adopción.'"
                      rows={3}
                      autoFocus
                      className="text-sm"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={noteSignificant} onChange={(e) => setNoteSignificant(e.target.checked)} className="rounded" />
                        Marcar como hito importante
                      </label>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setShowNoteForm(false); setNoteText(""); setNoteSignificant(false); }}>Cancelar</Button>
                        <Button
                          size="sm"
                          disabled={createQuickNoteMut.isPending || noteText.trim().length < 3}
                          onClick={() => createQuickNoteMut.mutate({ text: noteText.trim(), isSignificant: noteSignificant })}
                          className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white"
                        >
                          {createQuickNoteMut.isPending ? "Guardando..." : "Guardar"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Analytics preview — solo visible si la conexión está activa */}
            {isAuthMode && analyticsPreview?.status === "connected" && analyticsPreview.totals && (
              <Link
                href={`/portal/projects/${params.projectId}/analytics`}
                className="block bg-gradient-to-br from-[#0F766E] to-[#2FA4A9] rounded-xl p-5 text-white hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/70">Analytics · últimos 30 días</span>
                  <span className="text-xs text-white/80">Ver detalle →</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-2xl font-semibold">{analyticsPreview.totals.sessions.toLocaleString("es")}</div>
                    <div className="text-xs text-white/70 mt-0.5">Sesiones</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">{analyticsPreview.totals.users.toLocaleString("es")}</div>
                    <div className="text-xs text-white/70 mt-0.5">Usuarios</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">{analyticsPreview.totals.pageviews.toLocaleString("es")}</div>
                    <div className="text-xs text-white/70 mt-0.5">Páginas vistas</div>
                  </div>
                </div>
              </Link>
            )}
            {/* Current focus card */}
            {pulse?.currentFocus ? (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-[#2FA4A9]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">En este momento estamos trabajando en</span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">{pulse.currentFocus.title}</h2>
                {pulse.currentFocus.phaseName && (
                  <p className="text-xs text-gray-400 mt-0.5">{pulse.currentFocus.phaseName}</p>
                )}
                {pulse.currentFocus.description && (
                  <p className="text-sm text-gray-500 mt-2 leading-relaxed">{pulse.currentFocus.description}</p>
                )}
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex-1">
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#2FA4A9] rounded-full transition-all duration-500" style={{ width: `${pulse.currentFocus.progress}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{pulse.currentFocus.progress}%</span>
                  {pulse.currentFocus.lastActivityAt && (
                    <span className="text-xs text-gray-300">Última actividad: {timeAgo(pulse.currentFocus.lastActivityAt)}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
                <p className="text-gray-400 text-sm">No hay tarea activa en este momento.</p>
              </div>
            )}

            {/* Recent activity (48h) */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Actividad reciente</h3>
              {(pulse?.recentActivity || []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No hay actividad registrada aún.</p>
              ) : (
                <div className="space-y-1">
                  {pulse!.recentActivity.map(entry => (
                    <ActivityItem key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Progreso", value: `${overview.progress}%` },
                { label: "Tareas", value: `${overview.completedTaskCount}/${overview.taskCount}` },
                { label: "Horas", value: `${overview.totalHours.toFixed(1)}h` },
                { label: "Entregas", value: `${deliverables.filter(d => d.status === "approved").length} aprobadas` },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400">{s.label}</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TIMELINE ── */}
        {activeSection === "Timeline" && (
          <div className="space-y-6">
            {/* Toggle de vista */}
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setTimelineView("gantt")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    timelineView === "gantt" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  📊 Gantt
                </button>
                <button
                  onClick={() => setTimelineView("feed")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    timelineView === "feed" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  📜 Cronología
                </button>
              </div>
            </div>

            {/* Vista Gantt — barras de fases sobre eje temporal */}
            {timelineView === "gantt" && (() => {
              const allDates: number[] = [];
              phases.forEach(phase => {
                if (phase.startDate) allDates.push(new Date(phase.startDate).getTime());
                if (phase.endDate) allDates.push(new Date(phase.endDate).getTime());
                phase.tasks.forEach(t => { if (t.dueDate) allDates.push(new Date(t.dueDate).getTime()); });
              });
              if (allDates.length < 2) {
                return (
                  <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                    <p className="text-gray-400 text-sm font-medium mb-1">Timeline visual no disponible aún</p>
                    <p className="text-gray-300 text-xs">Las fases del proyecto aún no tienen fechas asignadas. Mientras tanto, mira la vista Cronología →</p>
                  </div>
                );
              }
              const minTime = Math.min(...allDates);
              const maxTime = Math.max(...allDates);
              const totalMs = Math.max(maxTime - minTime, 86400000);
              const today = Date.now();
              const todayPos = Math.max(0, Math.min(100, ((today - minTime) / totalMs) * 100));
              const PHASE_COLORS = ["#2FA4A9", "#3B82F6", "#8B5CF6", "#D97706", "#EC4899", "#10B981"];
              const getPos = (dateStr: string | null) => dateStr ? Math.max(0, Math.min(100, ((new Date(dateStr).getTime() - minTime) / totalMs) * 100)) : null;

              // Generar ticks mensuales
              const months: Date[] = [];
              const cursor = new Date(minTime);
              cursor.setDate(1);
              while (cursor.getTime() <= maxTime) {
                months.push(new Date(cursor));
                cursor.setMonth(cursor.getMonth() + 1);
              }
              const monthName = (d: Date) => d.toLocaleDateString("es-CO", { month: "short", year: d.getMonth() === 0 ? "numeric" : undefined });

              return (
                <div className="bg-white rounded-xl border border-gray-200 p-5 overflow-x-auto">
                  <div className="relative min-w-[560px]">
                    {/* Eje de meses */}
                    <div className="relative h-10 mb-4">
                      <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-200" />
                      {months.map((month, i) => {
                        const pos = Math.max(0, Math.min(100, ((month.getTime() - minTime) / totalMs) * 100));
                        const isJan = month.getMonth() === 0;
                        return (
                          <div key={i} className="absolute bottom-0" style={{ left: `${pos}%` }}>
                            <div className="absolute bottom-0 w-px h-3 bg-gray-300" />
                            <div className="absolute bottom-[-18px] -translate-x-1/2 whitespace-nowrap">
                              <span className={`text-[10px] ${isJan ? "font-bold text-gray-600" : "text-gray-400"}`}>{monthName(month)}</span>
                            </div>
                            <div className="absolute top-6 w-px bg-gray-100/50 pointer-events-none" style={{ height: `${phases.length * 60 + 30}px`, zIndex: 0 }} />
                          </div>
                        );
                      })}
                      {/* Marcador "Hoy" */}
                      <div className="absolute bottom-0 z-20" style={{ left: `${todayPos}%` }}>
                        <div className="absolute -top-7 -translate-x-1/2 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">Hoy</div>
                        <div className="absolute bottom-0 w-px h-3 bg-rose-400" />
                      </div>
                    </div>

                    <div className="h-4" />

                    {/* Barras de fases */}
                    <div className="space-y-4">
                      {phases.map((phase, idx) => {
                        const color = PHASE_COLORS[idx % PHASE_COLORS.length];
                        const left = getPos(phase.startDate) ?? 0;
                        const right = getPos(phase.endDate) ?? 100;
                        const width = Math.max(right - left, 3);
                        const completed = phase.tasks.filter(t => t.status === "completed").length;
                        const phaseProgress = phase.tasks.length > 0 ? (completed / phase.tasks.length) * 100 : 0;
                        const isComplete = phaseProgress === 100;
                        return (
                          <div key={phase.id} className="relative h-12">
                            <div className="absolute inset-y-0 left-0 right-0 bg-gray-50 rounded-md" />
                            <div
                              className="absolute top-1 bottom-1 rounded-md flex items-center px-3 shadow-sm overflow-hidden"
                              style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color, opacity: isComplete ? 0.8 : 1 }}
                              title={`${phase.name} · ${phase.startDate ? new Date(phase.startDate).toLocaleDateString("es-CO") : ""} → ${phase.endDate ? new Date(phase.endDate).toLocaleDateString("es-CO") : ""}`}
                            >
                              {/* Progreso interno */}
                              <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${phaseProgress}%` }} />
                              <div className="relative z-10 flex items-center gap-2 text-white text-xs font-medium truncate">
                                {isComplete && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                                <span className="truncate">{phase.name}</span>
                                <span className="text-white/80 text-[10px] shrink-0">{Math.round(phaseProgress)}%</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-[11px] text-gray-400 text-center mt-6">Cada barra es una fase del proyecto. La franja blanca interna muestra el porcentaje completado.</p>
                  </div>
                </div>
              );
            })()}

            {/* Vista Feed — actividad cronológica con filtros */}
            {timelineView === "feed" && (
              <>
                {activityCategories.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto">
                    <button
                      onClick={() => setTimelineFilter("all")}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                        timelineFilter === "all" ? "bg-[#2FA4A9] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      Todas ({activityEntries.length})
                    </button>
                    {activityCategories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setTimelineFilter(cat)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                          timelineFilter === cat ? "bg-[#2FA4A9] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {CATEGORY_LABELS[cat] || cat} ({activityEntries.filter(e => e.category === cat).length})
                      </button>
                    ))}
                  </div>
                )}

                {Object.keys(activityByDay).length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400">No hay actividad registrada aún.</p>
                    <p className="text-xs text-gray-300 mt-1">Cuando el equipo empiece a trabajar, aquí verás todo lo que se hace.</p>
                  </div>
                ) : (
                  Object.entries(activityByDay).sort(([a], [b]) => b.localeCompare(a)).map(([day, entries]) => (
                    <div key={day}>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 sticky top-[180px] bg-gray-50 py-1 z-10">
                        {formatWeekday(day)}
                      </h3>
                      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-1">
                        {entries.map(entry => (
                          <ActivityItem key={entry.id} entry={entry} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        )}

        {/* ── ROADMAP ── */}
        {activeSection === "Roadmap" && (
          <div className="space-y-4">
            {/* Visual timeline bar (desktop) */}
            <div className="hidden sm:flex gap-1 bg-white rounded-xl border border-gray-200 p-4">
              {phases.map((ph, idx) => {
                const width = phases.length > 0 ? 100 / phases.length : 100;
                return (
                  <div key={ph.id} style={{ width: `${width}%` }} className="text-center">
                    <div className={`h-2 rounded-full ${ph.status === "completed" ? "bg-emerald-500" : ph.status === "in_progress" ? "bg-blue-500" : "bg-gray-200"}`} />
                    <p className="text-[10px] font-medium text-gray-600 mt-1.5 truncate">{ph.name}</p>
                    <p className="text-[10px] text-gray-400">{ph.progress}%</p>
                  </div>
                );
              })}
            </div>

            {/* Next milestone */}
            {(() => {
              const nextPhase = phases.find(p => p.status === "in_progress") || phases.find(p => p.status === "pending");
              const nextTask = nextPhase?.tasks.find(t => t.status === "in_progress" || t.status === "pending");
              if (!nextPhase) return null;
              return (
                <div className="bg-[#2FA4A9]/5 border border-[#2FA4A9]/20 rounded-xl p-4 flex items-center gap-3">
                  <ArrowRight className="w-5 h-5 text-[#2FA4A9] shrink-0" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#2FA4A9]">Próximo hito</p>
                    <p className="text-sm text-gray-700 mt-0.5">
                      {nextTask ? (nextTask.clientFacingTitle || nextTask.title) : nextPhase.name}
                    </p>
                    {nextPhase.endDate && (
                      <p className="text-xs text-gray-400 mt-0.5">Fecha estimada: {formatDate(nextPhase.endDate)}</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Phase cards */}
            {phases.map((phase, idx) => {
              const isExpanded = expandedPhases.has(phase.id);
              return (
                <div key={phase.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => togglePhase(phase.id)}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${PHASE_DOT_COLORS[phase.status] || "bg-gray-300"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-gray-300">FASE {idx + 1}</span>
                        <h3 className="font-medium text-gray-900 truncate">{phase.name}</h3>
                      </div>
                      {phase.startDate && phase.endDate && (
                        <p className="text-[10px] text-gray-400">{formatDate(phase.startDate)} — {formatDate(phase.endDate)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#2FA4A9] rounded-full" style={{ width: `${phase.progress}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 w-8 text-right">{phase.progress}%</span>
                    </div>
                  </div>

                  {isExpanded && phase.tasks.length > 0 && (
                    <div className="border-t border-gray-100 px-5 py-3 space-y-1.5">
                      {phase.tasks.map(task => {
                        const Icon = TASK_ICONS[task.status] || Circle;
                        return (
                          <div key={task.id} className={`flex items-center gap-3 py-1 ${task.isMilestone ? "bg-amber-50/60 -mx-1 px-1 rounded" : ""}`}>
                            {task.isMilestone ? <span className="text-amber-500 shrink-0">🏁</span> : <Icon className={`w-4 h-4 shrink-0 ${TASK_COLORS[task.status]}`} />}
                            <span className={`text-sm flex-1 ${task.status === "completed" ? "line-through text-gray-400" : "text-gray-700"} ${task.isMilestone ? "font-semibold" : ""}`}>
                              {task.clientFacingTitle || task.title}
                            </span>
                            {task.dueDate && (
                              <span className="text-[10px] text-gray-400 shrink-0">
                                {new Date(task.dueDate).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                              </span>
                            )}
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
            {/* Pending review banner */}
            {pendingDeliverables.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-blue-600">{pendingDeliverables.length}</span>
                </div>
                <p className="text-sm text-blue-700">
                  Tienes {pendingDeliverables.length} entrega{pendingDeliverables.length > 1 ? "s" : ""} pendiente{pendingDeliverables.length > 1 ? "s" : ""} de revisión.
                </p>
              </div>
            )}

            {/* Filter tabs */}
            {deliverables.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto">
                {[
                  { key: "all", label: "Todas", count: deliverables.length },
                  { key: "delivered", label: "Por revisar", count: deliverables.filter(d => d.status === "delivered").length },
                  { key: "approved", label: "Aprobadas", count: deliverables.filter(d => d.status === "approved").length },
                  { key: "rejected", label: "Rechazadas", count: deliverables.filter(d => d.status === "rejected").length },
                ].filter(f => f.key === "all" || f.count > 0).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setDelivFilter(f.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                      delivFilter === f.key ? "bg-[#2FA4A9] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>
            )}

            {deliverables.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400">Las entregas aparecerán aquí cuando el equipo las registre.</p>
              </div>
            ) : (
              (delivFilter === "all" ? deliverables : deliverables.filter(d => d.status === delivFilter)).map(d => (
                <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start gap-4">
                    {d.screenshotUrl && (
                      <img src={d.screenshotUrl} alt={d.title} className="w-20 h-20 rounded-lg object-cover border border-gray-100 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-gray-900">{d.title}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${DELIV_COLORS[d.status]}`}>{d.status}</span>
                      </div>
                      {d.description && <p className="text-sm text-gray-500 mt-1">{d.description}</p>}
                      {d.deliveredAt && <p className="text-xs text-gray-400 mt-1">Entregado: {formatDate(d.deliveredAt)}</p>}
                      {d.clientComment && (
                        <p className="text-sm text-amber-600 mt-2 bg-amber-50 px-3 py-1.5 rounded-lg">Tu comentario: {d.clientComment}</p>
                      )}
                      {d.demoUrl && (
                        <a href={d.demoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm text-[#2FA4A9] hover:underline font-medium">
                          Ver demo <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {d.status === "delivered" && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      {reviewingId === d.id ? (
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-gray-500 mb-1.5">¿Cómo calificas esta entrega?</p>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map(star => (
                                <button
                                  key={star}
                                  onClick={() => setReviewRating(star)}
                                  className={`text-xl transition-colors ${star <= reviewRating ? "text-amber-400" : "text-gray-200 hover:text-amber-200"}`}
                                >
                                  ★
                                </button>
                              ))}
                            </div>
                          </div>
                          <Textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} placeholder="Comentario opcional..." rows={2} />
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => reviewDelivMut.mutate({ id: d.id, status: "approved", comment: reviewComment, rating: reviewRating })}>Aprobar</Button>
                            <Button size="sm" variant="destructive" onClick={() => reviewDelivMut.mutate({ id: d.id, status: "rejected", comment: reviewComment, rating: reviewRating })}>Rechazar</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setReviewingId(null); setReviewComment(""); setReviewRating(0); }}><X className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" className="bg-[#2FA4A9] hover:bg-[#238b8f]" onClick={() => setReviewingId(d.id)}>Revisar entrega</Button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── CALENDARIO ── */}
        {activeSection === "Calendario" && (() => {
          const now = new Date();
          const upcoming = meetings.filter(m => m.status === "scheduled" && new Date(`${m.date}T${m.time}:00`) >= now);
          const past = meetings.filter(m => !(m.status === "scheduled" && new Date(`${m.date}T${m.time}:00`) >= now));
          const next = upcoming.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0];

          // Genera URL para que el cliente agregue a su Google Calendar
          const buildCalendarUrl = (m: typeof meetings[number]) => {
            const start = new Date(`${m.date}T${m.time}:00-05:00`); // Bogotá UTC-5
            const end = new Date(start.getTime() + m.duration * 60_000);
            const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
            const params = new URLSearchParams({
              action: "TEMPLATE",
              text: m.title,
              dates: `${fmt(start)}/${fmt(end)}`,
              details: `${m.notes || `Reunión del proyecto ${overview.name}`}${m.meetLink ? `\n\nLink de Meet: ${m.meetLink}` : ""}`,
              location: m.meetLink || "",
            });
            return `https://calendar.google.com/calendar/render?${params.toString()}`;
          };

          const countdown = (m: typeof meetings[number]) => {
            const target = new Date(`${m.date}T${m.time}:00-05:00`);
            const diffMs = target.getTime() - Date.now();
            if (diffMs <= 0) return "Empezando ahora";
            const hours = Math.floor(diffMs / 3_600_000);
            const days = Math.floor(hours / 24);
            if (days > 0) return `En ${days} día${days > 1 ? "s" : ""}`;
            if (hours > 0) return `En ${hours}h`;
            const minutes = Math.floor(diffMs / 60_000);
            return `En ${minutes} min`;
          };

          return (
            <div className="space-y-6">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Calendario de reuniones</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Próximas reuniones del proyecto y el historial. Puedes agregar cada reunión a tu propio calendario.</p>
              </div>

              {next && (
                <div className="rounded-xl bg-gradient-to-br from-[#0F766E] to-[#2FA4A9] text-white p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase tracking-wider text-white/70 font-semibold">Próxima reunión</span>
                    <span className="text-xs text-white/90 font-medium">{countdown(next)}</span>
                  </div>
                  <p className="text-lg font-semibold">{next.title}</p>
                  <p className="text-sm text-white/80 mt-0.5">
                    📅 {new Date(`${next.date}T${next.time}:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
                    {" · "} 🕒 {next.time} · ⏱️ {next.duration} min
                  </p>
                  {next.notes && <p className="text-sm text-white/80 mt-2 italic">{next.notes}</p>}
                  <div className="flex flex-wrap gap-2 mt-4">
                    {next.meetLink && (
                      <a
                        href={next.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-[#0F766E] text-sm font-medium hover:bg-white/90"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Unirse a Meet
                      </a>
                    )}
                    <a
                      href={buildCalendarUrl(next)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 text-white text-sm font-medium hover:bg-white/25 border border-white/20"
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                      Agregar a mi calendario
                    </a>
                  </div>
                </div>
              )}

              {upcoming.length > 1 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Próximas</h3>
                  <div className="space-y-2">
                    {upcoming.slice(1).map(m => (
                      <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{m.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              📅 {new Date(`${m.date}T${m.time}:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long" })} · 🕒 {m.time} · ⏱️ {m.duration} min
                            </p>
                            {m.notes && <p className="text-xs text-gray-500 italic mt-1">{m.notes}</p>}
                          </div>
                          <a
                            href={buildCalendarUrl(m)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[#2FA4A9] hover:underline shrink-0"
                          >
                            Agregar al calendario →
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {past.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Anteriores</h3>
                  <div className="space-y-1">
                    {past.map(m => (
                      <div key={m.id} className={`text-sm flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ${m.status === "cancelled" ? "border-gray-100 bg-gray-50/50 text-gray-400" : "border-gray-100"}`}>
                        <span className="truncate">{m.title}</span>
                        <span className="text-xs text-gray-400 shrink-0">
                          {new Date(`${m.date}T${m.time}:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                          {m.status === "cancelled" && " · cancelada"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {meetings.length === 0 && (
                <div className="text-center py-12">
                  <CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No hay reuniones agendadas todavía.</p>
                  <p className="text-xs text-gray-300 mt-1">Cuando el equipo de IM3 agende una sesión contigo, aparecerá aquí con link de Meet y opción para agregar a tu calendario.</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── DOCUMENTOS ── */}
        {activeSection === "Documentos" && (() => {
          const FILE_ICONS: Record<string, typeof FileText> = {
            document: FileText,
            contract: FileSignature,
            image: Image,
            design: Image,
            recording: Mic,
            transcript: FileText,
            other: FolderOpen,
          };
          const FILE_TYPE_LABELS: Record<string, string> = {
            document: "Documento",
            contract: "Contrato",
            image: "Imagen",
            design: "Diseño",
            recording: "Grabación",
            transcript: "Transcripción",
            other: "Archivo",
          };
          const FILE_TYPE_COLORS: Record<string, string> = {
            document: "bg-blue-100 text-blue-700",
            contract: "bg-purple-100 text-purple-700",
            image: "bg-pink-100 text-pink-700",
            design: "bg-indigo-100 text-indigo-700",
            recording: "bg-amber-100 text-amber-700",
            transcript: "bg-emerald-100 text-emerald-700",
            other: "bg-gray-100 text-gray-600",
          };

          // Group by type
          const grouped: Record<string, typeof files> = {};
          for (const f of files) {
            const t = f.type || "other";
            if (!grouped[t]) grouped[t] = [];
            grouped[t].push(f);
          }

          return (
            <div className="space-y-6">
              {files.length === 0 ? (
                <div className="text-center py-12">
                  <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No hay documentos disponibles aún.</p>
                  <p className="text-xs text-gray-400 mt-1">Los archivos aparecerán aquí cuando el equipo los comparta.</p>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {Object.entries(grouped).map(([type, items]) => (
                      <span key={type} className={`text-xs px-2.5 py-1 rounded-full font-medium ${FILE_TYPE_COLORS[type] || FILE_TYPE_COLORS.other}`}>
                        {FILE_TYPE_LABELS[type] || type} ({items.length})
                      </span>
                    ))}
                  </div>

                  {/* Files by type */}
                  {Object.entries(grouped).map(([type, items]) => {
                    const Icon = FILE_ICONS[type] || FolderOpen;
                    return (
                      <div key={type}>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5" />
                          {FILE_TYPE_LABELS[type] || type}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {items.map(file => {
                            const FileIcon = FILE_ICONS[file.type] || FolderOpen;
                            return (
                              <a
                                key={file.id}
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 hover:border-[#2FA4A9]/30 hover:shadow-sm transition-all group"
                              >
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${FILE_TYPE_COLORS[file.type] || FILE_TYPE_COLORS.other}`}>
                                  <FileIcon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-[#2FA4A9] transition-colors">{file.name}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {new Date(file.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                                    {file.size && ` · ${(file.size / 1024 / 1024).toFixed(1)} MB`}
                                  </p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-[#2FA4A9] shrink-0 mt-1 transition-colors" />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })()}

        {/* ── SESIONES ── */}
        {activeSection === "Sesiones" && (
          <div className="space-y-4">
            {sessions.length === 0 ? (
              <div className="text-center py-12">
                <Mic className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No hay sesiones registradas aún.</p>
                <p className="text-xs text-gray-400 mt-1">Las grabaciones y transcripciones de reuniones aparecerán aquí.</p>
              </div>
            ) : (
              sessions.map(session => (
                <details key={session.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden group">
                  <summary className="px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors list-none">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#2FA4A9]/10 flex items-center justify-center shrink-0">
                        <Mic className="w-5 h-5 text-[#2FA4A9]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900">{session.title}</h3>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-gray-400">
                            {new Date(session.date).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                          {session.duration && (
                            <span className="text-xs text-gray-400">{session.duration} min</span>
                          )}
                          {session.speakers && session.speakers.length > 0 && (
                            <span className="text-xs text-gray-400">{session.speakers.length} participante{session.speakers.length > 1 ? "s" : ""}</span>
                          )}
                        </div>
                        {session.summary && (
                          <p className="text-sm text-gray-500 mt-2 leading-relaxed line-clamp-2">{session.summary}</p>
                        )}
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-300 shrink-0 mt-1 group-open:rotate-180 transition-transform" />
                    </div>
                  </summary>
                  <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                    {/* Action Items */}
                    {session.actionItems && session.actionItems.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          Action Items
                        </h4>
                        <ul className="space-y-1.5">
                          {session.actionItems.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                              <span className="w-1.5 h-1.5 bg-[#2FA4A9] rounded-full shrink-0 mt-1.5" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* Transcription */}
                    {session.transcription && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" />
                          Transcripción
                        </h4>
                        <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-lg p-4 max-h-80 overflow-y-auto">
                          {session.transcription}
                        </div>
                      </div>
                    )}
                    {/* Empty inner state */}
                    {!session.summary && (!session.actionItems || session.actionItems.length === 0) && !session.transcription && (
                      <p className="text-sm text-gray-400 text-center py-4">Esta sesión no tiene transcripción ni resumen disponible.</p>
                    )}
                  </div>
                </details>
              ))
            )}
          </div>
        )}

        {/* ── ARCHIVOS ── */}
        {activeSection === "Archivos" && (() => {
          const ARCH_ICONS: Record<string, typeof FileText> = {
            document: FileText,
            contract: FileSignature,
            image: Image,
            design: Image,
            recording: Mic,
            transcript: FileText,
            other: File,
          };
          const ARCH_TYPE_LABELS: Record<string, string> = {
            document: "Documento",
            contract: "Contrato",
            image: "Imagen",
            design: "Diseño",
            recording: "Grabación",
            transcript: "Transcripción",
            other: "Archivo",
          };
          const ARCH_TYPE_COLORS: Record<string, string> = {
            document: "bg-blue-100 text-blue-700",
            contract: "bg-purple-100 text-purple-700",
            image: "bg-pink-100 text-pink-700",
            design: "bg-indigo-100 text-indigo-700",
            recording: "bg-amber-100 text-amber-700",
            transcript: "bg-emerald-100 text-emerald-700",
            other: "bg-gray-100 text-gray-600",
          };

          return (
            <div className="space-y-4">
              {files.length === 0 ? (
                <div className="text-center py-12">
                  <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No hay archivos disponibles aún.</p>
                  <p className="text-xs text-gray-400 mt-1">Los archivos del proyecto aparecerán aquí cuando el equipo los comparta.</p>
                </div>
              ) : (
                <>
                  {/* Type summary badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {(() => {
                      const typeCounts: Record<string, number> = {};
                      for (const f of files) {
                        const t = f.type || "other";
                        typeCounts[t] = (typeCounts[t] || 0) + 1;
                      }
                      return Object.entries(typeCounts).map(([type, count]) => (
                        <span key={type} className={`text-xs px-2.5 py-1 rounded-full font-medium ${ARCH_TYPE_COLORS[type] || ARCH_TYPE_COLORS.other}`}>
                          {ARCH_TYPE_LABELS[type] || type} ({count})
                        </span>
                      ));
                    })()}
                  </div>

                  {/* File grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {files.map(file => {
                      const Icon = ARCH_ICONS[file.type] || File;
                      return (
                        <a
                          key={file.id}
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 hover:border-[#2FA4A9]/30 hover:shadow-sm transition-all group"
                        >
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${ARCH_TYPE_COLORS[file.type] || ARCH_TYPE_COLORS.other}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate group-hover:text-[#2FA4A9] transition-colors">{file.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(file.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                              {file.size && ` · ${(file.size / 1024 / 1024).toFixed(1)} MB`}
                            </p>
                          </div>
                          <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-[#2FA4A9] shrink-0 mt-1 transition-colors" />
                        </a>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* ── IDEAS ── */}
        {activeSection === "Ideas" && (
          <div className="space-y-4">
            {/* Header with add button */}
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Ideas y sugerencias</h2>
              <Button
                size="sm"
                className="bg-[#2FA4A9] hover:bg-[#238b8f] gap-1.5"
                onClick={() => setShowIdeaForm(!showIdeaForm)}
              >
                <Plus className="w-4 h-4" />
                Sugerir idea
              </Button>
            </div>

            {/* New idea form */}
            {showIdeaForm && (
              <div className="bg-white rounded-xl border border-[#2FA4A9]/30 p-5 space-y-3">
                <Input
                  value={ideaTitle}
                  onChange={e => setIdeaTitle(e.target.value)}
                  placeholder="Título de la idea..."
                  className="text-sm"
                />
                <Textarea
                  value={ideaDesc}
                  onChange={e => setIdeaDesc(e.target.value)}
                  placeholder="Describe tu idea o sugerencia..."
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-[#2FA4A9] hover:bg-[#238b8f]"
                    disabled={!ideaTitle.trim() || createIdeaMut.isPending}
                    onClick={() => createIdeaMut.mutate({ title: ideaTitle.trim(), description: ideaDesc.trim() })}
                  >
                    {createIdeaMut.isPending ? "Enviando..." : "Enviar idea"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowIdeaForm(false); setIdeaTitle(""); setIdeaDesc(""); }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Ideas list */}
            {ideas.length === 0 && !showIdeaForm ? (
              <div className="text-center py-12">
                <Lightbulb className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No hay ideas registradas aún.</p>
                <p className="text-xs text-gray-400 mt-1">Sugiere mejoras o funcionalidades para tu proyecto.</p>
              </div>
            ) : (
              ideas.map(idea => {
                const IDEA_STATUS_COLORS: Record<string, string> = {
                  suggested: "bg-gray-100 text-gray-600",
                  considering: "bg-amber-100 text-amber-700",
                  planned: "bg-blue-100 text-blue-700",
                  implemented: "bg-emerald-100 text-emerald-700",
                  dismissed: "bg-red-100 text-red-600",
                };
                const IDEA_STATUS_LABELS: Record<string, string> = {
                  suggested: "Sugerida",
                  considering: "En consideración",
                  planned: "Planeada",
                  implemented: "Implementada",
                  dismissed: "Descartada",
                };
                const IDEA_PRIORITY_COLORS: Record<string, string> = {
                  low: "text-gray-400",
                  medium: "text-amber-500",
                  high: "text-red-500",
                };

                return (
                  <div key={idea.id} className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        idea.suggestedBy === "client" ? "bg-[#2FA4A9]/10" : "bg-purple-100"
                      }`}>
                        {idea.suggestedBy === "client" ? (
                          <Lightbulb className="w-5 h-5 text-[#2FA4A9]" />
                        ) : (
                          <Diamond className="w-5 h-5 text-purple-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-gray-900">{idea.title}</h3>
                          {idea.status && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${IDEA_STATUS_COLORS[idea.status] || "bg-gray-100 text-gray-600"}`}>
                              {IDEA_STATUS_LABELS[idea.status] || idea.status}
                            </span>
                          )}
                          {idea.priority && (
                            <span className={`text-[10px] font-medium ${IDEA_PRIORITY_COLORS[idea.priority] || "text-gray-400"}`}>
                              {idea.priority === "high" ? "Alta" : idea.priority === "medium" ? "Media" : "Baja"} prioridad
                            </span>
                          )}
                        </div>
                        {idea.description && (
                          <p className="text-sm text-gray-500 mt-1 leading-relaxed">{idea.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-gray-300">
                            {idea.suggestedBy === "client" ? "Tu sugerencia" : "Sugerencia del equipo"}
                          </span>
                          <span className="text-xs text-gray-300">
                            {new Date(idea.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => voteIdeaMut.mutate(idea.id)}
                        disabled={voteIdeaMut.isPending}
                        className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg border border-gray-200 hover:border-[#2FA4A9]/30 hover:bg-[#2FA4A9]/5 transition-all shrink-0"
                      >
                        <ThumbsUp className="w-4 h-4 text-gray-400" />
                        <span className="text-xs font-semibold text-gray-600">{idea.votes || 0}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── REPORTES ── */}
        {activeSection === "Reportes" && (
          <div className="space-y-4">
            {/* Header con botón */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Reportes y sugerencias</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Reporta bugs, pide cambios o comparte ideas. Adjunta capturas, imágenes o videos para mayor claridad.</p>
              </div>
              <Button
                size="sm"
                className="bg-[#2FA4A9] hover:bg-[#238b8f] gap-1.5"
                onClick={() => setShowFeedbackForm(!showFeedbackForm)}
              >
                <Plus className="w-4 h-4" />
                Nuevo reporte
              </Button>
            </div>

            {/* Form */}
            {showFeedbackForm && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Tipo</label>
                    <select
                      value={fbType}
                      onChange={(e) => setFbType(e.target.value as any)}
                      className="mt-1 w-full h-9 rounded-lg border border-gray-200 bg-white text-sm px-2 focus:border-[#2FA4A9] focus:ring-1 focus:ring-[#2FA4A9] outline-none"
                    >
                      <option value="bug">🐛 Bug</option>
                      <option value="request">✨ Cambio solicitado</option>
                      <option value="improvement">💡 Mejora</option>
                      <option value="question">❓ Pregunta</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Prioridad</label>
                    <select
                      value={fbPriority}
                      onChange={(e) => setFbPriority(e.target.value as any)}
                      className="mt-1 w-full h-9 rounded-lg border border-gray-200 bg-white text-sm px-2 focus:border-[#2FA4A9] focus:ring-1 focus:ring-[#2FA4A9] outline-none"
                    >
                      <option value="low">Baja</option>
                      <option value="normal">Normal</option>
                      <option value="high">Alta</option>
                      <option value="urgent">Urgente</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Tu nombre (opcional)</label>
                    <Input
                      value={fbReporter}
                      onChange={(e) => setFbReporter(e.target.value)}
                      placeholder="Para identificar quién reportó"
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Título</label>
                  <Input
                    value={fbTitle}
                    onChange={(e) => setFbTitle(e.target.value)}
                    placeholder="Resumen breve del reporte"
                    className="mt-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Descripción</label>
                  <Textarea
                    value={fbDesc}
                    onChange={(e) => setFbDesc(e.target.value)}
                    placeholder="Cuéntanos qué pasa, qué esperabas, cómo reproducirlo..."
                    rows={4}
                    className="mt-1 text-sm"
                  />
                </div>

                {/* Adjuntos */}
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Adjuntos (capturas, imágenes, videos)</label>
                  <label
                    htmlFor="feedback-file-upload"
                    className={`mt-1 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg p-6 cursor-pointer transition-colors hover:border-[#2FA4A9]/50 hover:bg-[#2FA4A9]/[0.02] ${uploadFeedbackFileMut.isPending ? "opacity-60 pointer-events-none" : ""}`}
                  >
                    <FolderOpen className="w-5 h-5 text-gray-400" />
                    <p className="text-xs text-gray-500">
                      {uploadFeedbackFileMut.isPending
                        ? "Subiendo a Drive..."
                        : "Click para subir archivo (imagen, video, PDF — hasta 50MB)"}
                    </p>
                    <input
                      id="feedback-file-upload"
                      type="file"
                      className="hidden"
                      accept="image/*,video/*,application/pdf,.doc,.docx,.xlsx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadFeedbackFileMut.mutate(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <p className="text-[11px] text-gray-400 mt-2">O pega una URL externa (Drive, Loom, imgur, YouTube, etc):</p>
                  {fbAttachments.map((url, i) => (
                    <div key={i} className="flex gap-2 mt-1">
                      <Input
                        value={url}
                        onChange={(e) => {
                          const next = [...fbAttachments];
                          next[i] = e.target.value;
                          setFbAttachments(next);
                        }}
                        placeholder="https://..."
                        className="text-sm h-8"
                      />
                      {fbAttachments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setFbAttachments(fbAttachments.filter((_, idx) => idx !== i))}
                          className="text-gray-300 hover:text-rose-500 px-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {fbAttachments.length < 10 && (
                    <button
                      type="button"
                      onClick={() => setFbAttachments([...fbAttachments, ""])}
                      className="text-xs text-gray-400 hover:text-[#2FA4A9] mt-2 inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> agregar otra URL
                    </button>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowFeedbackForm(false);
                      setFbTitle(""); setFbDesc(""); setFbType("request"); setFbPriority("normal"); setFbAttachments([""]); setFbReporter("");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-[#2FA4A9] hover:bg-[#238b8f]"
                    disabled={createFeedbackMut.isPending || fbTitle.trim().length < 3 || fbDesc.trim().length < 5}
                    onClick={() =>
                      createFeedbackMut.mutate({
                        type: fbType,
                        title: fbTitle.trim(),
                        description: fbDesc.trim(),
                        priority: fbPriority,
                        attachmentUrls: fbAttachments.map(u => u.trim()).filter(Boolean),
                        reporterName: fbReporter.trim() || null,
                      })
                    }
                  >
                    {createFeedbackMut.isPending ? "Enviando..." : "Enviar reporte"}
                  </Button>
                </div>
              </div>
            )}

            {/* Lista */}
            {feedbackItems.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-400">Aún no has reportado nada.</p>
                <p className="text-xs text-gray-300 mt-1">Cualquier bug, idea o cambio que se te ocurra — registralo aquí y le damos seguimiento.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {feedbackItems.map((fb) => {
                  const TYPE_META: Record<string, { label: string; emoji: string; color: string }> = {
                    bug: { label: "Bug", emoji: "🐛", color: "bg-rose-100 text-rose-700" },
                    request: { label: "Cambio", emoji: "✨", color: "bg-blue-100 text-blue-700" },
                    improvement: { label: "Mejora", emoji: "💡", color: "bg-amber-100 text-amber-700" },
                    question: { label: "Pregunta", emoji: "❓", color: "bg-slate-100 text-slate-700" },
                  };
                  const STATUS_META: Record<string, { label: string; color: string }> = {
                    open: { label: "Abierto", color: "bg-gray-100 text-gray-700" },
                    triaged: { label: "Revisado", color: "bg-blue-100 text-blue-700" },
                    in_progress: { label: "En progreso", color: "bg-amber-100 text-amber-700" },
                    resolved: { label: "Resuelto", color: "bg-emerald-100 text-emerald-700" },
                    wont_fix: { label: "No procede", color: "bg-slate-100 text-slate-600" },
                  };
                  const PRIORITY_META: Record<string, string> = {
                    low: "text-gray-400", normal: "text-gray-500", high: "text-amber-600", urgent: "text-rose-600",
                  };
                  const tm = TYPE_META[fb.type] || TYPE_META.request;
                  const sm = STATUS_META[fb.status] || STATUS_META.open;
                  return (
                    <details key={fb.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden group">
                      <summary className="px-4 py-3 cursor-pointer flex items-start gap-3 hover:bg-gray-50">
                        <span className="text-lg shrink-0 mt-0.5">{tm.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-900 truncate">{fb.title}</p>
                            <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${sm.color}`}>{sm.label}</span>
                            <span className={`text-[10px] uppercase tracking-wider font-semibold ${PRIORITY_META[fb.priority]}`}>{fb.priority}</span>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {new Date(fb.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                            {fb.reporterName && ` · ${fb.reporterName}`}
                            {fb.attachmentUrls.length > 0 && ` · ${fb.attachmentUrls.length} adjunto${fb.attachmentUrls.length > 1 ? "s" : ""}`}
                          </p>
                        </div>
                        <ChevronDown className="w-4 h-4 text-gray-300 group-open:rotate-180 transition-transform shrink-0 mt-1" />
                      </summary>
                      <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{fb.description}</p>
                        {fb.attachmentUrls.length > 0 && (
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-1.5">Adjuntos</p>
                            <div className="flex flex-wrap gap-2">
                              {fb.attachmentUrls.map((url, i) => (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700 hover:bg-[#2FA4A9]/[0.05] hover:border-[#2FA4A9]/30 hover:text-[#2FA4A9]"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Adjunto {i + 1}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {fb.adminResponse && (
                          <div className="bg-[#2FA4A9]/5 border-l-3 border-[#2FA4A9] rounded-r p-3">
                            <p className="text-[11px] uppercase tracking-wider text-[#2FA4A9] font-semibold mb-1">Respuesta del equipo IM3</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.adminResponse}</p>
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── INVERSIÓN ── */}
        {activeSection === "Inversión" && (
          <div className="space-y-6">
            {investment ? (
              <>
                {/* Budget + hours */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="grid grid-cols-2 gap-6">
                    {investment.totalBudget && (
                      <div>
                        <p className="text-xs text-gray-400 font-medium">Presupuesto</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                          ${investment.totalBudget.toLocaleString()} {investment.currency}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Horas invertidas</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{investment.totalHours.toFixed(1)}h</p>
                    </div>
                  </div>
                </div>

                {/* Value narrative */}
                <div className="bg-[#2FA4A9]/5 border border-[#2FA4A9]/20 rounded-xl p-4">
                  <p className="text-sm text-[#2FA4A9] font-medium">
                    El {investment.buildPct}% de tu inversión va directo a construir tu producto.
                    {investment.meetingPct <= 5 && ` Solo el ${investment.meetingPct}% se destina a reuniones.`}
                  </p>
                </div>

                {/* Category breakdown */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Distribución de horas</h3>
                  <div className="space-y-3">
                    {Object.entries(investment.byCategory).sort(([, a], [, b]) => b - a).map(([cat, hrs]) => {
                      const pct = investment.totalHours > 0 ? (hrs / investment.totalHours) * 100 : 0;
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-600">{CATEGORY_LABELS[cat] || cat}</span>
                            <span className="text-sm font-medium text-gray-900">{hrs.toFixed(1)}h</span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#2FA4A9] rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* This week */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Esta semana</h3>
                  <p className="text-3xl font-bold text-gray-900">{investment.thisWeekHours.toFixed(1)}h</p>
                  <p className="text-xs text-gray-400 mt-1">invertidas esta semana</p>
                </div>

                {/* Weekly history */}
                {Object.keys(investment.byWeek).length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Historial semanal</h3>
                    <div className="space-y-2">
                      {Object.entries(investment.byWeek).sort(([a], [b]) => b.localeCompare(a)).slice(0, 8).map(([week, hrs]) => (
                        <div key={week} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                          <span className="text-sm text-gray-500">Semana del {formatDate(week)}</span>
                          <span className="text-sm font-medium text-gray-900">{hrs.toFixed(1)}h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-400">No hay datos de inversión disponibles aún.</p>
              </div>
            )}
          </div>
        )}

        {/* ── MENSAJES ── */}
        {activeSection === "Mensajes" && (
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ height: "calc(100vh - 240px)", minHeight: "400px" }}>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {messages.length === 0 ? (
                <p className="text-center text-gray-400 py-12">No hay mensajes aún. Inicia la conversación.</p>
              ) : (
                messages.map(m => (
                  <div key={m.id} className={`flex ${m.senderType === "client" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                      m.senderType === "client"
                        ? "bg-[#2FA4A9] text-white rounded-br-md"
                        : m.senderName === "Resumen semanal"
                          ? "bg-gradient-to-br from-gray-50 to-blue-50 text-gray-900 rounded-bl-md border border-blue-100"
                          : "bg-gray-100 text-gray-900 rounded-bl-md"
                    }`}>
                      <p className={`text-[10px] font-medium mb-0.5 ${
                        m.senderType === "client" ? "text-white/70" : "text-gray-400"
                      }`}>{m.senderName}</p>
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
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs text-gray-400">Portal de proyecto powered by <a href="https://www.im3systems.com" className="text-[#2FA4A9] hover:underline">IM3 Systems</a></p>
        </div>
      </footer>
    </div>
  );
}
