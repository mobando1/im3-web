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
  lead: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  contacted: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  scheduled: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  converted: "bg-green-500/15 text-green-400 border-green-500/30",
};

const emailStatusColors: Record<string, string> = {
  pending: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  sent: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  opened: "bg-green-500/15 text-green-400 border-green-500/30",
  clicked: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  bounced: "bg-red-500/15 text-red-400 border-red-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  expired: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
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
        <div className="h-8 bg-[hsl(var(--coal))] rounded animate-pulse w-48" />
        <div className="h-40 bg-[hsl(var(--coal))] rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-[hsl(var(--coal))] rounded animate-pulse" />
          <div className="h-64 bg-[hsl(var(--coal))] rounded animate-pulse" />
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
            className="text-[hsl(var(--paper-dark))] hover:text-[hsl(var(--paper))] shrink-0"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Contactos
          </Button>
          <div className="w-14 h-14 rounded-full bg-[hsl(var(--teal))]/20 flex items-center justify-center shrink-0">
            <span className="text-lg font-semibold text-[hsl(var(--teal))]">
              {getInitials(contact.nombre)}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-[hsl(var(--paper))] truncate">
              {contact.nombre}
            </h2>
            <p className="text-sm text-[hsl(var(--paper-dark))]">
              {contact.empresa}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {contact.optedOut && (
            <Badge
              variant="outline"
              className="bg-red-500/15 text-red-400 border-red-500/30"
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
            <SelectTrigger className="w-36 bg-[hsl(var(--ink))] border-[hsl(var(--coal-light))] text-[hsl(var(--paper))]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
              <SelectItem value="lead" className="text-[hsl(var(--paper))]">
                Lead
              </SelectItem>
              <SelectItem
                value="contacted"
                className="text-[hsl(var(--paper))]"
              >
                Contactado
              </SelectItem>
              <SelectItem
                value="scheduled"
                className="text-[hsl(var(--paper))]"
              >
                Agendado
              </SelectItem>
              <SelectItem
                value="converted"
                className="text-[hsl(var(--paper))]"
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
        <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs text-[hsl(var(--paper-dark))] uppercase tracking-wider">
              Contacto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Email */}
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-[hsl(var(--paper-dark))] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[hsl(var(--paper-dark))]">Email</p>
                <div className="flex items-center gap-2">
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-sm text-[hsl(var(--teal))] hover:underline truncate"
                  >
                    {contact.email}
                  </a>
                  <button
                    onClick={() => handleCopyEmail(contact.email)}
                    className="text-[hsl(var(--paper-dark))] hover:text-[hsl(var(--paper))] transition-colors"
                    title="Copiar email"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-[hsl(var(--teal))]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Phone */}
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-[hsl(var(--paper-dark))] shrink-0" />
              <div>
                <p className="text-xs text-[hsl(var(--paper-dark))]">
                  Telefono
                </p>
                <p className="text-sm text-[hsl(var(--paper))]">
                  {contact.telefono || "\u2014"}
                </p>
              </div>
            </div>

            {/* Empresa */}
            <div className="flex items-center gap-3">
              <Building2 className="w-4 h-4 text-[hsl(var(--paper-dark))] shrink-0" />
              <div>
                <p className="text-xs text-[hsl(var(--paper-dark))]">Empresa</p>
                <p className="text-sm text-[hsl(var(--paper))]">
                  {contact.empresa}
                </p>
              </div>
            </div>

            {/* Industria */}
            {diagnostic && (
              <div className="flex items-center gap-3">
                <Factory className="w-4 h-4 text-[hsl(var(--paper-dark))] shrink-0" />
                <div>
                  <p className="text-xs text-[hsl(var(--paper-dark))]">
                    Industria
                  </p>
                  <p className="text-sm text-[hsl(var(--paper))]">
                    {diagnostic.industria}
                  </p>
                </div>
              </div>
            )}

            {/* Cita */}
            {diagnostic && diagnostic.fechaCita && (
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-[hsl(var(--paper-dark))] shrink-0" />
                <div>
                  <p className="text-xs text-[hsl(var(--paper-dark))]">Cita</p>
                  <p className="text-sm text-[hsl(var(--paper))]">
                    {diagnostic.fechaCita} — {diagnostic.horaCita}
                  </p>
                </div>
              </div>
            )}

            {/* Creado */}
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-[hsl(var(--paper-dark))] shrink-0" />
              <div>
                <p className="text-xs text-[hsl(var(--paper-dark))]">Creado</p>
                <p className="text-sm text-[hsl(var(--paper))]">
                  {relativeDate(contact.createdAt)}
                </p>
              </div>
            </div>

            {/* Separator + Links */}
            {diagnostic &&
              (diagnostic.googleDriveUrl || diagnostic.meetLink) && (
                <>
                  <div className="border-t border-[hsl(var(--coal-light))]" />
                  <div className="flex items-center gap-2 flex-wrap">
                    {diagnostic.googleDriveUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="border-[hsl(var(--coal-light))] text-[hsl(var(--paper-dark))] hover:text-[hsl(var(--paper))] hover:bg-[hsl(var(--coal-light))]/50"
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
                        className="border-[hsl(var(--coal-light))] text-[hsl(var(--paper-dark))] hover:text-[hsl(var(--paper))] hover:bg-[hsl(var(--coal-light))]/50"
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
          <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs text-[hsl(var(--paper-dark))] uppercase tracking-wider">
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

              <div className="border-t border-[hsl(var(--coal-light))] pt-4 space-y-4">
                {/* Objetivos */}
                <div>
                  <p className="text-xs text-[hsl(var(--paper-dark))] mb-2">
                    Objetivos
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(diagnostic.objetivos || []).map((o, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="text-xs bg-[hsl(var(--teal))]/10 text-[hsl(var(--teal))] border-[hsl(var(--teal))]/30"
                      >
                        {o}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Areas prioritarias */}
                <div>
                  <p className="text-xs text-[hsl(var(--paper-dark))] mb-2">
                    Areas prioritarias
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(diagnostic.areaPrioridad || []).map((a, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30"
                      >
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Herramientas */}
                {diagnostic.herramientas && (
                  <div>
                    <p className="text-xs text-[hsl(var(--paper-dark))] mb-1">
                      Herramientas
                    </p>
                    <p className="text-sm text-[hsl(var(--paper))]">
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
        <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs text-[hsl(var(--paper-dark))] uppercase tracking-wider">
              Secuencia de Emails ({sentCount}/{totalEmails} enviados)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Progress
              value={progressPercent}
              className="h-2 bg-[hsl(var(--ink))]"
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
                            ? "border-[hsl(var(--teal))] bg-[hsl(var(--teal))]/20"
                            : isFailed
                              ? "border-red-500 bg-red-500/20"
                              : isExpired
                                ? "border-yellow-500 bg-yellow-500/20"
                                : "border-gray-500 bg-gray-500/20"
                        }`}
                      >
                        {isSent ? (
                          <Check className="w-4 h-4 text-[hsl(var(--teal))]" />
                        ) : isFailed ? (
                          <X className="w-4 h-4 text-red-500" />
                        ) : isExpired ? (
                          <Clock className="w-3.5 h-3.5 text-yellow-500" />
                        ) : (
                          <Circle className="w-3 h-3 text-gray-500" />
                        )}
                      </div>
                      <p className="text-[10px] text-[hsl(var(--paper-dark))] mt-2 text-center leading-tight">
                        {templateLabels[email.templateName] ||
                          email.templateName}
                      </p>
                    </div>
                    {/* Connector line */}
                    {index < emails.length - 1 && (
                      <div
                        className={`h-px w-6 mt-4 ${
                          isSent
                            ? "bg-[hsl(var(--teal))]"
                            : "bg-[hsl(var(--coal-light))]"
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
      <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs text-[hsl(var(--paper-dark))] uppercase tracking-wider">
            Timeline de Emails ({emails.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {emails.length === 0 ? (
            <p className="text-[hsl(var(--paper-dark))] text-sm">
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
                            ? "bg-[hsl(var(--teal))]"
                            : email.status === "pending"
                              ? "bg-gray-500"
                              : isExpired
                                ? "bg-yellow-500"
                                : isFailed
                                  ? "bg-red-500"
                                  : "bg-gray-500"
                        }`}
                      />
                      {index < emails.length - 1 && (
                        <div className="w-px flex-1 bg-[hsl(var(--coal-light))]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-6">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[hsl(var(--paper))]">
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
                        <p className="text-sm text-[hsl(var(--paper-dark))] mt-1 truncate">
                          {email.subject}
                        </p>
                      )}
                      <p className="text-xs text-[hsl(var(--paper-dark))]/60 mt-1">
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
      <span className="text-xs text-[hsl(var(--paper-dark))]">{label}</span>
      <span className="text-sm text-[hsl(var(--paper))]">{value}</span>
    </div>
  );
}
