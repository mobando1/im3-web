import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  Check,
  Circle,
  X,
  Copy,
  Factory,
  Pencil,
  MessageSquarePlus,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
  Send,
  RefreshCw,
  Sparkles,
  FileText,
  Activity,
  CheckSquare,
  Square,
  Plus,
  Target,
  ArrowRight,
  AlertTriangle,
  Brain,
  Shield,
  TrendingUp,
  Tag,
  DollarSign,
  Briefcase,
  MessageCircle,
  Inbox,
  Paperclip,
  Filter,
  FolderKanban,
  FileSignature,
  MessageSquare,
  Video,
  Mic,
  FolderOpen,
  ClipboardCheck,
  Link2,
  File,
} from "lucide-react";
import { useState } from "react";

type EmailItem = {
  id: string;
  subject: string | null;
  body: string | null;
  status: string;
  scheduledFor: string;
  sentAt: string | null;
  templateName: string;
};

type UnifiedEmailItem = {
  id: string;
  source: "resend" | "gmail";
  direction: "inbound" | "outbound";
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  snippet: string | null;
  status: string | null;
  date: string;
  templateName: string | null;
  gmailThreadId: string | null;
  hasAttachments: boolean;
  fromEmail: string | null;
};

type WhatsAppMsg = {
  id: string;
  contactId: string;
  phone: string;
  message: string;
  templateName: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  status: string;
  scheduledFor: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type ProposalItem = {
  id: string;
  contactId: string;
  title: string;
  status: string;
  sections: Record<string, string>;
  pricing: { total?: number; currency?: string; includes?: string[] } | null;
  timelineData: { phases?: Array<{ name: string; weeks: number; deliverables: string[] }>; totalWeeks?: number } | null;
  accessToken: string;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
};

type AppointmentItem = {
  id: string;
  contactId: string | null;
  title: string;
  date: string;
  time: string;
  duration: number;
  notes: string | null;
  meetLink: string | null;
  status: string;
  completedAt: string | null;
  appointmentType: string;
  createdAt: string;
};

type SessionItem = {
  id: string;
  projectId: string;
  contactId: string | null;
  title: string;
  date: string;
  duration: number | null;
  recordingUrl: string | null;
  transcription: string | null;
  summary: string | null;
  actionItems: string[];
  status: string;
  createdAt: string;
};

type ContactFileItem = {
  id: string;
  contactId: string;
  name: string;
  type: string;
  url: string;
  size: number | null;
  content: string | null;
  driveFileId: string | null;
  uploadedBy: string | null;
  createdAt: string;
};

type AuditItem = {
  id: number;
  report_type: string;
  company: string;
  status: string;
  step: number | null;
  total_steps: number | null;
  step_message: string | null;
  pdf_path: string | null;
  source: string;
  created_at: string;
};

type AssociatedEmail = {
  id: string;
  contactId: string;
  email: string;
  nombre: string | null;
  role: string | null;
  createdAt: string;
};

type ContactNote = {
  id: string;
  contactId: string;
  content: string;
  authorId: string | null;
  createdAt: string;
};

type ActivityEntry = {
  id: string;
  contactId: string;
  type: string;
  description: string;
  metadata: Record<string, any> | null;
  createdAt: string;
};

type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  contactId: string | null;
  contactName: string | null;
  completedAt: string | null;
  createdAt: string;
};

type DealItem = {
  id: string;
  contactId: string;
  title: string;
  value: number | null;
  stage: string;
  lostReason: string | null;
  expectedCloseDate: string | null;
  closedAt: string | null;
  notes: string | null;
  createdAt: string;
};

type AiInsight = {
  id: string;
  contactId: string;
  insight: {
    summary: string;
    nextActions: string[];
    talkingPoints: string[];
    riskLevel: string;
    riskReason: string;
    estimatedValue: string;
  };
  generatedAt: string;
};

type ContactDetail = {
  contact: {
    id: string;
    nombre: string;
    empresa: string;
    email: string;
    telefono: string | null;
    status: string;
    substatus: string | null;
    tags: string[] | null;
    optedOut: boolean;
    leadScore: number;
    createdAt: string;
    diagnosticId: string;
  };
  diagnostic: {
    industria: string;
    fechaCita: string;
    horaCita: string;
    empleados: string;
    objetivos: string[];
    herramientas: string;
    nivelTech: string;
    usaIA: string;
    usaIAParaQue: string | null;
    areaPrioridad: string[];
    presupuesto: string;
    googleDriveUrl: string | null;
    meetLink: string | null;
    meetingStatus: string | null;
    meetingCompletedAt: string | null;
    comodidadTech: string;
    empresa: string;
    anosOperacion: string;
    ciudades: string;
    participante: string;
    email: string;
    telefono: string | null;
    resultadoEsperado: string;
    productos: string;
    volumenMensual: string;
    clientePrincipal: string;
    clientePrincipalOtro: string | null;
    canalesAdquisicion: string[];
    canalAdquisicionOtro: string | null;
    canalPrincipal: string;
    conectadas: string;
    conectadasDetalle: string | null;
    familiaridad: {
      automatizacion: string;
      crm: string;
      ia: string;
      integracion: string;
      desarrollo: string;
    } | null;
  } | null;
  emails: EmailItem[];
};

const statusColors: Record<string, string> = {
  lead: "bg-blue-50 text-blue-700 border-blue-200",
  contacted: "bg-amber-50 text-amber-700 border-amber-200",
  scheduled: "bg-orange-50 text-orange-700 border-orange-200",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const emailStatusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600 border-gray-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  opened: "bg-emerald-50 text-emerald-700 border-emerald-200",
  clicked: "bg-teal-50 text-teal-700 border-teal-200",
  bounced: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  expired: "bg-amber-50 text-amber-700 border-amber-200",
};

const meetingStatusColors: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  no_show: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

const meetingStatusLabels: Record<string, string> = {
  scheduled: "Agendada",
  completed: "Completada",
  no_show: "No se presentó",
  cancelled: "Cancelada",
};

const statusLabels: Record<string, string> = {
  lead: "Lead",
  contacted: "Contactado",
  scheduled: "Agendado",
  converted: "Convertido",
};

const substatusLabels: Record<string, string> = {
  warm: "Caliente",
  cold: "Frio",
  interested: "Interesado",
  no_response: "Sin respuesta",
  proposal_sent: "Propuesta enviada",
  delivering: "En entrega",
  completed: "Completado",
};

const templateLabels: Record<string, string> = {
  confirmacion: "Confirmacion",
  caso_exito: "Caso de Exito",
  insight_educativo: "Insight Educativo",
  prep_agenda: "Prep Agenda",
  micro_recordatorio: "Recordatorio",
  seguimiento_post: "Seguimiento Post",
  abandono: "Rescate",
};

const activityIcons: Record<string, any> = {
  form_submitted: FileText,
  status_changed: ArrowRight,
  email_sent: Mail,
  email_opened: Eye,
  email_clicked: ExternalLink,
  email_bounced: X,
  note_added: MessageSquarePlus,
  note_deleted: Trash2,
  contact_edited: Pencil,
  task_created: Plus,
  task_completed: CheckSquare,
  score_changed: Target,
  opted_out: X,
  ai_insight_generated: Sparkles,
  gmail_received: Inbox,
  gmail_sent: Send,
};

const activityColors: Record<string, string> = {
  form_submitted: "bg-blue-50 text-blue-600",
  status_changed: "bg-amber-50 text-amber-600",
  email_sent: "bg-teal-50 text-teal-600",
  email_opened: "bg-emerald-50 text-emerald-600",
  email_clicked: "bg-green-50 text-green-600",
  email_bounced: "bg-red-50 text-red-600",
  note_added: "bg-purple-50 text-purple-600",
  note_deleted: "bg-gray-50 text-gray-500",
  contact_edited: "bg-orange-50 text-orange-600",
  task_created: "bg-blue-50 text-blue-600",
  task_completed: "bg-emerald-50 text-emerald-600",
  score_changed: "bg-amber-50 text-amber-600",
  opted_out: "bg-red-50 text-red-600",
  ai_insight_generated: "bg-purple-50 text-purple-600",
  gmail_received: "bg-blue-50 text-blue-600",
  gmail_sent: "bg-teal-50 text-teal-600",
};

const priorityColors: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-gray-50 text-gray-600 border-gray-200",
};

const priorityLabels: Record<string, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

const dealStageLabels: Record<string, string> = {
  qualification: "Calificacion",
  proposal: "Propuesta",
  negotiation: "Negociacion",
  closed_won: "Ganado",
  closed_lost: "Perdido",
};

const dealStageColors: Record<string, string> = {
  qualification: "bg-blue-50 text-blue-700 border-blue-200",
  proposal: "bg-amber-50 text-amber-700 border-amber-200",
  negotiation: "bg-orange-50 text-orange-700 border-orange-200",
  closed_won: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed_lost: "bg-red-50 text-red-700 border-red-200",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function relativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "hace 1 dia";
  if (diffDays < 30) return `hace ${diffDays} dias`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "hace 1 mes";
  return `hace ${diffMonths} meses`;
}

function familiarityLevel(value: string): { width: string; color: string } {
  const v = value?.toLowerCase() || "";
  if (v === "alto" || v === "avanzado") return { width: "100%", color: "bg-emerald-500" };
  if (v === "medio" || v === "intermedio") return { width: "66%", color: "bg-amber-500" };
  return { width: "33%", color: "bg-gray-400" };
}

export default function ContactDetailPage() {
  const [, params] = useRoute("/admin/contacts/:id");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [whatsAppMsg, setWhatsAppMsg] = useState("");
  const [editData, setEditData] = useState({ nombre: "", empresa: "", email: "", telefono: "" });
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editEmailSubject, setEditEmailSubject] = useState("");
  const [editEmailBody, setEditEmailBody] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [showDealForm, setShowDealForm] = useState(false);
  const [newDealTitle, setNewDealTitle] = useState("");
  const [newDealValue, setNewDealValue] = useState("");
  const [newDealStage, setNewDealStage] = useState("qualification");
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [emailFilter, setEmailFilter] = useState<"all" | "inbound" | "outbound">("all");
  const [expandedTimelineEmail, setExpandedTimelineEmail] = useState<string | null>(null);
  const [newAssocEmail, setNewAssocEmail] = useState("");
  const [newAssocNombre, setNewAssocNombre] = useState("");
  const [newAssocRole, setNewAssocRole] = useState("");
  const [showAssocForm, setShowAssocForm] = useState(false);

  const contactId = params?.id;

  const { data, isLoading } = useQuery<ContactDetail>({
    queryKey: [`/api/admin/contacts/${contactId}`],
    enabled: !!contactId,
  });

  const { data: notes = [], isLoading: notesLoading } = useQuery<ContactNote[]>({
    queryKey: [`/api/admin/contacts/${contactId}/notes`],
    enabled: !!contactId,
  });

  const { data: activities = [] } = useQuery<ActivityEntry[]>({
    queryKey: [`/api/admin/contacts/${contactId}/activity`],
    enabled: !!contactId,
  });

  const { data: aiInsight, isLoading: insightLoading } = useQuery<AiInsight>({
    queryKey: [`/api/admin/contacts/${contactId}/ai-insight`],
    enabled: !!contactId,
  });

  const { data: contactTasks = [] } = useQuery<TaskItem[]>({
    queryKey: [`/api/admin/tasks?contactId=${contactId}`],
    enabled: !!contactId,
  });

  const { data: contactDeals = [] } = useQuery<DealItem[]>({
    queryKey: [`/api/admin/deals?contactId=${contactId}`],
    enabled: !!contactId,
  });

  const { data: contactProjects = [] } = useQuery<Array<{ id: string; name: string; status: string; progress: number; healthStatus: string }>>({
    queryKey: [`/api/admin/contacts/${contactId}/projects`],
    enabled: !!contactId,
  });

  const { data: contactProposals = [] } = useQuery<ProposalItem[]>({
    queryKey: [`/api/admin/contacts/${contactId}/proposals`],
    enabled: !!contactId,
  });

  const { data: contactSessions = [] } = useQuery<SessionItem[]>({
    queryKey: [`/api/admin/contacts/${contactId}/sessions`],
    enabled: !!contactId,
  });

  const { data: emailTimeline = [], isLoading: timelineLoading } = useQuery<UnifiedEmailItem[]>({
    queryKey: [`/api/admin/contacts/${contactId}/email-timeline`],
    enabled: !!contactId,
  });

  const { data: gmailSyncStatus } = useQuery<{ lastSyncAt: string | null }>({
    queryKey: ["/api/admin/gmail-sync-status"],
    enabled: !!contactId,
  });

  const gmailSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/gmail-sync");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/email-timeline`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gmail-sync-status"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/activity`] });
    },
  });

  const { data: associatedEmails = [] } = useQuery<AssociatedEmail[]>({
    queryKey: [`/api/admin/contacts/${contactId}/associated-emails`],
    enabled: !!contactId,
  });

  const addAssocEmailMutation = useMutation({
    mutationFn: async (data: { email: string; nombre: string; role: string }) => {
      await apiRequest("POST", `/api/admin/contacts/${contactId}/associated-emails`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/associated-emails`] });
      setNewAssocEmail("");
      setNewAssocNombre("");
      setNewAssocRole("");
      setShowAssocForm(false);
    },
  });

  const deleteAssocEmailMutation = useMutation({
    mutationFn: async (emailId: string) => {
      await apiRequest("DELETE", `/api/admin/contacts/${contactId}/associated-emails/${emailId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/associated-emails`] });
    },
  });

  // WhatsApp messages
  const { data: waMessages = [] } = useQuery<WhatsAppMsg[]>({
    queryKey: [`/api/admin/contacts/${contactId}/whatsapp-messages`],
    enabled: !!contactId,
  });
  const [waNewMessage, setWaNewMessage] = useState("");

  const [expandedProposal, setExpandedProposal] = useState<string | null>(null);

  // Appointments (unified meetings)
  const { data: contactAppointments = [] } = useQuery<AppointmentItem[]>({
    queryKey: [`/api/admin/contacts/${contactId}/appointments`],
    enabled: !!contactId,
  });
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Contact files/documents
  const { data: contactFilesData = [] } = useQuery<ContactFileItem[]>({
    queryKey: [`/api/admin/contacts/${contactId}/files`],
    enabled: !!contactId,
  });
  const [showFileForm, setShowFileForm] = useState(false);
  const [fileMode, setFileMode] = useState<"upload" | "url">("upload");
  const [newFileName, setNewFileName] = useState("");
  const [newFileUrl, setNewFileUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [subfolder, setSubfolder] = useState("");
  const [newFileType, setNewFileType] = useState("documento");
  const [newFileContent, setNewFileContent] = useState("");

  const addFileMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; url: string; content?: string }) => {
      await apiRequest("POST", `/api/admin/contacts/${contactId}/files`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/files`] });
      setNewFileName(""); setNewFileUrl(""); setNewFileType("documento"); setNewFileContent(""); setShowFileForm(false);
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiRequest("DELETE", `/api/admin/contacts/${contactId}/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/files`] });
    },
  });

  const syncDriveMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await apiRequest("POST", `/api/admin/contacts/${contactId}/files/${fileId}/sync-drive`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/files`] });
    },
  });

  // Auditorías per contact
  const { data: contactAudits = [] } = useQuery<AuditItem[]>({
    queryKey: [`/api/admin/contacts/${contactId}/auditorias`],
    enabled: !!contactId,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ status, substatus }: { status: string; substatus?: string }) => {
      await apiRequest("PATCH", `/api/admin/contacts/${contactId}/status`, { status, substatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/activity`] });
    },
  });

  const whatsAppMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/contacts/${contactId}/whatsapp-message`);
      return res.json();
    },
    onSuccess: (data: { message: string; whatsappUrl: string }) => {
      setWhatsAppMsg(data.message);
      setShowWhatsApp(true);
    },
  });

  const editMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      await apiRequest("PATCH", `/api/admin/contacts/${contactId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/activity`] });
      setEditMode(false);
    },
  });

  const noteMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("POST", `/api/admin/contacts/${contactId}/notes`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/notes`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/activity`] });
      setNoteText("");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      await apiRequest("DELETE", `/api/admin/contacts/${contactId}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/notes`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/activity`] });
    },
  });

  const editEmailMutation = useMutation({
    mutationFn: async ({ emailId, subject, body }: { emailId: string; subject: string; body: string }) => {
      await apiRequest("PATCH", `/api/admin/emails/${emailId}`, { subject, body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}`] });
      setEditingEmailId(null);
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (emailId: string) => {
      await apiRequest("POST", `/api/admin/emails/${emailId}/regenerate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}`] });
    },
  });

  const regenerateInsightMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/admin/contacts/${contactId}/ai-insight/regenerate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/ai-insight`] });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: { title: string; priority: string; contactId: string }) => {
      await apiRequest("POST", "/api/admin/tasks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/tasks?contactId=${contactId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/activity`] });
      setNewTaskTitle("");
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/admin/tasks/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/tasks?contactId=${contactId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/activity`] });
    },
  });

  const createDealMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/deals", {
        contactId,
        title: newDealTitle,
        value: newDealValue ? parseInt(newDealValue) : null,
        stage: newDealStage,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals?contactId=${contactId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/activity`] });
      setNewDealTitle("");
      setNewDealValue("");
      setNewDealStage("qualification");
      setShowDealForm(false);
    },
  });

  const updateDealStageMutation = useMutation({
    mutationFn: async ({ dealId, stage }: { dealId: string; stage: string }) => {
      await apiRequest("PATCH", `/api/admin/deals/${dealId}`, { stage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals?contactId=${contactId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/activity`] });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/contacts/${contactId}`);
    },
    onSuccess: () => {
      navigate("/admin/contacts");
    },
  });

  const deleteDealMutation = useMutation({
    mutationFn: async (dealId: string) => {
      await apiRequest("DELETE", `/api/admin/deals/${dealId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals?contactId=${contactId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/activity`] });
    },
  });

  const meetingStatusMutation = useMutation({
    mutationFn: async ({ diagnosticId, status }: { diagnosticId: string; status: string }) => {
      await apiRequest("PATCH", `/api/admin/diagnostics/${diagnosticId}/meeting-status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/activity`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/calendar"] });
    },
  });

  const { data: followUpData } = useQuery<{
    id: string;
    date: string;
    time: string;
    meetLink: string | null;
    status: string;
  } | null>({
    queryKey: [`/api/admin/contacts/${contactId}/followup`],
    enabled: !!contactId,
  });

  const scheduleFollowUpMutation = useMutation({
    mutationFn: async (formData: { date: string; time: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/admin/contacts/${contactId}/schedule-followup`, formData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/followup`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/activity`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/calendar"] });
      setShowFollowUpForm(false);
      setFollowUpDate("");
      setFollowUpTime("");
      setFollowUpNotes("");
    },
  });

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEdit = () => {
    if (!data) return;
    setEditData({
      nombre: data.contact.nombre,
      empresa: data.contact.empresa,
      email: data.contact.email,
      telefono: data.contact.telefono || "",
    });
    setEditMode(true);
  };

  const startEditEmail = (email: EmailItem) => {
    setEditingEmailId(email.id);
    setEditEmailSubject(email.subject || "");
    setEditEmailBody(email.body || "");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-100 rounded animate-pulse w-48" />
        <div className="h-40 bg-gray-100 rounded animate-pulse" />
        <div className="h-96 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const { contact, diagnostic, emails } = data;
  const sentCount = emails.filter(
    (e) => e.status === "sent" || e.status === "opened" || e.status === "clicked"
  ).length;
  const totalEmails = emails.length;
  const progressPercent = totalEmails > 0 ? (sentCount / totalEmails) * 100 : 0;

  const riskColors: Record<string, string> = {
    low: "bg-emerald-50 text-emerald-700 border-emerald-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    high: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/contacts")}
            className="text-gray-500 hover:text-gray-900 shrink-0"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Contactos
          </Button>
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#2FA4A9]/20 to-[#2FA4A9]/5 flex items-center justify-center shrink-0">
            <span className="text-lg font-semibold text-[#2FA4A9]">
              {getInitials(contact.nombre)}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-gray-900 truncate">
              {contact.nombre}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-gray-500">{contact.empresa}</p>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                contact.leadScore > 60 ? "bg-red-50 text-red-600" :
                contact.leadScore > 30 ? "bg-amber-50 text-amber-600" :
                "bg-gray-100 text-gray-500"
              }`}>
                Score: {contact.leadScore}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={startEdit}
            className="border-gray-200 text-gray-600 hover:text-gray-900 gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => whatsAppMutation.mutate()}
            disabled={whatsAppMutation.isPending || !contact.telefono}
            className="border-green-200 text-green-600 hover:text-green-700 hover:bg-green-50 gap-1.5"
            title={!contact.telefono ? "Sin telefono registrado" : "Enviar WhatsApp"}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {whatsAppMutation.isPending ? "Generando..." : "WhatsApp"}
          </Button>
          <AlertDialog onOpenChange={(open) => { if (!open) setDeleteConfirmName(""); }}>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-red-200 text-red-500 hover:text-red-700 hover:bg-red-50 gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-white">
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar este contacto?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se borrarán todos los emails, notas, tareas, deals y actividad asociada a <strong>{contact.nombre}</strong>. Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-2">
                <label className="text-sm text-gray-600 mb-1.5 block">
                  Escribe <strong>{contact.nombre}</strong> para confirmar:
                </label>
                <Input
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={contact.nombre}
                  className="border-gray-300"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-gray-200">Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteContactMutation.mutate()}
                  disabled={deleteConfirmName.trim().toLowerCase() !== contact.nombre.trim().toLowerCase() || deleteContactMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteContactMutation.isPending ? "Eliminando..." : "Sí, eliminar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {contact.optedOut && (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              Opted out
            </Badge>
          )}
          <Badge variant="outline" className={statusColors[contact.status] || ""}>
            {statusLabels[contact.status] || contact.status}
          </Badge>
          {contact.substatus && (
            <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
              {substatusLabels[contact.substatus] || contact.substatus}
            </Badge>
          )}
          <Select
            value={contact.status}
            onValueChange={(v) => statusMutation.mutate({ status: v })}
          >
            <SelectTrigger className="w-36 bg-white border-gray-200 text-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200">
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="contacted">Contactado</SelectItem>
              <SelectItem value="scheduled">Agendado</SelectItem>
              <SelectItem value="converted">Convertido</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Edit Contact Modal (inline) */}
      {editMode && (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              Editar Contacto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nombre</label>
                <Input value={editData.nombre} onChange={(e) => setEditData({ ...editData, nombre: e.target.value })} className="bg-white border-gray-200" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Empresa</label>
                <Input value={editData.empresa} onChange={(e) => setEditData({ ...editData, empresa: e.target.value })} className="bg-white border-gray-200" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Email</label>
                <Input value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="bg-white border-gray-200" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Telefono</label>
                <Input value={editData.telefono} onChange={(e) => setEditData({ ...editData, telefono: e.target.value })} className="bg-white border-gray-200" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button size="sm" onClick={() => editMutation.mutate(editData)} disabled={editMutation.isPending} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white">
                {editMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditMode(false)} className="border-gray-200 text-gray-600">
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showWhatsApp && (
        <Card className="bg-white border-green-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs text-green-600 uppercase tracking-wider font-medium flex items-center gap-2">
                <MessageCircle className="w-4 h-4" /> Mensaje WhatsApp
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowWhatsApp(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 rounded-lg p-4 border border-green-100">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{whatsAppMsg}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" asChild className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
                <a href={`https://wa.me/${(contact.telefono || "").replace(/\D/g, "")}?text=${encodeURIComponent(whatsAppMsg)}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="w-4 h-4" /> Abrir WhatsApp
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(whatsAppMsg); }} className="border-gray-200 text-gray-600 gap-1.5">
                <Copy className="w-3.5 h-3.5" /> Copiar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TABS */}
      <Tabs defaultValue="resumen" className="w-full">
        <TabsList className="bg-gray-100 border border-gray-200 overflow-x-auto flex-nowrap w-full justify-start">
          <TabsTrigger value="resumen" className="gap-1.5 data-[state=active]:bg-white">
            <Building2 className="w-3.5 h-3.5" /> Resumen
          </TabsTrigger>
          <TabsTrigger value="diagnostico" className="gap-1.5 data-[state=active]:bg-white">
            <FileText className="w-3.5 h-3.5" /> Diagnostico
          </TabsTrigger>
          <TabsTrigger value="emails" className="gap-1.5 data-[state=active]:bg-white">
            <Mail className="w-3.5 h-3.5" /> Emails ({emailTimeline.length || totalEmails})
          </TabsTrigger>
          <TabsTrigger value="actividad" className="gap-1.5 data-[state=active]:bg-white">
            <Activity className="w-3.5 h-3.5" /> Actividad
          </TabsTrigger>
          <TabsTrigger value="tareas" className="gap-1.5 data-[state=active]:bg-white">
            <CheckSquare className="w-3.5 h-3.5" /> Tareas ({contactTasks.filter(t => t.status === "pending").length})
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1.5 data-[state=active]:bg-white">
            <MessageSquare className="w-3.5 h-3.5" /> WhatsApp {waMessages.length > 0 ? `(${waMessages.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="propuestas" className="gap-1.5 data-[state=active]:bg-white">
            <FileSignature className="w-3.5 h-3.5" /> Propuestas {contactProposals.length > 0 ? `(${contactProposals.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="sesiones" className="gap-1.5 data-[state=active]:bg-white">
            <Video className="w-3.5 h-3.5" /> Sesiones
          </TabsTrigger>
          <TabsTrigger value="documentos" className="gap-1.5 data-[state=active]:bg-white">
            <FolderOpen className="w-3.5 h-3.5" /> Docs {contactFilesData.length > 0 ? `(${contactFilesData.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="auditorias" className="gap-1.5 data-[state=active]:bg-white">
            <ClipboardCheck className="w-3.5 h-3.5" /> Auditorias {contactAudits.length > 0 ? `(${contactAudits.length})` : ""}
          </TabsTrigger>
        </TabsList>

        {/* ===== TAB: RESUMEN ===== */}
        <TabsContent value="resumen" className="space-y-6 mt-4">
          {/* AI Insight Card */}
          <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200/50 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs text-purple-600 uppercase tracking-wider font-medium flex items-center gap-2">
                  <Brain className="w-4 h-4" /> Analisis AI
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => regenerateInsightMutation.mutate()}
                  disabled={regenerateInsightMutation.isPending}
                  className="text-purple-600 hover:text-purple-800 gap-1.5 text-xs"
                >
                  {regenerateInsightMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {regenerateInsightMutation.isPending ? "Analizando..." : "Regenerar"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {insightLoading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-4 bg-purple-100 rounded w-3/4" />
                  <div className="h-4 bg-purple-100 rounded w-1/2" />
                </div>
              ) : aiInsight?.insight ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-700">{aiInsight.insight.summary}</p>

                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className={`${riskColors[aiInsight.insight.riskLevel] || riskColors.medium} gap-1`}>
                      <Shield className="w-3 h-3" />
                      Riesgo: {aiInsight.insight.riskLevel === "low" ? "Bajo" : aiInsight.insight.riskLevel === "high" ? "Alto" : "Medio"}
                    </Badge>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      {aiInsight.insight.estimatedValue}
                    </span>
                  </div>

                  {aiInsight.insight.riskReason && (
                    <p className="text-xs text-gray-500 italic">{aiInsight.insight.riskReason}</p>
                  )}

                  {aiInsight.insight.nextActions.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1.5">Proximos pasos:</p>
                      <ul className="space-y-1">
                        {aiInsight.insight.nextActions.map((action, i) => (
                          <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="text-purple-500 mt-1 shrink-0">•</span>
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiInsight.insight.talkingPoints.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1.5">Talking points para la llamada:</p>
                      <ul className="space-y-1">
                        {aiInsight.insight.talkingPoints.map((point, i) => (
                          <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                            <span className="text-blue-500 mt-1 shrink-0">→</span>
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-400">Sin analisis AI aun</p>
                  <button
                    onClick={() => regenerateInsightMutation.mutate()}
                    className="mt-2 text-xs text-purple-600 hover:underline flex items-center gap-1 mx-auto"
                  >
                    <Sparkles className="w-3 h-3" /> Generar analisis
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2-column grid: Contact Info + Diagnostic Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Contact Info */}
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">Contacto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400">Email</p>
                    <div className="flex items-center gap-2">
                      <a href={`mailto:${contact.email}`} className="text-sm text-[#2FA4A9] hover:underline truncate">{contact.email}</a>
                      <button onClick={() => handleCopyEmail(contact.email)} className="text-gray-400 hover:text-gray-700 transition-colors" title="Copiar email">
                        {copied ? <Check className="w-3.5 h-3.5 text-[#2FA4A9]" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                  <div><p className="text-xs text-gray-400">Telefono</p><p className="text-sm text-gray-900">{contact.telefono || "\u2014"}</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                  <div><p className="text-xs text-gray-400">Empresa</p><p className="text-sm text-gray-900">{contact.empresa}</p></div>
                </div>
                {diagnostic && (
                  <div className="flex items-center gap-3">
                    <Factory className="w-4 h-4 text-gray-400 shrink-0" />
                    <div><p className="text-xs text-gray-400">Industria</p><p className="text-sm text-gray-900">{diagnostic.industria}</p></div>
                  </div>
                )}
                {diagnostic?.fechaCita && (
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                    <div><p className="text-xs text-gray-400">Cita</p><p className="text-sm text-gray-900">{diagnostic.fechaCita} — {diagnostic.horaCita}</p></div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                  <div><p className="text-xs text-gray-400">Creado</p><p className="text-sm text-gray-900">{relativeDate(contact.createdAt)}</p></div>
                </div>
                {diagnostic && (diagnostic.googleDriveUrl || diagnostic.meetLink) && (
                  <>
                    <div className="border-t border-gray-100" />
                    <div className="flex items-center gap-2 flex-wrap">
                      {diagnostic.googleDriveUrl && (
                        <Button variant="outline" size="sm" asChild className="border-gray-200 text-gray-600 hover:text-gray-900">
                          <a href={diagnostic.googleDriveUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5 mr-1.5" />Google Drive</a>
                        </Button>
                      )}
                      {diagnostic.meetLink && (
                        <Button variant="outline" size="sm" asChild className="border-gray-200 text-gray-600 hover:text-gray-900">
                          <a href={diagnostic.meetLink} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5 mr-1.5" />Google Meet</a>
                        </Button>
                      )}
                    </div>
                  </>
                )}
                {/* Meeting Status */}
                {diagnostic?.meetLink && (
                  <>
                    <div className="border-t border-gray-100" />
                    <div>
                      <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><Calendar className="w-3 h-3" /> Estado de Reunión</p>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className={`text-xs ${meetingStatusColors[diagnostic.meetingStatus || "scheduled"] || meetingStatusColors.scheduled}`}>
                          {meetingStatusLabels[diagnostic.meetingStatus || "scheduled"] || "Agendada"}
                        </Badge>
                        {diagnostic.meetingCompletedAt && (
                          <span className="text-[10px] text-gray-400">
                            {new Date(diagnostic.meetingCompletedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                      {(diagnostic.meetingStatus || "scheduled") === "scheduled" && (
                        <div className="flex gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            disabled={meetingStatusMutation.isPending}
                            onClick={() => meetingStatusMutation.mutate({ diagnosticId: contact.diagnosticId, status: "completed" })}
                          >
                            <Check className="w-3 h-3 mr-1" /> Completada
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 border-red-200 text-red-600 hover:bg-red-50"
                            disabled={meetingStatusMutation.isPending}
                            onClick={() => meetingStatusMutation.mutate({ diagnosticId: contact.diagnosticId, status: "no_show" })}
                          >
                            <X className="w-3 h-3 mr-1" /> No se presentó
                          </Button>
                        </div>
                      )}
                      {(diagnostic.meetingStatus === "completed" || diagnostic.meetingStatus === "no_show") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 text-gray-400 hover:text-gray-600"
                          disabled={meetingStatusMutation.isPending}
                          onClick={() => meetingStatusMutation.mutate({ diagnosticId: contact.diagnosticId, status: "scheduled" })}
                        >
                          Revertir a agendada
                        </Button>
                      )}
                    </div>
                  </>
                )}
                {/* Follow-up Scheduling */}
                <>
                  <div className="border-t border-gray-100" />
                  <div>
                    <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><Calendar className="w-3 h-3" /> Seguimiento</p>
                    {followUpData ? (
                      <div className="space-y-2">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-sm font-medium text-blue-900">{followUpData.date} — {followUpData.time}</p>
                          {followUpData.meetLink && (
                            <a href={followUpData.meetLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
                              <ExternalLink className="w-3 h-3" /> Google Meet
                            </a>
                          )}
                          <Badge variant="outline" className="text-[10px] mt-1.5 bg-blue-100 text-blue-700 border-blue-300">Agendado</Badge>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 w-full border-gray-200"
                          onClick={() => setShowFollowUpForm(true)}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" /> Cambiar fecha
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 w-full border-blue-200 text-blue-700 hover:bg-blue-50"
                        onClick={() => setShowFollowUpForm(true)}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Agendar seguimiento
                      </Button>
                    )}
                    {showFollowUpForm && (
                      <div className="mt-3 space-y-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-700">{followUpData ? "Reagendar seguimiento" : "Nueva sesión de seguimiento"}</p>
                        {followUpData && (
                          <p className="text-[10px] text-amber-600">Se cancelará el seguimiento actual y se creará uno nuevo</p>
                        )}
                        <Input
                          type="date"
                          value={followUpDate}
                          onChange={(e) => setFollowUpDate(e.target.value)}
                          min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                          className="h-8 text-sm"
                        />
                        <Select value={followUpTime} onValueChange={setFollowUpTime}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Hora" /></SelectTrigger>
                          <SelectContent>
                            {["9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"].map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Notas (opcional)"
                          value={followUpNotes}
                          onChange={(e) => setFollowUpNotes(e.target.value)}
                          className="h-8 text-sm"
                        />
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            className="text-xs h-7 flex-1 bg-blue-600 hover:bg-blue-700"
                            disabled={!followUpDate || !followUpTime || scheduleFollowUpMutation.isPending}
                            onClick={() => scheduleFollowUpMutation.mutate({
                              date: followUpDate,
                              time: followUpTime,
                              notes: followUpNotes || undefined,
                            })}
                          >
                            {scheduleFollowUpMutation.isPending ? "Agendando..." : "Confirmar"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => setShowFollowUpForm(false)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
                {/* Tags */}
                {contact.tags && contact.tags.length > 0 && (
                  <>
                    <div className="border-t border-gray-100" />
                    <div>
                      <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1"><Tag className="w-3 h-3" /> Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {contact.tags.map((tag, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Diagnostic Summary */}
            {diagnostic && (
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">Diagnostico Resumen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <InfoRow label="Empleados" value={diagnostic.empleados} />
                    <InfoRow label="Nivel tech" value={diagnostic.nivelTech} />
                    <InfoRow label="Usa IA" value={diagnostic.usaIA} />
                    <InfoRow label="Comodidad tech" value={diagnostic.comodidadTech} />
                    <InfoRow label="Presupuesto" value={diagnostic.presupuesto} />
                  </div>
                  <div className="border-t border-gray-100 pt-4 space-y-4">
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Objetivos</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(diagnostic.objetivos || []).map((o, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-[#2FA4A9]/10 text-[#2FA4A9] border-[#2FA4A9]/25">{o}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Areas prioritarias</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(diagnostic.areaPrioridad || []).map((a, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">{a}</Badge>
                        ))}
                      </div>
                    </div>
                    {diagnostic.herramientas && (
                      <div><p className="text-xs text-gray-400 mb-1">Herramientas</p><p className="text-sm text-gray-900">{diagnostic.herramientas}</p></div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Cross-links: Proyecto, Propuesta, Sesiones */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Proyecto */}
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FolderKanban className="w-4 h-4 text-[#2FA4A9]" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Proyecto</span>
                </div>
                {contactProjects.length > 0 ? (
                  contactProjects.map(p => (
                    <div key={p.id} className="space-y-1.5">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <div className="flex items-center gap-2">
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#2FA4A9] rounded-full" style={{ width: `${p.progress}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-500 shrink-0">{p.progress}%</span>
                      </div>
                      <Button variant="ghost" size="sm" className="text-[#2FA4A9] hover:text-[#238b8f] p-0 h-auto text-xs" onClick={() => navigate(`/admin/projects/${p.id}`)}>
                        Ver proyecto <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <>
                    <p className="text-xs text-gray-400 mb-2">Sin proyecto asignado</p>
                    <Button variant="ghost" size="sm" className="text-[#2FA4A9] hover:text-[#238b8f] p-0 h-auto text-xs" onClick={() => navigate("/admin/projects")}>
                      <Plus className="w-3 h-3 mr-1" /> Crear proyecto
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Propuesta */}
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileSignature className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Propuesta</span>
                </div>
                {contactProposals.length > 0 ? (
                  contactProposals.map(p => {
                    const statusColors: Record<string, string> = { draft: "bg-gray-100 text-gray-600", sent: "bg-blue-100 text-blue-700", viewed: "bg-amber-100 text-amber-700", accepted: "bg-emerald-100 text-emerald-700" };
                    return (
                      <div key={p.id} className="space-y-1.5">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[p.status] || "bg-gray-100 text-gray-600"}`}>{p.status}</span>
                        <Button variant="ghost" size="sm" className="text-purple-600 hover:text-purple-700 p-0 h-auto text-xs block" onClick={() => navigate(`/admin/proposals/${p.id}`)}>
                          Ver propuesta <ArrowRight className="w-3 h-3 ml-1 inline" />
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <>
                    <p className="text-xs text-gray-400 mb-2">Sin propuesta</p>
                    <Button variant="ghost" size="sm" className="text-purple-600 hover:text-purple-700 p-0 h-auto text-xs" onClick={() => navigate("/admin/proposals")}>
                      <Plus className="w-3 h-3 mr-1" /> Crear propuesta
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Sesiones */}
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Mic className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Sesiones ({contactSessions.length})</span>
                </div>
                {contactSessions.length > 0 ? (
                  <div className="space-y-2">
                    {contactSessions.slice(0, 3).map(s => (
                      <div key={s.id} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-amber-400 rounded-full shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-gray-700 truncate">{s.title}</p>
                          <p className="text-[10px] text-gray-400">{new Date(s.date).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}{s.duration ? ` · ${s.duration} min` : ""}</p>
                        </div>
                      </div>
                    ))}
                    {contactSessions.length > 3 && (
                      <p className="text-[10px] text-gray-400">+{contactSessions.length - 3} más</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Sin sesiones</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Deals / Oportunidades */}
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium flex items-center gap-2">
                  <Briefcase className="w-4 h-4" /> Oportunidades ({contactDeals.length})
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowDealForm(!showDealForm)} className="text-[#2FA4A9] hover:text-[#238b8f] gap-1 text-xs">
                  <Plus className="w-3.5 h-3.5" /> Deal
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {showDealForm && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200">
                  <Input placeholder="Titulo del deal..." value={newDealTitle} onChange={(e) => setNewDealTitle(e.target.value)} className="bg-white border-gray-200 text-gray-900" />
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input type="number" placeholder="Valor USD" value={newDealValue} onChange={(e) => setNewDealValue(e.target.value)} className="pl-9 bg-white border-gray-200 text-gray-900" />
                    </div>
                    <Select value={newDealStage} onValueChange={setNewDealStage}>
                      <SelectTrigger className="w-40 bg-white border-gray-200 text-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-gray-200">
                        {Object.entries(dealStageLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowDealForm(false)} className="text-gray-500">Cancelar</Button>
                    <Button size="sm" disabled={!newDealTitle.trim() || createDealMutation.isPending} onClick={() => createDealMutation.mutate()} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white">Crear</Button>
                  </div>
                </div>
              )}
              {contactDeals.length === 0 && !showDealForm ? (
                <p className="text-sm text-gray-400 text-center py-4">Sin oportunidades aun</p>
              ) : (
                <div className="space-y-2">
                  {contactDeals.map((deal) => (
                    <div key={deal.id} className="bg-gray-50 rounded-lg px-4 py-3 group">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {deal.value != null && (
                              <span className="text-sm font-semibold text-emerald-600">${deal.value.toLocaleString()}</span>
                            )}
                            <Select value={deal.stage} onValueChange={(stage) => updateDealStageMutation.mutate({ dealId: deal.id, stage })}>
                              <SelectTrigger className="h-6 w-auto text-xs border-0 bg-transparent p-0 gap-1 focus:ring-0">
                                <Badge variant="outline" className={`${dealStageColors[deal.stage] || ""} text-xs cursor-pointer`}>
                                  {dealStageLabels[deal.stage] || deal.stage}
                                </Badge>
                              </SelectTrigger>
                              <SelectContent className="bg-white border-gray-200">
                                {Object.entries(dealStageLabels).map(([k, v]) => (
                                  <SelectItem key={k} value={k}>{v}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <button onClick={() => deleteDealMutation.mutate(deal.id)} className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0" title="Eliminar deal">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes Section */}
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4" /> Notas ({notes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="Agregar una nota..." value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && noteText.trim()) noteMutation.mutate(noteText); }} className="bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400" />
                <Button size="sm" disabled={!noteText.trim() || noteMutation.isPending} onClick={() => noteText.trim() && noteMutation.mutate(noteText)} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white shrink-0"><Send className="w-4 h-4" /></Button>
              </div>
              {notesLoading ? (
                <div className="space-y-2">{[...Array(2)].map((_, i) => (<div key={i} className="h-16 bg-gray-50 rounded animate-pulse" />))}</div>
              ) : notes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Sin notas aun</p>
              ) : (
                <div className="space-y-2">
                  {notes.map((note) => (
                    <div key={note.id} className="bg-gray-50 rounded-lg px-4 py-3 group">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap flex-1">{note.content}</p>
                        <button onClick={() => deleteNoteMutation.mutate(note.id)} className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" title="Eliminar nota"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{relativeDate(note.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB: DIAGNOSTICO ===== */}
        <TabsContent value="diagnostico" className="space-y-6 mt-4">
          {!diagnostic ? (
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardContent className="py-12 text-center text-gray-400">Sin datos de diagnostico</CardContent>
            </Card>
          ) : (
            <>
              {/* Informacion General */}
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">Informacion General</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <DiagField label="Empresa" value={diagnostic.empresa} />
                    <DiagField label="Industria" value={diagnostic.industria} />
                    <DiagField label="Anos de operacion" value={diagnostic.anosOperacion} />
                    <DiagField label="Empleados" value={diagnostic.empleados} />
                    <DiagField label="Ciudades" value={diagnostic.ciudades} />
                    <DiagField label="Participante" value={diagnostic.participante} />
                    <DiagField label="Email" value={diagnostic.email} />
                    <DiagField label="Telefono" value={diagnostic.telefono || "\u2014"} />
                  </div>
                </CardContent>
              </Card>

              {/* Contexto y Objetivos */}
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">Contexto y Objetivos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Objetivos seleccionados</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(diagnostic.objetivos || []).map((o, i) => (
                        <Badge key={i} variant="outline" className="text-xs bg-[#2FA4A9]/10 text-[#2FA4A9] border-[#2FA4A9]/25">{o}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Resultado esperado</p>
                    <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{diagnostic.resultadoEsperado}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Modelo de Negocio */}
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">Modelo de Negocio</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <p className="text-xs text-gray-400 mb-1">Productos / Servicios</p>
                      <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{diagnostic.productos}</p>
                    </div>
                    <DiagField label="Volumen mensual" value={diagnostic.volumenMensual} />
                    <DiagField label="Cliente principal" value={diagnostic.clientePrincipal + (diagnostic.clientePrincipalOtro ? ` (${diagnostic.clientePrincipalOtro})` : "")} />
                  </div>
                </CardContent>
              </Card>

              {/* Adquisicion */}
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">Adquisicion de Clientes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Canales de adquisicion</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(diagnostic.canalesAdquisicion || []).map((c, i) => (
                        <Badge key={i} variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">{c}</Badge>
                      ))}
                      {diagnostic.canalAdquisicionOtro && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">{diagnostic.canalAdquisicionOtro}</Badge>
                      )}
                    </div>
                  </div>
                  <DiagField label="Canal principal" value={diagnostic.canalPrincipal} />
                </CardContent>
              </Card>

              {/* Herramientas */}
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">Herramientas y Tecnologia</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Herramientas actuales</p>
                    <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{diagnostic.herramientas}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DiagField label="Nivel de conexion" value={diagnostic.conectadas} />
                    {diagnostic.conectadasDetalle && <DiagField label="Detalle conexion" value={diagnostic.conectadasDetalle} />}
                  </div>
                </CardContent>
              </Card>

              {/* Madurez Tecnologica */}
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">Madurez Tecnologica</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <DiagField label="Nivel tech" value={diagnostic.nivelTech} />
                    <DiagField label="Usa IA" value={diagnostic.usaIA} />
                    <DiagField label="Comodidad tech" value={diagnostic.comodidadTech} />
                  </div>
                  {diagnostic.usaIAParaQue && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Para que usa IA</p>
                      <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{diagnostic.usaIAParaQue}</p>
                    </div>
                  )}
                  {diagnostic.familiaridad && (
                    <div>
                      <p className="text-xs text-gray-400 mb-3">Familiaridad por area</p>
                      <div className="space-y-3">
                        {(["automatizacion", "crm", "ia", "integracion", "desarrollo"] as const).map((key) => {
                          const val = diagnostic.familiaridad?.[key] || "Bajo";
                          const level = familiarityLevel(val);
                          return (
                            <div key={key} className="flex items-center gap-3">
                              <span className="text-xs text-gray-500 w-24 capitalize">{key === "ia" ? "IA" : key}</span>
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${level.color} transition-all`} style={{ width: level.width }} />
                              </div>
                              <span className="text-xs text-gray-500 w-16">{val}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Prioridades e Inversion */}
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">Prioridades e Inversion</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Areas prioritarias</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(diagnostic.areaPrioridad || []).map((a, i) => (
                        <Badge key={i} variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">{a}</Badge>
                      ))}
                    </div>
                  </div>
                  <DiagField label="Presupuesto" value={diagnostic.presupuesto} />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ===== TAB: EMAILS ===== */}
        <TabsContent value="emails" className="space-y-6 mt-4">
          {/* Sequence Progress */}
          {totalEmails > 0 && (
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                  Secuencia de Emails ({sentCount}/{totalEmails} enviados)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Progress value={progressPercent} className="h-2 bg-gray-100" />
                <div className="flex items-start overflow-x-auto pb-2">
                  {emails.map((email, index) => {
                    const isSent = email.status === "sent" || email.status === "opened" || email.status === "clicked";
                    const isFailed = email.status === "failed" || email.status === "bounced";
                    const isExpired = email.status === "expired";
                    return (
                      <div key={email.id} className="flex items-start flex-shrink-0">
                        <div className="flex flex-col items-center w-24">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${isSent ? "border-[#2FA4A9] bg-[#2FA4A9]/10" : isFailed ? "border-red-400 bg-red-50" : isExpired ? "border-amber-400 bg-amber-50" : "border-gray-300 bg-gray-50"}`}>
                            {isSent ? <Check className="w-4 h-4 text-[#2FA4A9]" /> : isFailed ? <X className="w-4 h-4 text-red-500" /> : isExpired ? <Clock className="w-3.5 h-3.5 text-amber-500" /> : <Circle className="w-3 h-3 text-gray-400" />}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-2 text-center leading-tight">{templateLabels[email.templateName] || email.templateName}</p>
                        </div>
                        {index < emails.length - 1 && <div className={`h-px w-6 mt-4 ${isSent ? "bg-[#2FA4A9]" : "bg-gray-200"}`} />}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Associated Emails (stakeholders) */}
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                  Emails Asociados ({associatedEmails.length})
                </CardTitle>
                <button
                  onClick={() => setShowAssocForm(!showAssocForm)}
                  className="text-xs text-[#2FA4A9] hover:text-[#238b8f] flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-[11px] text-gray-400">
                Registra emails de personas del equipo del cliente. El sistema detecta automaticamente emails de estos contactos y del mismo dominio.
              </p>

              {/* Primary email */}
              <div className="flex items-center gap-2 p-2 rounded-md bg-gray-50">
                <Mail className="w-3.5 h-3.5 text-[#2FA4A9] shrink-0" />
                <span className="text-sm text-gray-700 flex-1 truncate">{data?.contact?.email}</span>
                <Badge variant="outline" className="text-[10px] bg-teal-50 text-teal-600 border-teal-200">Principal</Badge>
              </div>

              {/* Associated emails */}
              {associatedEmails.map(ae => (
                <div key={ae.id} className="flex items-center gap-2 p-2 rounded-md bg-gray-50 group">
                  <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-700 truncate block">{ae.email}</span>
                    {(ae.nombre || ae.role) && (
                      <span className="text-[11px] text-gray-400">{[ae.nombre, ae.role].filter(Boolean).join(" — ")}</span>
                    )}
                  </div>
                  <button
                    onClick={() => deleteAssocEmailMutation.mutate(ae.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                    title="Eliminar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Add form */}
              {showAssocForm && (
                <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2">
                  <Input
                    placeholder="Email *"
                    type="email"
                    value={newAssocEmail}
                    onChange={e => setNewAssocEmail(e.target.value)}
                    className="bg-white border-gray-200 text-sm h-9"
                  />
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nombre"
                      value={newAssocNombre}
                      onChange={e => setNewAssocNombre(e.target.value)}
                      className="bg-white border-gray-200 text-sm h-9"
                    />
                    <Input
                      placeholder="Rol (CTO, PM...)"
                      value={newAssocRole}
                      onChange={e => setNewAssocRole(e.target.value)}
                      className="bg-white border-gray-200 text-sm h-9"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => addAssocEmailMutation.mutate({ email: newAssocEmail, nombre: newAssocNombre, role: newAssocRole })}
                      disabled={!newAssocEmail || addAssocEmailMutation.isPending}
                      className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white text-xs"
                    >
                      {addAssocEmailMutation.isPending ? "Guardando..." : "Guardar"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowAssocForm(false)} className="border-gray-200 text-gray-600 text-xs">
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unified Email Timeline (Gmail + Resend) */}
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                  Comunicaciones ({emailTimeline.length})
                </CardTitle>
                <div className="flex items-center gap-2">
                  {/* Filter toggles */}
                  <div className="flex rounded-md border border-gray-200 overflow-hidden">
                    {(["all", "inbound", "outbound"] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setEmailFilter(f)}
                        className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${emailFilter === f ? "bg-[#2FA4A9] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                      >
                        {f === "all" ? "Todos" : f === "inbound" ? "Recibidos" : "Enviados"}
                      </button>
                    ))}
                  </div>
                  {/* Sync button */}
                  <button
                    onClick={() => gmailSyncMutation.mutate()}
                    disabled={gmailSyncMutation.isPending}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-[#2FA4A9]/30 text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors font-medium"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${gmailSyncMutation.isPending ? "animate-spin" : ""}`} />
                    {gmailSyncMutation.isPending ? "Sincronizando..." : "Sync Gmail"}
                  </button>
                </div>
              </div>
              {gmailSyncStatus?.lastSyncAt && (
                <p className="text-[10px] text-gray-300 mt-1">Ultima sync: {new Date(gmailSyncStatus.lastSyncAt).toLocaleString("es-CO")}</p>
              )}
            </CardHeader>
            <CardContent>
              {timelineLoading ? (
                <p className="text-gray-400 text-sm text-center py-4">Cargando...</p>
              ) : emailTimeline.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No hay emails registrados</p>
              ) : (
                <div className="space-y-0">
                  {emailTimeline
                    .filter(e => emailFilter === "all" || e.direction === emailFilter)
                    .map((email, index, arr) => {
                    const isGmail = email.source === "gmail";
                    const isInbound = email.direction === "inbound";
                    const isExpanded = expandedTimelineEmail === email.id;
                    const dotColor = isInbound ? "bg-blue-400" : "bg-[#2FA4A9]";

                    return (
                      <div key={email.id} className="flex gap-4 relative">
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`w-3 h-3 rounded-full mt-1.5 z-10 ${dotColor}`} />
                          {index < arr.length - 1 && <div className="w-px flex-1 bg-gray-200" />}
                        </div>
                        <div className="flex-1 min-w-0 pb-5">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isInbound ? (
                              <Inbox className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            ) : (
                              <Send className="w-3.5 h-3.5 text-[#2FA4A9] shrink-0" />
                            )}
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {email.subject || "Sin asunto"}
                            </span>
                            <Badge variant="outline" className={`text-[10px] ${isGmail ? "bg-white text-gray-500 border-gray-200" : "bg-teal-50 text-teal-600 border-teal-200"}`}>
                              {isGmail ? "Gmail" : "Secuencia"}
                            </Badge>
                            {email.hasAttachments && <Paperclip className="w-3 h-3 text-gray-400" />}
                            {email.status && (
                              <Badge variant="outline" className={`text-[10px] ${emailStatusColors[email.status] || ""}`}>{email.status}</Badge>
                            )}
                            <div className="ml-auto">
                              <button onClick={() => setExpandedTimelineEmail(isExpanded ? null : email.id)} className="text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1 text-xs p-1" title="Ver email">
                                <Eye className="w-3.5 h-3.5" />{isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                          {email.fromEmail && isInbound && (
                            <p className="text-[11px] text-gray-400 mt-0.5">De: {email.fromEmail}</p>
                          )}
                          {!isExpanded && email.snippet && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{email.snippet}</p>
                          )}
                          <p className="text-[11px] text-gray-300 mt-1">{new Date(email.date).toLocaleString("es-CO")}</p>
                          {isExpanded && (email.bodyHtml || email.bodyText) && (
                            <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden">
                              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                                <p className="text-xs text-gray-400 font-medium">
                                  {isInbound ? "Email recibido" : "Email enviado"}
                                </p>
                                <Badge variant="outline" className={`text-[10px] ${isInbound ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-teal-50 text-teal-600 border-teal-200"}`}>
                                  {isInbound ? "Entrante" : "Saliente"}
                                </Badge>
                              </div>
                              {email.bodyHtml ? (
                                <iframe srcDoc={email.bodyHtml} sandbox="allow-same-origin" className="w-full border-0 bg-white" style={{ minHeight: "200px" }} onLoad={(e) => { const iframe = e.target as HTMLIFrameElement; if (iframe.contentDocument) { iframe.style.height = (iframe.contentDocument.body.scrollHeight + 20) + "px"; } }} />
                              ) : (
                                <div className="p-4 text-sm text-gray-700 whitespace-pre-wrap">{email.bodyText}</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Legacy Sequence Emails (pending/editable) */}
          {emails.some(e => e.status === "pending") && (
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">Emails Pendientes de Secuencia ({emails.filter(e => e.status === "pending").length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {emails.filter(e => e.status === "pending").map((email, index, arr) => {
                  const isExpanded = expandedEmail === email.id;
                  const isEditing = editingEmailId === email.id;
                  return (
                    <div key={email.id} className="flex gap-4 relative">
                      <div className="flex flex-col items-center shrink-0">
                        <div className="w-3 h-3 rounded-full mt-1.5 z-10 bg-gray-300" />
                        {index < arr.length - 1 && <div className="w-px flex-1 bg-gray-200" />}
                      </div>
                      <div className="flex-1 min-w-0 pb-6">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">{templateLabels[email.templateName] || email.templateName}</span>
                          <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500">pending</Badge>
                          <div className="ml-auto flex items-center gap-1.5">
                            <button onClick={() => setExpandedEmail(isExpanded ? null : email.id)} className="text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1 text-xs" title="Ver email">
                              <Eye className="w-3.5 h-3.5" />{isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                            {email.body && <button onClick={() => startEditEmail(email)} className="text-gray-400 hover:text-[#2FA4A9] transition-colors text-xs" title="Editar"><Pencil className="w-3 h-3" /></button>}
                            <button onClick={() => regenerateMutation.mutate(email.id)} disabled={regenerateMutation.isPending} className="text-gray-400 hover:text-purple-600 transition-colors text-xs flex items-center gap-1" title={email.body ? "Regenerar con IA" : "Generar preview"}>
                              {regenerateMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                        {email.subject && <p className="text-sm text-gray-600 mt-1 truncate">{email.subject}</p>}
                        <p className="text-xs text-gray-400 mt-1">Programado: {new Date(email.scheduledFor).toLocaleString("es-CO")}</p>
                        {isExpanded && email.body && !isEditing && (
                          <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                              <p className="text-xs text-gray-400 font-medium">Vista previa del email</p>
                              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200">Pendiente de envio</Badge>
                            </div>
                            <iframe srcDoc={email.body} sandbox="allow-same-origin" className="w-full border-0 bg-white" style={{ minHeight: "250px" }} onLoad={(e) => { const iframe = e.target as HTMLIFrameElement; if (iframe.contentDocument) { iframe.style.height = (iframe.contentDocument.body.scrollHeight + 20) + "px"; } }} />
                          </div>
                        )}
                        {isExpanded && !email.body && !isEditing && (
                          <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-100 text-center">
                            <p className="text-sm text-gray-400">Contenido aun no generado</p>
                            <button onClick={() => regenerateMutation.mutate(email.id)} disabled={regenerateMutation.isPending} className="mt-2 text-xs text-[#2FA4A9] hover:underline flex items-center gap-1 mx-auto">
                              <Sparkles className="w-3 h-3" />{regenerateMutation.isPending ? "Generando..." : "Generar preview ahora"}
                            </button>
                            </div>
                          )}
                          {isEditing && (
                            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                              <div><label className="text-xs text-gray-500 mb-1 block">Asunto</label><Input value={editEmailSubject} onChange={(e) => setEditEmailSubject(e.target.value)} className="bg-white border-gray-200 text-sm" /></div>
                              <div><label className="text-xs text-gray-500 mb-1 block">Contenido</label><textarea value={editEmailBody} onChange={(e) => setEditEmailBody(e.target.value)} rows={8} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2FA4A9]/20 focus:border-[#2FA4A9]" /></div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => editEmailMutation.mutate({ emailId: email.id, subject: editEmailSubject, body: editEmailBody })} disabled={editEmailMutation.isPending} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white">{editEmailMutation.isPending ? "Guardando..." : "Guardar"}</Button>
                                <Button variant="outline" size="sm" onClick={() => setEditingEmailId(null)} className="border-gray-200 text-gray-600">Cancelar</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
            </CardContent>
          </Card>
          )}
        </TabsContent>

        {/* ===== TAB: ACTIVIDAD ===== */}
        <TabsContent value="actividad" className="space-y-6 mt-4">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                Timeline de Actividad ({activities.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Sin actividad registrada aun</p>
              ) : (
                <div className="space-y-0">
                  {activities.map((activity, index) => {
                    const Icon = activityIcons[activity.type] || Circle;
                    const colorClass = activityColors[activity.type] || "bg-gray-50 text-gray-500";
                    return (
                      <div key={activity.id} className="flex gap-4 relative">
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colorClass}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          {index < activities.length - 1 && <div className="w-px flex-1 bg-gray-100" />}
                        </div>
                        <div className="flex-1 min-w-0 pb-5">
                          <p className="text-sm text-gray-700">{activity.description}</p>
                          <p className="text-xs text-gray-400 mt-1">{relativeDate(activity.createdAt)}</p>
                          {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {activity.metadata.oldStatus && activity.metadata.newStatus && (
                                <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded">
                                  {activity.metadata.oldStatus} → {activity.metadata.newStatus}
                                </span>
                              )}
                              {activity.metadata.oldScore !== undefined && activity.metadata.newScore !== undefined && (
                                <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded">
                                  Score: {activity.metadata.oldScore} → {activity.metadata.newScore}
                                </span>
                              )}
                              {activity.metadata.subject && (
                                <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded truncate max-w-xs">
                                  &quot;{activity.metadata.subject}&quot;
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB: TAREAS ===== */}
        <TabsContent value="tareas" className="space-y-6 mt-4">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                  Tareas ({contactTasks.filter(t => t.status === "pending").length} pendientes)
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add task inline */}
              <div className="flex gap-2">
                <Input
                  placeholder="Nueva tarea para este contacto..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTaskTitle.trim() && contactId) {
                      createTaskMutation.mutate({ title: newTaskTitle.trim(), priority: newTaskPriority, contactId });
                    }
                  }}
                  className="bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400"
                />
                <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                  <SelectTrigger className="w-24 bg-white border-gray-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="low">Baja</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!newTaskTitle.trim() || createTaskMutation.isPending}
                  onClick={() => contactId && newTaskTitle.trim() && createTaskMutation.mutate({ title: newTaskTitle.trim(), priority: newTaskPriority, contactId })}
                  className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {contactTasks.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Sin tareas para este contacto</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {contactTasks.map((task) => {
                    const isCompleted = task.status === "completed";
                    const overdue = task.status === "pending" && task.dueDate && new Date(task.dueDate) < new Date();
                    return (
                      <li key={task.id} className={`flex items-start gap-3 py-3 ${isCompleted ? "opacity-60" : ""}`}>
                        <button
                          onClick={() => toggleTaskMutation.mutate({ id: task.id, status: isCompleted ? "pending" : "completed" })}
                          className="mt-0.5 shrink-0 text-gray-400 hover:text-[#2FA4A9] transition-colors"
                        >
                          {isCompleted ? <CheckSquare className="w-5 h-5 text-[#2FA4A9]" /> : <Square className="w-5 h-5" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${isCompleted ? "line-through text-gray-400" : "text-gray-900"}`}>{task.title}</p>
                          {task.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</p>}
                          {task.dueDate && (
                            <span className={`text-xs flex items-center gap-1 mt-1 ${overdue ? "text-red-500" : "text-gray-400"}`}>
                              {overdue && <AlertTriangle className="w-3 h-3" />}
                              <Calendar className="w-3 h-3" />
                              {new Date(task.dueDate).toLocaleDateString("es-CO")}
                            </span>
                          )}
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${priorityColors[task.priority] || ""}`}>
                          {priorityLabels[task.priority] || task.priority}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* ===== TAB: WHATSAPP ===== */}
        <TabsContent value="whatsapp" className="space-y-4 mt-4">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                Conversacion WhatsApp ({waMessages.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {waMessages.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">No hay mensajes de WhatsApp</p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                  {waMessages.map(msg => {
                    const isSent = msg.status === "sent" || msg.status === "delivered" || msg.status === "read";
                    const isFailed = msg.status === "failed";
                    const isPending = msg.status === "pending";
                    return (
                      <div key={msg.id} className="flex flex-col">
                        <div className="max-w-[85%] self-end">
                          <div className={`rounded-2xl rounded-br-sm px-4 py-2.5 ${isFailed ? "bg-red-50 border border-red-200" : "bg-[#dcf8c6]"}`}>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.message}</p>
                            {msg.mediaUrl && (
                              <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-500">
                                <Paperclip className="w-3 h-3" />
                                <span>{msg.mediaType || "archivo"}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 justify-end mt-1">
                            <span className="text-[10px] text-gray-400">
                              {msg.sentAt ? new Date(msg.sentAt).toLocaleString("es-CO", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : isPending ? "Programado" : ""}
                            </span>
                            {msg.status === "read" && <Check className="w-3 h-3 text-blue-500" />}
                            {msg.status === "delivered" && <Check className="w-3 h-3 text-gray-400" />}
                            {msg.status === "sent" && <Check className="w-3 h-3 text-gray-300" />}
                            {isPending && <Clock className="w-3 h-3 text-gray-300" />}
                            {isFailed && <AlertTriangle className="w-3 h-3 text-red-500" />}
                            {msg.templateName && <Badge variant="outline" className="text-[9px] bg-green-50 text-green-600 border-green-200">{msg.templateName}</Badge>}
                          </div>
                          {isFailed && msg.errorMessage && (
                            <p className="text-[10px] text-red-400 mt-0.5 text-right">{msg.errorMessage}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Send new message */}
              {data?.contact?.telefono && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex gap-2">
                    <textarea
                      value={waNewMessage}
                      onChange={e => setWaNewMessage(e.target.value)}
                      placeholder="Escribe un mensaje..."
                      rows={2}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!waNewMessage.trim()) return;
                        window.open(`https://wa.me/${data.contact.telefono?.replace(/\D/g, "")}?text=${encodeURIComponent(waNewMessage)}`, "_blank");
                        setWaNewMessage("");
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white self-end px-4"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-gray-300 mt-1">Se abre WhatsApp Web con el mensaje prellenado</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB: PROPUESTAS ===== */}
        <TabsContent value="propuestas" className="space-y-4 mt-4">
          {contactProposals.length === 0 ? (
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardContent className="py-12 text-center">
                <FileSignature className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No hay propuestas para este contacto</p>
                <Button size="sm" className="mt-3 bg-[#2FA4A9] hover:bg-[#238b8f] text-white text-xs" onClick={() => navigate(`/admin/proposals`)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Crear Propuesta
                </Button>
              </CardContent>
            </Card>
          ) : (
            contactProposals.map(prop => {
              const isExpanded = expandedProposal === prop.id;
              const statusColors: Record<string, string> = {
                draft: "bg-gray-50 text-gray-600 border-gray-200",
                sent: "bg-blue-50 text-blue-600 border-blue-200",
                viewed: "bg-amber-50 text-amber-600 border-amber-200",
                accepted: "bg-emerald-50 text-emerald-600 border-emerald-200",
                rejected: "bg-red-50 text-red-600 border-red-200",
                expired: "bg-gray-50 text-gray-400 border-gray-200",
              };
              const statusLabels: Record<string, string> = {
                draft: "Borrador", sent: "Enviada", viewed: "Vista", accepted: "Aceptada", rejected: "Rechazada", expired: "Expirada",
              };
              return (
                <Card key={prop.id} className="bg-white border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileSignature className="w-4 h-4 text-[#2FA4A9] shrink-0" />
                        <CardTitle className="text-sm font-medium text-gray-900 truncate">{prop.title}</CardTitle>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColors[prop.status] || ""}`}>
                          {statusLabels[prop.status] || prop.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setExpandedProposal(isExpanded ? null : prop.id)} className="text-gray-400 hover:text-gray-700 transition-colors p-1">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button onClick={() => navigate(`/admin/proposals/${prop.id}`)} className="text-gray-400 hover:text-[#2FA4A9] transition-colors p-1" title="Editar propuesta">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                      <span>Creada: {new Date(prop.createdAt).toLocaleDateString("es-CO")}</span>
                      {prop.sentAt && <span>Enviada: {new Date(prop.sentAt).toLocaleDateString("es-CO")}</span>}
                      {prop.viewedAt && <span>Vista: {new Date(prop.viewedAt).toLocaleDateString("es-CO")}</span>}
                      {prop.acceptedAt && <span>Aceptada: {new Date(prop.acceptedAt).toLocaleDateString("es-CO")}</span>}
                      {prop.pricing?.total && <span className="font-medium text-gray-600">${prop.pricing.total.toLocaleString()} {prop.pricing.currency || "USD"}</span>}
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="space-y-4 border-t border-gray-100 pt-4">
                      {/* Pricing */}
                      {prop.pricing?.total && (
                        <div className="p-3 rounded-lg bg-[#2FA4A9]/5 border border-[#2FA4A9]/20">
                          <p className="text-lg font-bold text-[#2FA4A9]">${prop.pricing.total.toLocaleString()} {prop.pricing.currency || "USD"}</p>
                          {prop.pricing.includes && prop.pricing.includes.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {prop.pricing.includes.map((item, i) => (
                                <li key={i} className="text-xs text-gray-600 flex items-center gap-1.5">
                                  <Check className="w-3 h-3 text-[#2FA4A9] shrink-0" /> {item}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      {/* Timeline */}
                      {prop.timelineData?.phases && prop.timelineData.phases.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-2">Timeline ({prop.timelineData.totalWeeks} semanas)</p>
                          <div className="space-y-2">
                            {prop.timelineData.phases.map((phase, i) => (
                              <div key={i} className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-[#2FA4A9]/10 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-bold text-[#2FA4A9]">{i + 1}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-700">{phase.name}</p>
                                  <p className="text-[10px] text-gray-400">{phase.weeks} semanas</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Sections preview */}
                      {prop.sections?.resumen && (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">Resumen Ejecutivo</p>
                          <div className="text-xs text-gray-600 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: prop.sections.resumen }} />
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ===== TAB: SESIONES / REUNIONES ===== */}
        <TabsContent value="sesiones" className="space-y-4 mt-4">
          {(() => {
            // Merge appointments + project sessions into unified timeline
            type UnifiedMeeting = { id: string; type: "appointment" | "session"; title: string; date: string; duration: number | null; status: string; notes: string | null; meetLink: string | null; recordingUrl: string | null; transcription: string | null; summary: string | null; actionItems: string[]; appointmentType?: string };

            const safeAppointments = Array.isArray(contactAppointments) ? contactAppointments : [];
            const safeSessions = Array.isArray(contactSessions) ? contactSessions : [];
            const meetings: UnifiedMeeting[] = [
              ...safeAppointments.map(a => ({
                id: a.id, type: "appointment" as const, title: a.title,
                date: `${a.date}T${a.time}`, duration: a.duration, status: a.status,
                notes: a.notes, meetLink: a.meetLink, recordingUrl: null,
                transcription: null, summary: null, actionItems: [] as string[],
                appointmentType: a.appointmentType,
              })),
              ...safeSessions.map(s => ({
                id: s.id, type: "session" as const, title: s.title,
                date: s.date, duration: s.duration, status: s.status,
                notes: null, meetLink: null, recordingUrl: s.recordingUrl,
                transcription: s.transcription, summary: s.summary,
                actionItems: s.actionItems || [],
              })),
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            if (meetings.length === 0) {
              return (
                <Card className="bg-white border-gray-200 shadow-sm">
                  <CardContent className="py-12 text-center">
                    <Video className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">No hay reuniones registradas</p>
                  </CardContent>
                </Card>
              );
            }

            return meetings.map(meeting => {
              const isExpanded = expandedSession === meeting.id;
              const meetingStatusColors: Record<string, string> = {
                scheduled: "bg-blue-50 text-blue-600 border-blue-200",
                completed: "bg-emerald-50 text-emerald-600 border-emerald-200",
                no_show: "bg-red-50 text-red-600 border-red-200",
                cancelled: "bg-gray-50 text-gray-400 border-gray-200",
                ready: "bg-emerald-50 text-emerald-600 border-emerald-200",
              };
              const meetingStatusLabels: Record<string, string> = {
                scheduled: "Programada", completed: "Completada", no_show: "No asistio", cancelled: "Cancelada", ready: "Lista", processing: "Procesando",
              };
              return (
                <Card key={meeting.id} className="bg-white border-gray-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {meeting.type === "session" ? <Mic className="w-4 h-4 text-purple-500 shrink-0" /> : <Calendar className="w-4 h-4 text-[#2FA4A9] shrink-0" />}
                        <CardTitle className="text-sm font-medium text-gray-900 truncate">{meeting.title}</CardTitle>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${meetingStatusColors[meeting.status] || "bg-gray-50 text-gray-500"}`}>
                          {meetingStatusLabels[meeting.status] || meeting.status}
                        </Badge>
                        {meeting.appointmentType && (
                          <Badge variant="outline" className="text-[9px] bg-gray-50 text-gray-400">
                            {meeting.appointmentType === "initial" ? "Inicial" : meeting.appointmentType === "follow_up" ? "Seguimiento" : "Manual"}
                          </Badge>
                        )}
                      </div>
                      <button onClick={() => setExpandedSession(isExpanded ? null : meeting.id)} className="text-gray-400 hover:text-gray-700 transition-colors p-1">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                      <span>{new Date(meeting.date).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                      {meeting.duration && <span>{meeting.duration} min</span>}
                      {meeting.meetLink && <a href={meeting.meetLink} target="_blank" rel="noopener noreferrer" className="text-[#2FA4A9] hover:underline flex items-center gap-0.5"><Video className="w-3 h-3" /> Meet</a>}
                      {meeting.recordingUrl && <a href={meeting.recordingUrl} target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline flex items-center gap-0.5"><Video className="w-3 h-3" /> Grabacion</a>}
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="space-y-3 border-t border-gray-100 pt-3">
                      {meeting.notes && (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">Notas</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{meeting.notes}</p>
                        </div>
                      )}
                      {meeting.summary && (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">Resumen</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{meeting.summary}</p>
                        </div>
                      )}
                      {meeting.actionItems.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">Action Items</p>
                          <ul className="space-y-1">
                            {meeting.actionItems.map((item, i) => (
                              <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                                <Check className="w-3 h-3 text-[#2FA4A9] mt-0.5 shrink-0" /> {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {meeting.transcription && (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">Transcripcion</p>
                          <div className="max-h-48 overflow-y-auto rounded-lg bg-gray-50 p-3">
                            <p className="text-xs text-gray-600 whitespace-pre-wrap">{meeting.transcription}</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            });
          })()}
        </TabsContent>
        {/* ===== TAB: DOCUMENTOS ===== */}
        <TabsContent value="documentos" className="space-y-4 mt-4">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                  Documentos ({contactFilesData.length})
                </CardTitle>
                <button onClick={() => setShowFileForm(!showFileForm)} className="text-xs text-[#2FA4A9] hover:text-[#238b8f] flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {showFileForm && (
                <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2">
                  {/* Toggle: Subir vs URL */}
                  <div className="flex gap-1 bg-gray-200 rounded-lg p-0.5">
                    <button onClick={() => setFileMode("upload")} className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${fileMode === "upload" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}>
                      Subir archivo
                    </button>
                    <button onClick={() => setFileMode("url")} className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${fileMode === "url" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}>
                      Pegar URL
                    </button>
                  </div>

                  {fileMode === "upload" ? (
                    <>
                      <input
                        type="file"
                        onChange={e => { const f = e.target.files?.[0]; if (f) { setUploadFile(f); setNewFileName(f.name); } }}
                        className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#2FA4A9]/10 file:text-[#2FA4A9] hover:file:bg-[#2FA4A9]/20 file:cursor-pointer"
                      />
                      {uploadFile && <p className="text-[10px] text-gray-400">{uploadFile.name} — {(uploadFile.size / 1024 / 1024).toFixed(1)} MB</p>}
                      <Select value={newFileType} onValueChange={setNewFileType}>
                        <SelectTrigger className="bg-white border-gray-200 text-sm h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="documento">Documento</SelectItem>
                          <SelectItem value="contrato">Contrato</SelectItem>
                          <SelectItem value="propuesta">Propuesta</SelectItem>
                          <SelectItem value="auditoria">Auditoria</SelectItem>
                          <SelectItem value="imagen">Imagen</SelectItem>
                          <SelectItem value="grabacion">Grabación</SelectItem>
                          <SelectItem value="otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="Subcarpeta en Drive (opcional, ej: Reuniones)" value={subfolder} onChange={e => setSubfolder(e.target.value)} className="bg-white border-gray-200 text-sm h-9" />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={!uploadFile || uploading} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white text-xs" onClick={async () => {
                          if (!uploadFile) return;
                          setUploading(true);
                          try {
                            const formData = new FormData();
                            formData.append("file", uploadFile);
                            formData.append("name", newFileName || uploadFile.name);
                            formData.append("type", newFileType);
                            if (subfolder) formData.append("subfolder", subfolder);
                            const res = await fetch(`/api/admin/contacts/${contactId}/upload`, { method: "POST", body: formData, credentials: "include" });
                            if (!res.ok) throw new Error((await res.json()).message || "Error");
                            queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/files`] });
                            setShowFileForm(false); setUploadFile(null); setNewFileName(""); setSubfolder("");
                          } catch (err: any) { alert(err.message || "Error subiendo archivo"); }
                          setUploading(false);
                        }}>
                          {uploading ? "Subiendo a Drive..." : "Subir a Drive"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setShowFileForm(false); setUploadFile(null); }} className="border-gray-200 text-gray-600 text-xs">Cancelar</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Input placeholder="Nombre del documento *" value={newFileName} onChange={e => setNewFileName(e.target.value)} className="bg-white border-gray-200 text-sm h-9" />
                      <Input placeholder="URL del documento *" value={newFileUrl} onChange={e => setNewFileUrl(e.target.value)} className="bg-white border-gray-200 text-sm h-9" />
                      <Select value={newFileType} onValueChange={setNewFileType}>
                        <SelectTrigger className="bg-white border-gray-200 text-sm h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="documento">Documento</SelectItem>
                          <SelectItem value="contrato">Contrato</SelectItem>
                          <SelectItem value="propuesta">Propuesta</SelectItem>
                          <SelectItem value="auditoria">Auditoria</SelectItem>
                          <SelectItem value="imagen">Imagen</SelectItem>
                          <SelectItem value="otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => addFileMutation.mutate({ name: newFileName, type: newFileType, url: newFileUrl })} disabled={!newFileName || !newFileUrl || addFileMutation.isPending} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white text-xs">
                          {addFileMutation.isPending ? "Guardando..." : "Guardar"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setShowFileForm(false)} className="border-gray-200 text-gray-600 text-xs">Cancelar</Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {contactFilesData.length === 0 && !showFileForm ? (
                <div className="text-center py-8">
                  <FolderOpen className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">No hay documentos</p>
                  <p className="text-[11px] text-gray-300 mt-1">Agrega links a Google Drive, contratos, propuestas u otros archivos</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {contactFilesData.map(file => {
                    const typeIcons: Record<string, string> = { contrato: "text-amber-500", propuesta: "text-blue-500", auditoria: "text-purple-500", documento: "text-gray-500", imagen: "text-green-500", otro: "text-gray-400" };
                    const typeLabels: Record<string, string> = { contrato: "Contrato", propuesta: "Propuesta", auditoria: "Auditoria", documento: "Documento", imagen: "Imagen", otro: "Otro" };
                    const isGoogleDrive = file.url.includes("google.com") || file.url.includes("docs.google");
                    const hasContent = !!file.content;
                    return (
                      <div key={file.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 group hover:bg-gray-100 transition-colors">
                        <File className={`w-4 h-4 shrink-0 ${typeIcons[file.type] || "text-gray-400"}`} />
                        <div className="flex-1 min-w-0">
                          <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-800 hover:text-[#2FA4A9] font-medium truncate block">
                            {file.name}
                          </a>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[9px]">{typeLabels[file.type] || file.type}</Badge>
                            {hasContent && <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-600 border-emerald-200">AI listo</Badge>}
                            {!hasContent && <Badge variant="outline" className="text-[9px] bg-gray-50 text-gray-400">Sin contenido</Badge>}
                            <span className="text-[10px] text-gray-400">{new Date(file.createdAt).toLocaleDateString("es-CO")}</span>
                          </div>
                        </div>
                        {isGoogleDrive && !hasContent && (
                          <button
                            onClick={() => syncDriveMutation.mutate(file.id)}
                            disabled={syncDriveMutation.isPending}
                            className="text-gray-400 hover:text-[#2FA4A9] p-1 flex items-center gap-1 text-[10px]"
                            title="Sincronizar contenido desde Google Drive"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${syncDriveMutation.isPending ? "animate-spin" : ""}`} />
                          </button>
                        )}
                        <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#2FA4A9] p-1" title="Abrir">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button onClick={() => deleteFileMutation.mutate(file.id)} className="text-gray-300 hover:text-red-500 transition-colors sm:opacity-0 sm:group-hover:opacity-100 p-1" title="Eliminar">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB: AUDITORIAS ===== */}
        <TabsContent value="auditorias" className="space-y-4 mt-4">
          {contactAudits.length === 0 ? (
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardContent className="py-12 text-center">
                <ClipboardCheck className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No hay auditorias para {data?.contact?.empresa}</p>
                <Button size="sm" className="mt-3 bg-[#2FA4A9] hover:bg-[#238b8f] text-white text-xs" onClick={() => navigate("/admin/auditorias")}>
                  Ver Modulo de Auditorias
                </Button>
              </CardContent>
            </Card>
          ) : (
            contactAudits.map(audit => {
              const statusColors: Record<string, string> = {
                draft: "bg-gray-100 text-gray-600", queued: "bg-amber-100 text-amber-700",
                processing: "bg-blue-100 text-blue-700", ready: "bg-emerald-100 text-emerald-700",
                error: "bg-red-100 text-red-700",
              };
              const statusLabels: Record<string, string> = {
                draft: "Borrador", queued: "En cola", processing: "Generando...", ready: "Listo", error: "Error",
              };
              const typeLabels: Record<string, string> = { "pre-audit": "Pre-Auditoria", "full": "Auditoria Completa" };

              return (
                <Card key={audit.id} className="bg-white border-gray-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <ClipboardCheck className="w-4 h-4 text-purple-500 shrink-0" />
                        <CardTitle className="text-sm font-medium text-gray-900">{typeLabels[audit.report_type] || audit.report_type}</CardTitle>
                        <Badge className={`text-[10px] ${statusColors[audit.status] || "bg-gray-100 text-gray-600"}`}>
                          {statusLabels[audit.status] || audit.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {audit.status === "ready" && audit.pdf_path && (
                          <a href={`/api/admin/auditorias/${audit.id}/download`} className="text-[#2FA4A9] hover:text-[#238b8f] p-1" title="Descargar PDF">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <button onClick={() => navigate(`/admin/auditorias/${audit.id}`)} className="text-gray-400 hover:text-gray-700 p-1" title="Ver detalle">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                      <span>{new Date(audit.created_at).toLocaleDateString("es-CO")}</span>
                      <span className="capitalize">{audit.source}</span>
                      {audit.status === "processing" && audit.step && audit.total_steps && (
                        <span>Paso {audit.step}/{audit.total_steps}: {audit.step_message}</span>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  );
}

function DiagField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}
