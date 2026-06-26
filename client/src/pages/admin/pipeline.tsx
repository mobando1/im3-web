import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, pointerWithin,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { Clock, User, Building2, Plus, X, Columns3 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { PageHeader, EmptyState, SeedDemoButton } from "@/components/admin";

type Deal = {
  id: string;
  contactId: string;
  title: string;
  value: number | null;
  stage: string;
  notes: string | null;
  expectedCloseDate: string | null;
  closedAt: string | null;
  lostReason: string | null;
  createdAt: string;
};

type Contact = { id: string; nombre: string; empresa: string; email: string };

// Ramp teal para etapas ordenadas; emerald=ganado, slate=perdido. (No arcoíris.)
const STAGES = [
  { key: "qualification", label: "Calificación", accent: "#5bbcbf" },
  { key: "proposal", label: "Propuesta", accent: "#3aabaf" },
  { key: "negotiation", label: "Negociación", accent: "#2FA4A9" },
  { key: "closed_won", label: "Ganado", accent: "#10b981" },
  { key: "closed_lost", label: "Perdido", accent: "#94a3b8" },
];
const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));
const DEALS_KEY = ["/api/admin/deals"];

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

function DealCard({ deal, contact, onDelete, onOpenContact, overlay }: {
  deal: Deal;
  contact?: Contact;
  onDelete?: () => void;
  onOpenContact?: () => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group rounded-[var(--radius-control)] border border-border bg-card p-3 transition-shadow",
        overlay ? "scale-[1.02] cursor-grabbing shadow-[0_12px_28px_-8px_rgba(0,0,0,0.55)]" : "cursor-grab shadow-[var(--rim)] hover:border-primary/30",
        isDragging && !overlay ? "opacity-40" : "",
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{deal.title}</p>
          {deal.value != null && deal.value > 0 && (
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{fmtMoney(deal.value)}</p>
          )}
        </div>
        {onDelete && (
          <button
            onPointerDown={stop}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded p-0.5 text-muted-foreground/50 opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {contact && (
        <div className="mt-2.5 space-y-1">
          <button
            onPointerDown={stop}
            onClick={(e) => { e.stopPropagation(); onOpenContact?.(); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            <User className="h-3 w-3" />
            <span className="truncate">{contact.nombre}</span>
          </button>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
            <Building2 className="h-3 w-3" />
            <span className="truncate">{contact.empresa}</span>
          </div>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
        <span className="flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground/70">
          <Clock className="h-3 w-3" /> {daysSince(deal.createdAt)}d
        </span>
        {deal.lostReason && (
          <span className="max-w-[100px] truncate text-[11px] text-red-500/80">{deal.lostReason}</span>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({ stage, deals, contactMap, onDelete, onOpenContact }: {
  stage: typeof STAGES[number];
  deals: Deal[];
  contactMap: Record<string, Contact>;
  onDelete: (id: string) => void;
  onOpenContact: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  const total = deals.reduce((s, d) => s + (d.value || 0), 0);

  return (
    <div className="flex min-w-[260px] flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface/40">
      <div className="h-0.5 w-full shrink-0" style={{ background: stage.accent }} />
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.accent }} />
          <span className="text-sm font-semibold text-foreground">{stage.label}</span>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{deals.length}</span>
        </div>
        {total > 0 && <p className="ml-4.5 mt-1 text-xs tabular-nums text-muted-foreground/70">{fmtMoney(total)}</p>}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-[220px] flex-1 space-y-2 p-2 transition-colors",
          isOver && "bg-accent-active/50 ring-1 ring-inset ring-primary/40",
        )}
      >
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            contact={contactMap[deal.contactId]}
            onDelete={() => onDelete(deal.id)}
            onOpenContact={() => onOpenContact(deal.contactId)}
          />
        ))}
        {deals.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border text-xs text-muted-foreground/60">
            Arrastra deals aquí
          </div>
        )}
      </div>
    </div>
  );
}

export default function Pipeline() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [newDeal, setNewDeal] = useState({ title: "", value: "", contactId: "", stage: "qualification" });
  const [lostReasonModal, setLostReasonModal] = useState<{ dealId: string; from: string } | null>(null);
  const [lostReason, setLostReason] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const { data: deals = [], isLoading } = useQuery<Deal[]>({ queryKey: DEALS_KEY });
  const { data: contactsData } = useQuery<{ contacts: Contact[]; total: number }>({
    queryKey: ["/api/admin/contacts?limit=200"],
  });
  const contacts = contactsData?.contacts || [];
  const contactMap: Record<string, Contact> = {};
  for (const c of contacts) contactMap[c.id] = c;

  const updateDealMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; stage?: string; lostReason?: string }) => {
      await apiRequest("PATCH", `/api/admin/deals/${id}`, data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEALS_KEY }),
  });

  const createDealMutation = useMutation({
    mutationFn: async (data: { title: string; value: number; contactId: string; stage: string }) => {
      await apiRequest("POST", "/api/admin/deals", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEALS_KEY });
      setShowNewDeal(false);
      setNewDeal({ title: "", value: "", contactId: "", stage: "qualification" });
    },
  });

  const deleteDealMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/deals/${id}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEALS_KEY }),
  });

  // Movimiento optimista: actualiza el cache YA y luego sincroniza el server.
  function moveDeal(id: string, toStage: string, lostReasonText?: string) {
    queryClient.setQueryData<Deal[]>(DEALS_KEY, (old) =>
      (old || []).map((d) => (d.id === id ? { ...d, stage: toStage, lostReason: lostReasonText ?? (toStage === "closed_lost" ? d.lostReason : null) } : d)),
    );
    updateDealMutation.mutate({ id, stage: toStage, ...(lostReasonText ? { lostReason: lostReasonText } : {}) });
  }

  const dealsByStage: Record<string, Deal[]> = {};
  for (const s of STAGES) dealsByStage[s.key] = deals.filter((d) => d.stage === s.key);

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const dealId = String(e.active.id);
    const toStage = e.over ? String(e.over.id) : null;
    if (!toStage) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === toStage) return;

    if (toStage === "closed_lost") {
      setLostReasonModal({ dealId, from: deal.stage });
      return;
    }

    const fromStage = deal.stage;
    moveDeal(dealId, toStage);
    toast({
      title: "Deal movido",
      description: `${deal.title} → ${STAGE_LABEL[toStage]}`,
      action: (
        <ToastAction altText="Deshacer" onClick={() => moveDeal(dealId, fromStage)}>
          Deshacer
        </ToastAction>
      ),
    });
  }

  function submitLostReason() {
    if (!lostReasonModal) return;
    const { dealId, from } = lostReasonModal;
    const deal = deals.find((d) => d.id === dealId);
    moveDeal(dealId, "closed_lost", lostReason || "No especificado");
    toast({
      title: "Deal perdido",
      description: deal?.title,
      action: (
        <ToastAction altText="Deshacer" onClick={() => moveDeal(dealId, from)}>
          Deshacer
        </ToastAction>
      ),
    });
    setLostReasonModal(null);
    setLostReason("");
  }

  const totalPipeline = deals.filter((d) => !["closed_won", "closed_lost"].includes(d.stage)).reduce((s, d) => s + (d.value || 0), 0);
  const totalWon = deals.filter((d) => d.stage === "closed_won").reduce((s, d) => s + (d.value || 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="skeleton-shimmer h-8 w-40 rounded-[var(--radius-control)]" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-96 min-w-[260px] flex-1 rounded-[var(--radius-card)]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pipeline"
        subtitle={
          <>
            {deals.length} deal{deals.length !== 1 ? "s" : ""} · Activo: <span className="font-medium text-emerald-600 dark:text-emerald-400">{fmtMoney(totalPipeline)}</span>
            {totalWon > 0 && <> · Ganado: <span className="font-medium text-emerald-600 dark:text-emerald-400">{fmtMoney(totalWon)}</span></>}
          </>
        }
        actions={<Button onClick={() => setShowNewDeal(true)} className="gap-2"><Plus className="h-4 w-4" /> Nuevo deal</Button>}
      />

      {deals.length === 0 ? (
        <EmptyState
          icon={<Columns3 />}
          title="Sin deals en el pipeline"
          description="Crea tu primer deal para empezar a mover oportunidades por las etapas."
          action={<Button onClick={() => setShowNewDeal(true)} className="gap-2"><Plus className="h-4 w-4" /> Nuevo deal</Button>}
          secondaryAction={<SeedDemoButton label="Cargar datos de ejemplo" variant="outline" />}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {STAGES.map((stage) => (
              <KanbanColumn
                key={stage.key}
                stage={stage}
                deals={dealsByStage[stage.key] || []}
                contactMap={contactMap}
                onDelete={(id) => { if (confirm("¿Eliminar este deal?")) deleteDealMutation.mutate(id); }}
                onOpenContact={(id) => navigate(`/admin/contacts/${id}`)}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDeal ? <DealCard deal={activeDeal} contact={contactMap[activeDeal.contactId]} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Nuevo deal */}
      <Dialog open={showNewDeal} onOpenChange={setShowNewDeal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo deal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="deal-title">Título</Label>
              <Input id="deal-title" value={newDeal.title} onChange={(e) => setNewDeal({ ...newDeal, title: e.target.value })} placeholder="Ej: Chatbot WhatsApp para empresa…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deal-value">Valor (USD)</Label>
              <Input id="deal-value" type="number" value={newDeal.value} onChange={(e) => setNewDeal({ ...newDeal, value: e.target.value })} placeholder="5000" />
            </div>
            <div className="space-y-1.5">
              <Label>Contacto</Label>
              <Select value={newDeal.contactId} onValueChange={(v) => setNewDeal({ ...newDeal, contactId: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar contacto" /></SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre} — {c.empresa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select value={newDeal.stage} onValueChange={(v) => setNewDeal({ ...newDeal, stage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!newDeal.title || !newDeal.contactId || createDealMutation.isPending}
              onClick={() => {
                if (!newDeal.title || !newDeal.contactId) return;
                createDealMutation.mutate({ title: newDeal.title, value: Number(newDeal.value) || 0, contactId: newDeal.contactId, stage: newDeal.stage });
              }}
            >
              {createDealMutation.isPending ? "Creando…" : "Crear deal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Razón de pérdida */}
      <Dialog open={!!lostReasonModal} onOpenChange={(o) => { if (!o) { setLostReasonModal(null); setLostReason(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Razón de pérdida</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">¿Por qué se perdió este deal?</p>
          <Input value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Ej: Precio, competencia, timing…" autoFocus />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setLostReasonModal(null); setLostReason(""); }}>Cancelar</Button>
            <Button variant="destructive" className="flex-1" onClick={submitLostReason}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
