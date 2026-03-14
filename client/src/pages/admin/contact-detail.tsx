import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { useState } from "react";

type EmailItem = {
  id: string;
  subject: string | null;
  status: string;
  scheduledFor: string;
  sentAt: string | null;
  templateName: string;
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
  lead: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  contacted: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  scheduled: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  converted: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
};

const emailStatusColors: Record<string, string> = {
  pending: "bg-slate-500/15 text-slate-400 border-slate-500/25",
  sent: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  opened: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  clicked: "bg-teal-500/15 text-teal-400 border-teal-500/25",
  bounced: "bg-red-500/15 text-red-400 border-red-500/25",
  failed: "bg-red-500/15 text-red-400 border-red-500/25",
  expired: "bg-amber-500/15 text-amber-400 border-amber-500/25",
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

  const { data, isLoading } = useQuery<ContactDetail>({
    queryKey: [`/api/admin/contacts/${params?.id}`],
    enabled: !!params?.id,
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      await apiRequest("PATCH", `/api/admin/contacts/${params?.id}/status`, {
        status: newStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/admin/contacts/${params?.id}`],
      });
    },
  });

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-[#1e293b] rounded animate-pulse w-48" />
        <div className="h-40 bg-[#1e293b] rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-[#1e293b] rounded animate-pulse" />
          <div className="h-64 bg-[#1e293b] rounded animate-pulse" />
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
            className="text-slate-400 hover:text-white shrink-0"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Contactos
          </Button>
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#2FA4A9]/25 to-[#2FA4A9]/5 flex items-center justify-center shrink-0">
            <span className="text-lg font-semibold text-[#2FA4A9]">
              {getInitials(contact.nombre)}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-white truncate">
              {contact.nombre}
            </h2>
            <p className="text-sm text-slate-400">
              {contact.empresa}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {contact.optedOut && (
            <Badge
              variant="outline"
              className="bg-red-500/15 text-red-400 border-red-500/25"
            >
              Opted out
            </Badge>
          )}
          <Badge
            variant="outline"
            className={statusColors[contact.status] || ""}
          >
            {contact.status}
          </Badge>
          <Select
            value={contact.status}
            onValueChange={(v) => statusMutation.mutate(v)}
          >
            <SelectTrigger className="w-36 bg-[#0c1220] border-[#1e293b] text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111827] border-[#1e293b]">
              <SelectItem value="lead" className="text-slate-300">
                Lead
              </SelectItem>
              <SelectItem
                value="contacted"
                className="text-slate-300"
              >
                Contactado
              </SelectItem>
              <SelectItem
                value="scheduled"
                className="text-slate-300"
              >
                Agendado
              </SelectItem>
              <SelectItem
                value="converted"
                className="text-slate-300"
              >
                Convertido
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column - Contact Info */}
        <Card className="bg-[#111827]/80 border border-[#1e293b]">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs text-slate-500 uppercase tracking-wider">
              Contacto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Email */}
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-slate-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500">Email</p>
                <div className="flex items-center gap-2">
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-sm text-[#2FA4A9] hover:underline truncate"
                  >
                    {contact.email}
                  </a>
                  <button
                    onClick={() => handleCopyEmail(contact.email)}
                    className="text-slate-500 hover:text-white transition-colors"
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

            {/* Phone */}
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-slate-500 shrink-0" />
              <div>
                <p className="text-xs text-slate-500">
                  Telefono
                </p>
                <p className="text-sm text-white">
                  {contact.telefono || "\u2014"}
                </p>
              </div>
            </div>

            {/* Empresa */}
            <div className="flex items-center gap-3">
              <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
              <div>
                <p className="text-xs text-slate-500">Empresa</p>
                <p className="text-sm text-white">
                  {contact.empresa}
                </p>
              </div>
            </div>

            {/* Industria */}
            {diagnostic && (
              <div className="flex items-center gap-3">
                <Factory className="w-4 h-4 text-slate-500 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">
                    Industria
                  </p>
                  <p className="text-sm text-white">
                    {diagnostic.industria}
                  </p>
                </div>
              </div>
            )}

            {/* Cita */}
            {diagnostic && diagnostic.fechaCita && (
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Cita</p>
                  <p className="text-sm text-white">
                    {diagnostic.fechaCita} — {diagnostic.horaCita}
                  </p>
                </div>
              </div>
            )}

            {/* Creado */}
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-slate-500 shrink-0" />
              <div>
                <p className="text-xs text-slate-500">Creado</p>
                <p className="text-sm text-white">
                  {relativeDate(contact.createdAt)}
                </p>
              </div>
            </div>

            {/* Separator + Links */}
            {diagnostic &&
              (diagnostic.googleDriveUrl || diagnostic.meetLink) && (
                <>
                  <div className="border-t border-[#1e293b]" />
                  <div className="flex items-center gap-2 flex-wrap">
                    {diagnostic.googleDriveUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="bg-[#0c1220] border-[#1e293b] text-slate-400 hover:text-white hover:border-[#2FA4A9]/30 hover:bg-white/5"
                      >
                        <a
                          href={diagnostic.googleDriveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
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
                        className="bg-[#0c1220] border-[#1e293b] text-slate-400 hover:text-white hover:border-[#2FA4A9]/30 hover:bg-white/5"
                      >
                        <a
                          href={diagnostic.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
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
          <Card className="bg-[#111827]/80 border border-[#1e293b]">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs text-slate-500 uppercase tracking-wider">
                Diagnostico
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <InfoRow label="Empleados" value={diagnostic.empleados} />
                <InfoRow label="Nivel tech" value={diagnostic.nivelTech} />
                <InfoRow label="Usa IA" value={diagnostic.usaIA} />
                <InfoRow
                  label="Comodidad tech"
                  value={diagnostic.comodidadTech}
                />
                <InfoRow label="Presupuesto" value={diagnostic.presupuesto} />
              </div>

              <div className="border-t border-[#1e293b] pt-4 space-y-4">
                {/* Objetivos */}
                <div>
                  <p className="text-xs text-slate-500 mb-2">
                    Objetivos
                  </p>
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

                {/* Areas prioritarias */}
                <div>
                  <p className="text-xs text-slate-500 mb-2">
                    Areas prioritarias
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(diagnostic.areaPrioridad || []).map((a, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/25"
                      >
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Herramientas */}
                {diagnostic.herramientas && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">
                      Herramientas
                    </p>
                    <p className="text-sm text-white">
                      {diagnostic.herramientas}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Email Sequence Progress */}
      {totalEmails > 0 && (
        <Card className="bg-[#111827]/80 border border-[#1e293b]">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs text-slate-500 uppercase tracking-wider">
              Secuencia de Emails ({sentCount}/{totalEmails} enviados)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Progress
              value={progressPercent}
              className="h-2 bg-[#1e293b]"
            />

            {/* Sequence steps */}
            <div className="flex items-start overflow-x-auto pb-2">
              {emails.map((email, index) => {
                const isSent =
                  email.status === "sent" ||
                  email.status === "opened" ||
                  email.status === "clicked";
                const isFailed =
                  email.status === "failed" || email.status === "bounced";
                const isExpired = email.status === "expired";

                return (
                  <div
                    key={email.id}
                    className="flex items-start flex-shrink-0"
                  >
                    <div className="flex flex-col items-center w-24">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                          isSent
                            ? "border-[#2FA4A9] bg-[#2FA4A9]/15"
                            : isFailed
                              ? "border-red-500 bg-red-500/15"
                              : isExpired
                                ? "border-amber-500 bg-amber-500/15"
                                : "border-slate-600 bg-slate-600/15"
                        }`}
                      >
                        {isSent ? (
                          <Check className="w-4 h-4 text-[#2FA4A9]" />
                        ) : isFailed ? (
                          <X className="w-4 h-4 text-red-500" />
                        ) : isExpired ? (
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                        ) : (
                          <Circle className="w-3 h-3 text-slate-500" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 text-center leading-tight">
                        {templateLabels[email.templateName] ||
                          email.templateName}
                      </p>
                    </div>
                    {/* Connector line */}
                    {index < emails.length - 1 && (
                      <div
                        className={`h-px w-6 mt-4 ${
                          isSent
                            ? "bg-[#2FA4A9]"
                            : "bg-[#1e293b]"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Timeline (detailed) */}
      <Card className="bg-[#111827]/80 border border-[#1e293b]">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs text-slate-500 uppercase tracking-wider">
            Timeline de Emails ({emails.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {emails.length === 0 ? (
            <p className="text-slate-400 text-sm">
              No hay emails programados
            </p>
          ) : (
            <div className="space-y-0">
              {emails.map((email, index) => {
                const isSent =
                  email.status === "sent" ||
                  email.status === "opened" ||
                  email.status === "clicked";
                const isFailed =
                  email.status === "failed" || email.status === "bounced";
                const isExpired = email.status === "expired";

                return (
                  <div key={email.id} className="flex gap-4 relative">
                    {/* Timeline column */}
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className={`w-3 h-3 rounded-full mt-1.5 z-10 ${
                          isSent
                            ? "bg-[#2FA4A9]"
                            : email.status === "pending"
                              ? "bg-slate-500"
                              : isExpired
                                ? "bg-amber-500"
                                : isFailed
                                  ? "bg-red-500"
                                  : "bg-slate-500"
                        }`}
                      />
                      {index < emails.length - 1 && (
                        <div className="w-px flex-1 bg-[#1e293b]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-6">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">
                          {templateLabels[email.templateName] ||
                            email.templateName}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${emailStatusColors[email.status] || ""}`}
                        >
                          {email.status}
                        </Badge>
                      </div>
                      {email.subject && (
                        <p className="text-sm text-slate-400 mt-1 truncate">
                          {email.subject}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 mt-1">
                        {email.sentAt
                          ? `Enviado: ${new Date(email.sentAt).toLocaleString("es-CO")}`
                          : `Programado: ${new Date(email.scheduledFor).toLocaleString("es-CO")}`}
                      </p>
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
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}
