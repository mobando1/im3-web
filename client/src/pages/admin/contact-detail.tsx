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
  caso_exito: "Caso de exito",
  insight_educativo: "Insight educativo",
  prep_agenda: "Prep agenda",
  micro_recordatorio: "Recordatorio",
  seguimiento_post: "Seguimiento post",
  abandono: "Rescate",
};

export default function ContactDetailPage() {
  const [, params] = useRoute("/admin/contacts/:id");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ContactDetail>({
    queryKey: [`/api/admin/contacts/${params?.id}`],
    enabled: !!params?.id,
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      await apiRequest("PATCH", `/api/admin/contacts/${params?.id}/status`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/contacts/${params?.id}`] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-[hsl(var(--coal))] rounded animate-pulse w-48" />
        <div className="h-40 bg-[hsl(var(--coal))] rounded animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const { contact, diagnostic, emails } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin/contacts")}
          className="text-[hsl(var(--paper-dark))] hover:text-[hsl(var(--paper))]"
        >
          &larr; Volver
        </Button>
        <h2 className="text-2xl font-bold text-[hsl(var(--paper))]">{contact.nombre}</h2>
        <Badge variant="outline" className={statusColors[contact.status] || ""}>
          {contact.status}
        </Badge>
        {contact.optedOut && (
          <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
            Opted out
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact info */}
        <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
          <CardHeader>
            <CardTitle className="text-sm text-[hsl(var(--paper-dark))] uppercase tracking-wider">
              Contacto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Empresa" value={contact.empresa} />
            <InfoRow label="Email" value={contact.email} />
            <InfoRow label="Telefono" value={contact.telefono || "—"} />
            <InfoRow label="Creado" value={new Date(contact.createdAt).toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })} />
            <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--coal-light))]">
              <span className="text-sm text-[hsl(var(--paper-dark))]">Cambiar status:</span>
              <Select
                value={contact.status}
                onValueChange={(v) => statusMutation.mutate(v)}
              >
                <SelectTrigger className="w-36 bg-[hsl(var(--ink))] border-[hsl(var(--coal-light))] text-[hsl(var(--paper))]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
                  <SelectItem value="lead" className="text-[hsl(var(--paper))]">Lead</SelectItem>
                  <SelectItem value="contacted" className="text-[hsl(var(--paper))]">Contactado</SelectItem>
                  <SelectItem value="scheduled" className="text-[hsl(var(--paper))]">Agendado</SelectItem>
                  <SelectItem value="converted" className="text-[hsl(var(--paper))]">Convertido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Diagnostic info */}
        {diagnostic && (
          <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
            <CardHeader>
              <CardTitle className="text-sm text-[hsl(var(--paper-dark))] uppercase tracking-wider">
                Diagnostico
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Industria" value={diagnostic.industria} />
              <InfoRow label="Cita" value={`${diagnostic.fechaCita} — ${diagnostic.horaCita}`} />
              <InfoRow label="Empleados" value={diagnostic.empleados} />
              <InfoRow label="Nivel tech" value={diagnostic.nivelTech} />
              <InfoRow label="Usa IA" value={diagnostic.usaIA} />
              <InfoRow label="Presupuesto" value={diagnostic.presupuesto} />
              <InfoRow label="Herramientas" value={diagnostic.herramientas} />
              <div>
                <span className="text-xs text-[hsl(var(--paper-dark))]">Objetivos:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(diagnostic.objetivos || []).map((o, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-[hsl(var(--teal))]/10 text-[hsl(var(--teal))] border-[hsl(var(--teal))]/30">
                      {o}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-xs text-[hsl(var(--paper-dark))]">Areas prioritarias:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(diagnostic.areaPrioridad || []).map((a, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">
                      {a}
                    </Badge>
                  ))}
                </div>
              </div>
              {diagnostic.googleDriveUrl && (
                <a
                  href={diagnostic.googleDriveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm text-[hsl(var(--teal))] hover:underline mt-2"
                >
                  Ver en Google Drive &rarr;
                </a>
              )}
              {diagnostic.meetLink && (
                <a
                  href={diagnostic.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm text-[hsl(var(--teal))] hover:underline mt-1 ml-4"
                >
                  Google Meet &rarr;
                </a>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Email timeline */}
      <Card className="bg-[hsl(var(--coal))] border-[hsl(var(--coal-light))]">
        <CardHeader>
          <CardTitle className="text-sm text-[hsl(var(--paper-dark))] uppercase tracking-wider">
            Timeline de Emails ({emails.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {emails.length === 0 ? (
            <p className="text-[hsl(var(--paper-dark))] text-sm">No hay emails programados</p>
          ) : (
            <div className="space-y-3">
              {emails.map((email, index) => (
                <div
                  key={email.id}
                  className="flex items-start gap-4 relative"
                >
                  {/* Timeline line */}
                  {index < emails.length - 1 && (
                    <div className="absolute left-[7px] top-6 w-px h-full bg-[hsl(var(--coal-light))]" />
                  )}
                  {/* Dot */}
                  <div className={`w-4 h-4 rounded-full mt-0.5 shrink-0 ${
                    email.status === "sent" || email.status === "opened" || email.status === "clicked"
                      ? "bg-[hsl(var(--teal))]"
                      : email.status === "pending"
                      ? "bg-gray-500"
                      : email.status === "expired"
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`} />
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[hsl(var(--paper))]">
                        {templateLabels[email.templateName] || email.templateName}
                      </span>
                      <Badge variant="outline" className={`text-xs ${emailStatusColors[email.status] || ""}`}>
                        {email.status}
                      </Badge>
                    </div>
                    {email.subject && (
                      <p className="text-sm text-[hsl(var(--paper-dark))] mt-0.5 truncate">
                        {email.subject}
                      </p>
                    )}
                    <p className="text-xs text-[hsl(var(--paper-dark))]/60 mt-0.5">
                      {email.sentAt
                        ? `Enviado: ${new Date(email.sentAt).toLocaleString("es-CO")}`
                        : `Programado: ${new Date(email.scheduledFor).toLocaleString("es-CO")}`}
                    </p>
                  </div>
                </div>
              ))}
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
