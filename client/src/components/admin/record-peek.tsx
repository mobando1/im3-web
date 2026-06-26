import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ExternalLink, Mail, Phone, Building2 } from "lucide-react";
import { StatusBadge } from "./status-badge";
import { ActivityTimeline } from "./activity-timeline";

// Vista rápida lateral (Attio-style): historial completo de la relación sin
// salir de la lista. La edición profunda sigue en la página completa.
export interface PeekContact {
  id: string;
  nombre: string;
  apellido?: string | null;
  empresa: string;
  email: string;
  telefono?: string | null;
  status: string;
  leadScore: number;
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
}

function scoreTone(score: number): "red" | "amber" | "neutral" {
  if (score > 60) return "red";
  if (score > 30) return "amber";
  return "neutral";
}

function scoreLabel(score: number): string {
  if (score > 60) return "Caliente";
  if (score > 30) return "Tibio";
  return "Frío";
}

export function RecordPeek({ contact, open, onOpenChange, onOpenFull }: {
  contact: PeekContact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFull: (id: string) => void;
}) {
  const fullName = contact ? [contact.nombre, contact.apellido].filter(Boolean).join(" ") : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {contact && (
          <>
            <SheetHeader className="space-y-3 border-b border-border p-5 text-left">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-sm font-semibold text-primary">
                  {initials(fullName)}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="truncate text-base">{fullName}</SheetTitle>
                  <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 shrink-0" /> {contact.empresa || "—"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={contact.status} />
                <StatusBadge tone={scoreTone(contact.leadScore)} label={`Score ${contact.leadScore} · ${scoreLabel(contact.leadScore)}`} />
              </div>
              <div className="space-y-1.5 pt-1 text-sm">
                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{contact.email}</span>
                </a>
                {contact.telefono && (
                  <a href={`tel:${contact.telefono}`} className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary">
                    <Phone className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{contact.telefono}</span>
                  </a>
                )}
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-5">
              <p className="mono-tag mb-4 text-muted-foreground">Actividad</p>
              <ActivityTimeline contactId={contact.id} enabled={open} />
            </div>

            <div className="border-t border-border p-4">
              <Button className="w-full gap-2" onClick={() => onOpenFull(contact.id)}>
                <ExternalLink className="h-4 w-4" /> Ver perfil completo
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
