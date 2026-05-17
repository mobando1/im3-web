import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, ExternalLink, Trash2, Layers, AlertTriangle, Calculator } from "lucide-react";
import { SimulatorCalculator } from "@/components/stack/SimulatorCalculator";
import { SimulatorChatPanel } from "@/components/stack/SimulatorChatPanel";

type PricingUnit = {
  unit: string;
  includedQuantity: number;
  overageUnitCostUSD: number;
  note?: string;
};

type StackService = {
  id: string;
  name: string;
  vendor: string | null;
  category: string;
  description: string | null;
  url: string | null;
  billingModel: string;
  baseFeeUSD: string;       // numeric viene como string
  markupPercent: string;
  pricingUnits: PricingUnit[];
  internalNotes: string | null;
  lastPriceUpdate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const CATEGORIES = ["database", "storage", "ai", "messaging", "hosting", "payments", "email", "other"];
const CATEGORY_LABELS: Record<string, string> = {
  database: "Base de datos",
  storage: "Almacenamiento",
  ai: "IA / LLMs",
  messaging: "Mensajería",
  hosting: "Hosting / Compute",
  payments: "Pagos",
  email: "Email",
  other: "Otros",
};
const CATEGORY_COLORS: Record<string, string> = {
  database: "bg-blue-100 text-blue-700",
  storage: "bg-cyan-100 text-cyan-700",
  ai: "bg-purple-100 text-purple-700",
  messaging: "bg-green-100 text-green-700",
  hosting: "bg-slate-100 text-slate-700",
  payments: "bg-emerald-100 text-emerald-700",
  email: "bg-amber-100 text-amber-700",
  other: "bg-gray-100 text-gray-700",
};
const BILLING_MODELS = ["fixed", "tiered", "usage", "passthrough", "passthrough-with-cap", "client-direct"];
const BILLING_LABELS: Record<string, string> = {
  fixed: "Tarifa fija",
  tiered: "Tier + overage",
  usage: "Solo uso",
  passthrough: "Pass-through con markup",
  "passthrough-with-cap": "Pass-through con cap",
  "client-direct": "Cliente paga directo",
};

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

function emptyService(): Partial<StackService> {
  return {
    name: "",
    vendor: "",
    category: "other",
    description: "",
    url: "",
    billingModel: "fixed",
    baseFeeUSD: "0",
    markupPercent: "0",
    pricingUnits: [],
    internalNotes: "",
    isActive: true,
  };
}

export default function StackCatalogPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Partial<StackService> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [tab, setTab] = useState<"catalog" | "simulator">("catalog");

  const { data: services = [], isLoading } = useQuery<StackService[]>({
    queryKey: [`/api/admin/stack-services?includeInactive=${showInactive}`],
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/admin/stack-services?includeInactive=${showInactive}`] });

  const createMut = useMutation({
    mutationFn: async (data: Partial<StackService>) => {
      const res = await apiRequest("POST", "/api/admin/stack-services", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✓ Servicio creado" });
      invalidate();
      setEditing(null);
      setIsNew(false);
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<StackService> }) => {
      const res = await apiRequest("PATCH", `/api/admin/stack-services/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✓ Guardado" });
      invalidate();
      setEditing(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/stack-services/${id}`);
    },
    onSuccess: () => {
      toast({ title: "✓ Servicio archivado" });
      invalidate();
    },
  });

  const filtered = services.filter(s => filter === "all" || s.category === filter);
  const grouped = filtered.reduce<Record<string, StackService[]>>((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});

  const handleSave = () => {
    if (!editing?.name?.trim()) {
      toast({ title: "Falta el nombre", variant: "destructive" });
      return;
    }
    if (isNew) {
      createMut.mutate(editing);
    } else if (editing.id) {
      const { id, ...data } = editing;
      updateMut.mutate({ id: id as string, data });
    }
  };

  const openNew = () => {
    setEditing(emptyService());
    setIsNew(true);
  };

  const openEdit = (s: StackService) => {
    setEditing({ ...s, pricingUnits: s.pricingUnits || [] });
    setIsNew(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-[#2FA4A9]" />
            Stack & Costos Operativos
          </h1>
          <p className="text-sm text-gray-500 mt-1">Catálogo con precios oficiales que Claude usa para llenar propuestas y contratos. Simulador para responder dudas en vivo.</p>
        </div>
        {tab === "catalog" && (
          <Button onClick={openNew} className="bg-[#2FA4A9] hover:bg-[#238b8f] gap-1.5">
            <Plus className="w-4 h-4" /> Agregar servicio
          </Button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
        <button
          onClick={() => setTab("catalog")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === "catalog" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          <Layers className="w-3.5 h-3.5" /> Catálogo
        </button>
        <button
          onClick={() => setTab("simulator")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === "simulator" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          <Calculator className="w-3.5 h-3.5" /> Simulador
        </button>
      </div>

      {tab === "simulator" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 min-h-[600px]">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Calculadora estructurada</h2>
            <p className="text-xs text-gray-500 mb-4">Selecciona servicios + teclea uso → resultado en tiempo real. Para preguntas precisas con números.</p>
            <SimulatorCalculator />
          </div>
          <div className="min-h-[500px]">
            <SimulatorChatPanel />
          </div>
        </div>
      )}

      {tab === "catalog" && <>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          Mostrar archivados
        </label>
        <span className="text-xs text-gray-400">{filtered.length} servicio{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">Cargando catálogo…</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-gray-400 border border-dashed rounded-lg">
          No hay servicios en esta vista. <button onClick={openNew} className="text-[#2FA4A9] hover:underline">Agrega el primero</button>.
        </div>
      ) : (
        <div className="space-y-8">
          {CATEGORIES.filter(c => grouped[c]?.length).map(category => (
            <section key={category}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[category]}`}>{CATEGORY_LABELS[category]}</span>
                <span className="text-xs text-gray-400">{grouped[category].length}</span>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Servicio</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Modelo</th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Base/mes</th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Markup</th>
                      <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Unidades</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Actualizado</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {grouped[category].map(s => {
                      const lastUpdate = s.lastPriceUpdate ? new Date(s.lastPriceUpdate) : null;
                      const isStale = lastUpdate && Date.now() - lastUpdate.getTime() > SIX_MONTHS_MS;
                      return (
                        <tr key={s.id} className={`hover:bg-gray-50 ${!s.isActive ? "opacity-40" : ""}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-sm text-gray-900">{s.name}</div>
                            {s.vendor && <div className="text-[11px] text-gray-400">{s.vendor}</div>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">{BILLING_LABELS[s.billingModel] || s.billingModel}</td>
                          <td className="px-4 py-3 text-right text-sm font-mono">${parseFloat(s.baseFeeUSD || "0").toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500">{parseFloat(s.markupPercent || "0") > 0 ? `+${s.markupPercent}%` : "—"}</td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">{(s.pricingUnits || []).length || "—"}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {lastUpdate ? (
                              <div className="flex items-center gap-1.5">
                                {isStale && <span title="Revisar tarifa (>6 meses)"><AlertTriangle className="w-3 h-3 text-amber-500" /></span>}
                                {lastUpdate.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "2-digit" })}
                              </div>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              {s.url && (
                                <a href={s.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-[#2FA4A9]" title="Ver pricing del vendor">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-[#2FA4A9]" title="Editar">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {s.isActive && (
                                <button
                                  onClick={() => { if (confirm(`¿Archivar "${s.name}"? No aparecerá en la calculadora.`)) deleteMut.mutate(s.id); }}
                                  className="p-1.5 text-gray-300 hover:text-red-600"
                                  title="Archivar"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
      </>}

      {/* Editor dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) { setEditing(null); setIsNew(false); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Agregar servicio al catálogo" : `Editar: ${editing?.name}`}</DialogTitle>
            <DialogDescription>
              {isNew ? "Define un servicio del stack con tarifas fijas + variables." : "Cambios en precio actualizan automáticamente la marca 'última actualización'."}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Nombre *</Label>
                  <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Supabase, Anthropic Claude, etc." />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Vendor</Label>
                  <Input value={editing.vendor || ""} onChange={(e) => setEditing({ ...editing, vendor: e.target.value })} placeholder="Supabase Inc." />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Categoría *</Label>
                  <Select value={editing.category || "other"} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Modelo de cobro *</Label>
                  <Select value={editing.billingModel || "fixed"} onValueChange={(v) => setEditing({ ...editing, billingModel: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BILLING_MODELS.map(m => <SelectItem key={m} value={m}>{BILLING_LABELS[m]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Descripción</Label>
                <Textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} placeholder="Qué hace este servicio y por qué lo usamos." />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Base fee mensual (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editing.baseFeeUSD || "0"}
                    onChange={(e) => setEditing({ ...editing, baseFeeUSD: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Markup %</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={editing.markupPercent || "0"}
                    onChange={(e) => setEditing({ ...editing, markupPercent: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">URL pricing</Label>
                  <Input value={editing.url || ""} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://…/pricing" />
                </div>
              </div>

              {/* Repeater de pricing units */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-semibold">Unidades de uso variable (overage)</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing({
                      ...editing,
                      pricingUnits: [...(editing.pricingUnits || []), { unit: "", includedQuantity: 0, overageUnitCostUSD: 0, note: "" }],
                    })}
                    className="text-xs h-7 gap-1"
                  >
                    <Plus className="w-3 h-3" /> Añadir unidad
                  </Button>
                </div>
                {(editing.pricingUnits || []).length === 0 && (
                  <p className="text-[11px] text-gray-400 italic">Sin tarifas variables (solo base fee). Agrega una unidad si el servicio cobra por uso.</p>
                )}
                <div className="space-y-2">
                  {(editing.pricingUnits || []).map((pu, idx) => (
                    <div key={idx} className="grid grid-cols-[1.5fr_1fr_1fr_2fr_auto] gap-2 items-start border border-gray-200 rounded-lg p-2.5 bg-gray-50/40">
                      <div>
                        <div className="text-[10px] text-gray-500 mb-1">Unidad</div>
                        <Input
                          value={pu.unit}
                          onChange={(e) => {
                            const next = [...(editing.pricingUnits || [])];
                            next[idx] = { ...pu, unit: e.target.value };
                            setEditing({ ...editing, pricingUnits: next });
                          }}
                          placeholder="GB storage"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 mb-1">Incluidas</div>
                        <Input
                          type="number"
                          step="0.01"
                          value={pu.includedQuantity}
                          onChange={(e) => {
                            const next = [...(editing.pricingUnits || [])];
                            next[idx] = { ...pu, includedQuantity: parseFloat(e.target.value) || 0 };
                            setEditing({ ...editing, pricingUnits: next });
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 mb-1">$/extra USD</div>
                        <Input
                          type="number"
                          step="0.0001"
                          value={pu.overageUnitCostUSD}
                          onChange={(e) => {
                            const next = [...(editing.pricingUnits || [])];
                            next[idx] = { ...pu, overageUnitCostUSD: parseFloat(e.target.value) || 0 };
                            setEditing({ ...editing, pricingUnits: next });
                          }}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 mb-1">Nota (opcional)</div>
                        <Input
                          value={pu.note || ""}
                          onChange={(e) => {
                            const next = [...(editing.pricingUnits || [])];
                            next[idx] = { ...pu, note: e.target.value };
                            setEditing({ ...editing, pricingUnits: next });
                          }}
                          className="h-8 text-xs"
                          placeholder="Pro tier"
                        />
                      </div>
                      <button
                        onClick={() => {
                          const next = (editing.pricingUnits || []).filter((_, i) => i !== idx);
                          setEditing({ ...editing, pricingUnits: next });
                        }}
                        className="self-end p-1.5 text-gray-300 hover:text-red-500"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Notas internas (no se muestran al cliente)</Label>
                <Textarea value={editing.internalNotes || ""} onChange={(e) => setEditing({ ...editing, internalNotes: e.target.value })} rows={2} placeholder="Recordatorios, gotchas, decisiones de licencia, etc." />
              </div>

              {!isNew && (
                <div className="flex items-center justify-between border-t pt-3">
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <Switch checked={editing.isActive ?? true} onCheckedChange={(v) => setEditing({ ...editing, isActive: v })} />
                    Activo (aparece en calculadora)
                  </label>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); setIsNew(false); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-[#2FA4A9] hover:bg-[#238b8f]">
              {createMut.isPending || updateMut.isPending ? "Guardando…" : (isNew ? "Crear servicio" : "Guardar cambios")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
