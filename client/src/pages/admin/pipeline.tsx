import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import {
  DollarSign, GripVertical, Clock, User, Building2, Plus,
  X, ChevronDown, ArrowUpRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";

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

type Contact = {
  id: string;
  nombre: string;
  empresa: string;
  email: string;
};

const STAGES = [
  { key: "qualification", label: "Calificacion", color: "bg-blue-500", lightBg: "bg-blue-50", textColor: "text-blue-700", borderColor: "border-blue-200" },
  { key: "proposal", label: "Propuesta", color: "bg-amber-500", lightBg: "bg-amber-50", textColor: "text-amber-700", borderColor: "border-amber-200" },
  { key: "negotiation", label: "Negociacion", color: "bg-purple-500", lightBg: "bg-purple-50", textColor: "text-purple-700", borderColor: "border-purple-200" },
  { key: "closed_won", label: "Ganado", color: "bg-emerald-500", lightBg: "bg-emerald-50", textColor: "text-emerald-700", borderColor: "border-emerald-200" },
  { key: "closed_lost", label: "Perdido", color: "bg-red-400", lightBg: "bg-red-50", textColor: "text-red-600", borderColor: "border-red-200" },
];

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export default function Pipeline() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [newDeal, setNewDeal] = useState({ title: "", value: "", contactId: "", stage: "qualification" });
  const [lostReasonModal, setLostReasonModal] = useState<{ dealId: string; stage: string } | null>(null);
  const [lostReason, setLostReason] = useState("");

  const { data: deals = [], isLoading: dealsLoading } = useQuery<Deal[]>({
    queryKey: ["/api/admin/deals"],
  });

  const { data: contactsData } = useQuery<{ contacts: Contact[]; total: number }>({
    queryKey: ["/api/admin/contacts?limit=200"],
  });
  const contacts = contactsData?.contacts || [];

  const updateDealMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; stage?: string; lostReason?: string }) => {
      await apiRequest("PATCH", `/api/admin/deals/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals"] });
    },
  });

  const createDealMutation = useMutation({
    mutationFn: async (data: { title: string; value: number; contactId: string; stage: string }) => {
      await apiRequest("POST", "/api/admin/deals", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals"] });
      setShowNewDeal(false);
      setNewDeal({ title: "", value: "", contactId: "", stage: "qualification" });
    },
  });

  const deleteDealMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/deals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals"] });
    },
  });

  // Group deals by stage
  const dealsByStage: Record<string, Deal[]> = {};
  for (const stage of STAGES) {
    dealsByStage[stage.key] = deals.filter(d => d.stage === stage.key);
  }

  // Contact lookup
  const contactMap: Record<string, Contact> = {};
  for (const c of contacts) {
    contactMap[c.id] = c;
  }

  // Drag handlers
  function handleDragStart(dealId: string) {
    setDraggedDeal(dealId);
  }

  function handleDragOver(e: React.DragEvent, stageKey: string) {
    e.preventDefault();
    setDragOverStage(stageKey);
  }

  function handleDragLeave() {
    setDragOverStage(null);
  }

  function handleDrop(stageKey: string) {
    if (!draggedDeal) return;
    const deal = deals.find(d => d.id === draggedDeal);
    if (!deal || deal.stage === stageKey) {
      setDraggedDeal(null);
      setDragOverStage(null);
      return;
    }

    // If moving to closed_lost, ask for reason
    if (stageKey === "closed_lost") {
      setLostReasonModal({ dealId: draggedDeal, stage: stageKey });
      setDraggedDeal(null);
      setDragOverStage(null);
      return;
    }

    updateDealMutation.mutate({ id: draggedDeal, stage: stageKey });
    setDraggedDeal(null);
    setDragOverStage(null);
  }

  function handleDragEnd() {
    setDraggedDeal(null);
    setDragOverStage(null);
  }

  function submitLostReason() {
    if (!lostReasonModal) return;
    updateDealMutation.mutate({
      id: lostReasonModal.dealId,
      stage: lostReasonModal.stage,
      lostReason: lostReason || "No especificado",
    });
    setLostReasonModal(null);
    setLostReason("");
  }

  // Totals
  const totalPipeline = deals
    .filter(d => !["closed_won", "closed_lost"].includes(d.stage))
    .reduce((s, d) => s + (d.value || 0), 0);
  const totalWon = deals
    .filter(d => d.stage === "closed_won")
    .reduce((s, d) => s + (d.value || 0), 0);

  if (dealsLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 bg-gray-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl h-96 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Pipeline</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            {deals.length} deal{deals.length !== 1 ? "s" : ""} · Pipeline: <span className="text-emerald-600 font-medium">${totalPipeline.toLocaleString()}</span>
            {totalWon > 0 && <> · Ganado: <span className="text-emerald-600 font-medium">${totalWon.toLocaleString()}</span></>}
          </p>
        </div>
        <button
          onClick={() => setShowNewDeal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#2FA4A9] text-white rounded-xl hover:bg-[#238b8f] transition-colors text-sm font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" /> Nuevo Deal
        </button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-5 gap-3 min-h-[60vh]">
        {STAGES.map((stage) => {
          const stageDeals = dealsByStage[stage.key] || [];
          const stageTotal = stageDeals.reduce((s, d) => s + (d.value || 0), 0);
          const isDragOver = dragOverStage === stage.key;

          return (
            <div
              key={stage.key}
              className={`rounded-xl border-2 transition-colors ${
                isDragOver
                  ? `${stage.borderColor} ${stage.lightBg}`
                  : "border-gray-200/80 bg-gray-50/50"
              }`}
              onDragOver={(e) => handleDragOver(e, stage.key)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(stage.key)}
            >
              {/* Column Header */}
              <div className="p-3 border-b border-gray-200/60">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                  <span className="text-sm font-semibold text-gray-700">{stage.label}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 ml-auto">
                    {stageDeals.length}
                  </span>
                </div>
                {stageTotal > 0 && (
                  <p className="text-xs text-gray-400 ml-4.5">${stageTotal.toLocaleString()}</p>
                )}
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 min-h-[200px]">
                {stageDeals.map((deal) => {
                  const contact = contactMap[deal.contactId];
                  const days = daysSince(deal.createdAt);
                  const isDragging = draggedDeal === deal.id;

                  return (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={() => handleDragStart(deal.id)}
                      onDragEnd={handleDragEnd}
                      className={`bg-white rounded-lg border border-gray-200/80 p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group ${
                        isDragging ? "opacity-40 scale-95" : ""
                      }`}
                    >
                      {/* Title + drag handle */}
                      <div className="flex items-start gap-1.5">
                        <GripVertical className="w-3.5 h-3.5 text-gray-300 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
                          {deal.value && (
                            <p className="text-sm font-bold text-emerald-600 mt-0.5">
                              ${deal.value.toLocaleString()}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Eliminar este deal?")) {
                              deleteDealMutation.mutate(deal.id);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 hover:text-red-400 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Contact info */}
                      {contact && (
                        <div className="mt-2.5 space-y-1">
                          <button
                            onClick={() => navigate(`/admin/contacts/${contact.id}`)}
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#2FA4A9] transition-colors"
                          >
                            <User className="w-3 h-3" />
                            <span className="truncate">{contact.nombre}</span>
                          </button>
                          <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <Building2 className="w-3 h-3" />
                            <span className="truncate">{contact.empresa}</span>
                          </div>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-100">
                        <span className="text-[11px] text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {days}d
                        </span>
                        {deal.lostReason && (
                          <span className="text-[11px] text-red-400 truncate max-w-[100px]">
                            {deal.lostReason}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {stageDeals.length === 0 && (
                  <div className="flex items-center justify-center h-24 text-xs text-gray-300">
                    Arrastra deals aqui
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Deal Modal */}
      {showNewDeal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowNewDeal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900">Nuevo Deal</h3>
              <button onClick={() => setShowNewDeal(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titulo</label>
                <input
                  type="text"
                  value={newDeal.title}
                  onChange={e => setNewDeal({ ...newDeal, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#2FA4A9]/20 focus:border-[#2FA4A9] outline-none"
                  placeholder="Ej: Chatbot WhatsApp para empresa..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (USD)</label>
                <input
                  type="number"
                  value={newDeal.value}
                  onChange={e => setNewDeal({ ...newDeal, value: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#2FA4A9]/20 focus:border-[#2FA4A9] outline-none"
                  placeholder="5000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contacto</label>
                <select
                  value={newDeal.contactId}
                  onChange={e => setNewDeal({ ...newDeal, contactId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#2FA4A9]/20 focus:border-[#2FA4A9] outline-none bg-white"
                >
                  <option value="">Seleccionar contacto</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre} — {c.empresa}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Etapa</label>
                <select
                  value={newDeal.stage}
                  onChange={e => setNewDeal({ ...newDeal, stage: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#2FA4A9]/20 focus:border-[#2FA4A9] outline-none bg-white"
                >
                  {STAGES.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => {
                  if (!newDeal.title || !newDeal.contactId) return;
                  createDealMutation.mutate({
                    title: newDeal.title,
                    value: Number(newDeal.value) || 0,
                    contactId: newDeal.contactId,
                    stage: newDeal.stage,
                  });
                }}
                disabled={!newDeal.title || !newDeal.contactId || createDealMutation.isPending}
                className="w-full py-2.5 bg-[#2FA4A9] text-white rounded-xl hover:bg-[#238b8f] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createDealMutation.isPending ? "Creando..." : "Crear Deal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lost Reason Modal */}
      {lostReasonModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Razon de perdida</h3>
            <p className="text-sm text-gray-500 mb-4">Por que se perdio este deal?</p>
            <input
              type="text"
              value={lostReason}
              onChange={e => setLostReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#2FA4A9]/20 focus:border-[#2FA4A9] outline-none mb-4"
              placeholder="Ej: Precio, competencia, timing..."
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setLostReasonModal(null); setLostReason(""); }}
                className="flex-1 py-2 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={submitLostReason}
                className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
