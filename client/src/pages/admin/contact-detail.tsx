import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
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

type ContactNote = {
  id: string;
  contactId: string;
  content: string;
  authorId: string | null;
  createdAt: string;
};

type ContactDetail = {
  contact: {
    id: string;
    nombre: string;
    empresa: string;
    email: string;
    telefono: string | null;
    status: string;
    optedOut: boolean;
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
    areaPrioridad: string[];
    presupuesto: string;
    googleDriveUrl: string | null;
    meetLink: string | null;
    comodidadTech: string;
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

const statusLabels: Record<string, string> = {
  lead: "Lead",
  contacted: "Contactado",
  scheduled: "Agendado",
  converted: "Convertido",
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
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "hace 1 dia";
  if (diffDays < 30) return `hace ${diffDays} dias`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "hace 1 mes";
  return `hace ${diffMonths} meses`;
}

export default function ContactDetailPage() {
  const [, params] = useRoute("/admin/contacts/:id");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ nombre: "", empresa: "", email: "", telefono: "" });
  const [noteText, setNoteText] = useState("");
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editEmailSubject, setEditEmailSubject] = useState("");
  const [editEmailBody, setEditEmailBody] = useState("");

  const contactId = params?.id;

  const { data, isLoading } = useQuery<ContactDetail>({
    queryKey: [`/api/admin/contacts/${contactId}`],
    enabled: !!contactId,
  });

  const { data: notes = [], isLoading: notesLoading } = useQuery<ContactNote[]>({
    queryKey: [`/api/admin/contacts/${contactId}/notes`],
    enabled: !!contactId,
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      await apiRequest("PATCH", `/api/admin/contacts/${contactId}/status`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}`] });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data: { nombre: string; empresa: string; email: string; telefono: string }) => {
      await apiRequest("PATCH", `/api/admin/contacts/${contactId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}`] });
      setEditMode(false);
    },
  });

  const noteMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("POST", `/api/admin/contacts/${contactId}/notes`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/notes`] });
      setNoteText("");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      await apiRequest("DELETE", `/api/admin/contacts/${contactId}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${contactId}/notes`] });
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-gray-100 rounded animate-pulse" />
          <div className="h-64 bg-gray-100 rounded animate-pulse" />
        </div>
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
            <p className="text-sm text-gray-500">{contact.empresa}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={startEdit}
            className="border-gray-200 text-gray-600 hover:text-gray-900 gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            Editar
          </Button>
          {contact.optedOut && (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              Opted out
            </Badge>
          )}
          <Badge variant="outline" className={statusColors[contact.status] || ""}>
            {statusLabels[contact.status] || contact.status}
          </Badge>
          <Select
            value={contact.status}
            onValueChange={(v) => statusMutation.mutate(v)}
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
                <Input
                  value={editData.nombre}
                  onChange={(e) => setEditData({ ...editData, nombre: e.target.value })}
                  className="bg-white border-gray-200"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Empresa</label>
                <Input
                  value={editData.empresa}
                  onChange={(e) => setEditData({ ...editData, empresa: e.target.value })}
                  className="bg-white border-gray-200"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Email</label>
                <Input
                  value={editData.email}
                  onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  className="bg-white border-gray-200"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Telefono</label>
                <Input
                  value={editData.telefono}
                  onChange={(e) => setEditData({ ...editData, telefono: e.target.value })}
                  className="bg-white border-gray-200"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                size="sm"
                onClick={() => editMutation.mutate(editData)}
                disabled={editMutation.isPending}
                className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white"
              >
                {editMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditMode(false)}
                className="border-gray-200 text-gray-600"
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column - Contact Info */}
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">
              Contacto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400">Email</p>
                <div className="flex items-center gap-2">
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-sm text-[#2FA4A9] hover:underline truncate"
                  >
                    {contact.email}
                  </a>
                  <button
                    onClick={() => handleCopyEmail(contact.email)}
                    className="text-gray-400 hover:text-gray-700 transition-colors"
                    title="Copiar email"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-[#2FA4A9]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Telefono</p>
                <p className="text-sm text-gray-900">{contact.telefono || "\u2014"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Empresa</p>
                <p className="text-sm text-gray-900">{contact.empresa}</p>
              </div>
            </div>

            {diagnostic && (
              <div className="flex items-center gap-3">
                <Factory className="w-4 h-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Industria</p>
                  <p className="text-sm text-gray-900">{diagnostic.industria}</p>
                </div>
              </div>
            )}

            {diagnostic && diagnostic.fechaCita && (
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Cita</p>
                  <p className="text-sm text-gray-900">
                    {diagnostic.fechaCita} — {diagnostic.horaCita}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Creado</p>
                <p className="text-sm text-gray-900">{relativeDate(contact.createdAt)}</p>
              </div>
            </div>

            {diagnostic && (diagnostic.googleDriveUrl || diagnostic.meetLink) && (
              <>
                <div className="border-t border-gray-100" />
                <div className="flex items-center gap-2 flex-wrap">
                  {diagnostic.googleDriveUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="border-gray-200 text-gray-600 hover:text-gray-900 hover:border-[#2FA4A9]/30 hover:bg-gray-50"
                    >
                      <a href={diagnostic.googleDriveUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Google Drive
                      </a>
                    </Button>
                  )}
                  {diagnostic.meetLink && (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="border-gray-200 text-gray-600 hover:text-gray-900 hover:border-[#2FA4A9]/30 hover:bg-gray-50"
                    >
                      <a href={diagnostic.meetLink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Google Meet
                      </a>
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Right column - Diagnostic */}
        {diagnostic && (
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                Diagnostico
              </CardTitle>
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
                      <Badge
                        key={i}
                        variant="outline"
                        className="text-xs bg-[#2FA4A9]/10 text-[#2FA4A9] border-[#2FA4A9]/25"
                      >
                        {o}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-400 mb-2">Areas prioritarias</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(diagnostic.areaPrioridad || []).map((a, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="text-xs bg-purple-50 text-purple-700 border-purple-200"
                      >
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>

                {diagnostic.herramientas && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Herramientas</p>
                    <p className="text-sm text-gray-900">{diagnostic.herramientas}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Notes Section */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4" />
            Notas ({notes.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add note */}
          <div className="flex gap-2">
            <Input
              placeholder="Agregar una nota..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && noteText.trim()) {
                  noteMutation.mutate(noteText);
                }
              }}
              className="bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400"
            />
            <Button
              size="sm"
              disabled={!noteText.trim() || noteMutation.isPending}
              onClick={() => noteText.trim() && noteMutation.mutate(noteText)}
              className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {/* Notes list */}
          {notesLoading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-50 rounded animate-pulse" />
              ))}
            </div>
          ) : notes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin notas aun</p>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="bg-gray-50 rounded-lg px-4 py-3 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap flex-1">{note.content}</p>
                    <button
                      onClick={() => deleteNoteMutation.mutate(note.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0 mt-0.5"
                      title="Eliminar nota"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {relativeDate(note.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Sequence Progress */}
      {totalEmails > 0 && (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">
              Secuencia de Emails ({sentCount}/{totalEmails} enviados)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Progress value={progressPercent} className="h-2 bg-gray-100" />

            {/* Sequence steps */}
            <div className="flex items-start overflow-x-auto pb-2">
              {emails.map((email, index) => {
                const isSent =
                  email.status === "sent" || email.status === "opened" || email.status === "clicked";
                const isFailed = email.status === "failed" || email.status === "bounced";
                const isExpired = email.status === "expired";

                return (
                  <div key={email.id} className="flex items-start flex-shrink-0">
                    <div className="flex flex-col items-center w-24">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                          isSent
                            ? "border-[#2FA4A9] bg-[#2FA4A9]/10"
                            : isFailed
                              ? "border-red-400 bg-red-50"
                              : isExpired
                                ? "border-amber-400 bg-amber-50"
                                : "border-gray-300 bg-gray-50"
                        }`}
                      >
                        {isSent ? (
                          <Check className="w-4 h-4 text-[#2FA4A9]" />
                        ) : isFailed ? (
                          <X className="w-4 h-4 text-red-500" />
                        ) : isExpired ? (
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                        ) : (
                          <Circle className="w-3 h-3 text-gray-400" />
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-2 text-center leading-tight">
                        {templateLabels[email.templateName] || email.templateName}
                      </p>
                    </div>
                    {index < emails.length - 1 && (
                      <div
                        className={`h-px w-6 mt-4 ${isSent ? "bg-[#2FA4A9]" : "bg-gray-200"}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Timeline (detailed with preview) */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs text-gray-500 uppercase tracking-wider font-medium">
            Conversacion de Emails ({emails.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {emails.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No hay emails programados</p>
          ) : (
            <div className="space-y-0">
              {emails.map((email, index) => {
                const isSent =
                  email.status === "sent" || email.status === "opened" || email.status === "clicked";
                const isFailed = email.status === "failed" || email.status === "bounced";
                const isExpired = email.status === "expired";
                const isPending = email.status === "pending";
                const isExpanded = expandedEmail === email.id;
                const isEditing = editingEmailId === email.id;

                return (
                  <div key={email.id} className="flex gap-4 relative">
                    {/* Timeline column */}
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className={`w-3 h-3 rounded-full mt-1.5 z-10 ${
                          isSent
                            ? "bg-[#2FA4A9]"
                            : isPending
                              ? "bg-gray-300"
                              : isExpired
                                ? "bg-amber-400"
                                : isFailed
                                  ? "bg-red-400"
                                  : "bg-gray-300"
                        }`}
                      />
                      {index < emails.length - 1 && (
                        <div className="w-px flex-1 bg-gray-200" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-6">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {templateLabels[email.templateName] || email.templateName}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${emailStatusColors[email.status] || ""}`}
                        >
                          {email.status}
                        </Badge>
                        {/* Expand/collapse button */}
                        {(email.body || email.subject) && (
                          <button
                            onClick={() => setExpandedEmail(isExpanded ? null : email.id)}
                            className="text-gray-400 hover:text-gray-700 transition-colors ml-auto flex items-center gap-1 text-xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                        {/* Edit button for pending emails */}
                        {isPending && (
                          <button
                            onClick={() => startEditEmail(email)}
                            className="text-gray-400 hover:text-[#2FA4A9] transition-colors text-xs flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {email.subject && (
                        <p className="text-sm text-gray-600 mt-1 truncate">
                          {email.subject}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {email.sentAt
                          ? `Enviado: ${new Date(email.sentAt).toLocaleString("es-CO")}`
                          : `Programado: ${new Date(email.scheduledFor).toLocaleString("es-CO")}`}
                      </p>

                      {/* Email body preview */}
                      {isExpanded && email.body && !isEditing && (
                        <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                          <p className="text-xs text-gray-400 mb-2 font-medium">Contenido:</p>
                          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                            {email.body}
                          </div>
                        </div>
                      )}

                      {/* Edit email form */}
                      {isEditing && (
                        <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Asunto</label>
                            <Input
                              value={editEmailSubject}
                              onChange={(e) => setEditEmailSubject(e.target.value)}
                              className="bg-white border-gray-200 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Contenido</label>
                            <textarea
                              value={editEmailBody}
                              onChange={(e) => setEditEmailBody(e.target.value)}
                              rows={8}
                              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2FA4A9]/20 focus:border-[#2FA4A9]"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                editEmailMutation.mutate({
                                  emailId: email.id,
                                  subject: editEmailSubject,
                                  body: editEmailBody,
                                })
                              }
                              disabled={editEmailMutation.isPending}
                              className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white"
                            >
                              {editEmailMutation.isPending ? "Guardando..." : "Guardar"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingEmailId(null)}
                              className="border-gray-200 text-gray-600"
                            >
                              Cancelar
                            </Button>
                          </div>
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
