import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Calculator, Loader2, Check, Plus, ExternalLink } from "lucide-react";

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
  billingModel: string;
  baseFeeUSD: string;
  markupPercent: string;
  pricingUnits: PricingUnit[];
  url: string | null;
};

type Breakdown = {
  services: Array<{
    serviceId: string;
    serviceName: string;
    category: string;
    billingModel: string;
    fixedMonthlyUSD: number;
    variableMonthlyUSD: number;
    totalCostUSD: number;
    markupPercent: number;
    clientPaysMonthlyUSD: number;
    units: Array<{
      unit: string;
      included: number;
      usage: number;
      overage: number;
      overageRate: number;
      overageCostUSD: number;
    }>;
    note?: string;
  }>;
  totals: {
    totalFixedUSD: number;
    totalVariableUSD: number;
    monthlyClientPaysUSD: number;
    annualClientPaysUSD: number;
    monthlyLowUSD: number;
    monthlyHighUSD: number;
  };
};

const CATEGORY_LABELS: Record<string, string> = {
  database: "Base de datos",
  storage: "Almacenamiento",
  ai: "IA / LLMs",
  messaging: "Mensajería",
  hosting: "Hosting",
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

function fmtUSD(n: number): string {
  if (n === 0) return "$0";
  if (n < 1) return `$${n.toFixed(2)}`;
  if (n >= 100) return `$${Math.round(n).toLocaleString("en-US")}`;
  return `$${n.toFixed(2)}`;
}

type Props = {
  proposalId: string;
  open: boolean;
  onClose: () => void;
};

export function StackCostCalculatorDialog({ proposalId, open, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mapa serviceId → usage estimate (unit → quantity)
  const [selected, setSelected] = useState<Record<string, Record<string, number>>>({});
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [filter, setFilter] = useState("");

  const { data: services = [], isLoading } = useQuery<StackService[]>({
    queryKey: ["/api/admin/stack-services"],
    enabled: open,
  });

  const calcMut = useMutation({
    mutationFn: async (items: Array<{ serviceId: string; usageEstimate: Record<string, number> }>) => {
      const res = await apiRequest("POST", `/api/admin/proposals/${proposalId}/stack-cost/calculate`, { items });
      return res.json() as Promise<Breakdown>;
    },
    onSuccess: (data) => setBreakdown(data),
    onError: (err: any) => toast({ title: "Error calculando", description: err?.message, variant: "destructive" }),
  });

  const applyMut = useMutation({
    mutationFn: async (items: Array<{ serviceId: string; usageEstimate: Record<string, number> }>) => {
      const res = await apiRequest("POST", `/api/admin/proposals/${proposalId}/stack-cost/apply`, { items });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✓ Costos aplicados a la propuesta" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${proposalId}`] });
      onClose();
    },
    onError: (err: any) => toast({ title: "Error aplicando", description: err?.message, variant: "destructive" }),
  });

  // Cuando cambia "selected", recalcula con debounce 500ms
  useEffect(() => {
    if (!open || Object.keys(selected).length === 0) {
      setBreakdown(null);
      return;
    }
    const items = Object.entries(selected).map(([serviceId, usageEstimate]) => ({ serviceId, usageEstimate }));
    const timer = setTimeout(() => calcMut.mutate(items), 500);
    return () => clearTimeout(timer);
  }, [selected, open]);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setSelected({});
      setBreakdown(null);
      setFilter("");
    }
  }, [open]);

  const filteredServices = useMemo(() => {
    const q = filter.toLowerCase();
    return services.filter(s => !q || s.name.toLowerCase().includes(q) || s.category.includes(q) || s.vendor?.toLowerCase().includes(q));
  }, [services, filter]);

  const toggleService = (s: StackService) => {
    setSelected(prev => {
      const next = { ...prev };
      if (next[s.id]) {
        delete next[s.id];
      } else {
        // Default: 0 para cada unidad (admin teclea el uso real)
        next[s.id] = Object.fromEntries((s.pricingUnits || []).map(pu => [pu.unit, 0]));
      }
      return next;
    });
  };

  const updateUsage = (serviceId: string, unit: string, value: string) => {
    setSelected(prev => ({
      ...prev,
      [serviceId]: { ...(prev[serviceId] || {}), [unit]: parseFloat(value) || 0 },
    }));
  };

  const handleApply = () => {
    if (!breakdown) return;
    const items = Object.entries(selected).map(([serviceId, usageEstimate]) => ({ serviceId, usageEstimate }));
    applyMut.mutate(items);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-[#2FA4A9]" />
            Calculadora exacta de costos operativos
          </DialogTitle>
          <DialogDescription>
            Selecciona los servicios del stack que usa este proyecto, teclea el uso mensual estimado, y aplica el desglose a la propuesta.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 min-h-0">
          {/* Sidebar: catálogo */}
          <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col bg-gray-50/40">
            <div className="px-3 py-2 border-b border-gray-200 bg-white">
              <Input
                placeholder="Buscar servicio…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {isLoading ? (
                <p className="text-xs text-gray-400 text-center py-4">Cargando catálogo…</p>
              ) : filteredServices.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Sin servicios. Agrégalos en /admin/stack-catalog.</p>
              ) : (
                filteredServices.map(s => {
                  const isSelected = !!selected[s.id];
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleService(s)}
                      className={`w-full text-left p-2 rounded-md border text-xs transition-colors ${
                        isSelected ? "bg-[#2FA4A9]/10 border-[#2FA4A9] text-gray-900" : "bg-white border-gray-200 hover:border-gray-300 text-gray-700"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-4 h-4 mt-0.5 rounded border shrink-0 flex items-center justify-center ${isSelected ? "bg-[#2FA4A9] border-[#2FA4A9]" : "border-gray-300"}`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{s.name}</div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`px-1.5 py-px rounded text-[10px] ${CATEGORY_COLORS[s.category]}`}>
                              {CATEGORY_LABELS[s.category] || s.category}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono">{fmtUSD(parseFloat(s.baseFeeUSD || "0"))}/mes</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Body: configurador + breakdown */}
          <div className="overflow-y-auto pr-1 space-y-4 min-h-0">
            {Object.keys(selected).length === 0 ? (
              <div className="text-center py-16 border border-dashed rounded-lg">
                <Plus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Selecciona servicios del catálogo a la izquierda para empezar.</p>
                <p className="text-xs text-gray-400 mt-1">Cada servicio te pide su uso mensual estimado.</p>
              </div>
            ) : (
              <>
                {/* Inputs por servicio */}
                {Object.entries(selected).map(([serviceId, usage]) => {
                  const svc = services.find(s => s.id === serviceId);
                  if (!svc) return null;
                  const svcBreakdown = breakdown?.services.find(b => b.serviceId === serviceId);
                  return (
                    <div key={serviceId} className="border border-gray-200 rounded-lg p-3 bg-white">
                      <div className="flex items-start justify-between mb-3 gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{svc.name}</span>
                            <span className={`px-1.5 py-px rounded text-[10px] ${CATEGORY_COLORS[svc.category]}`}>
                              {CATEGORY_LABELS[svc.category] || svc.category}
                            </span>
                            {svc.url && (
                              <a href={svc.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#2FA4A9]">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            Base: {fmtUSD(parseFloat(svc.baseFeeUSD || "0"))}/mes
                            {parseFloat(svc.markupPercent || "0") > 0 && ` · +${svc.markupPercent}% markup`}
                          </div>
                        </div>
                        {svcBreakdown && (
                          <div className="text-right shrink-0">
                            <div className="text-xs text-gray-400">Cliente paga</div>
                            <div className="font-bold text-sm text-[#2FA4A9]">{fmtUSD(svcBreakdown.clientPaysMonthlyUSD)}/mes</div>
                          </div>
                        )}
                      </div>
                      {(svc.pricingUnits || []).length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic">Sin tarifas variables (solo base fee mensual).</p>
                      ) : (
                        <div className="space-y-1.5">
                          {svc.pricingUnits.map((pu) => {
                            const usageVal = usage[pu.unit] || 0;
                            const unitBreakdown = svcBreakdown?.units.find(u => u.unit === pu.unit);
                            return (
                              <div key={pu.unit} className="grid grid-cols-[1fr_100px_auto] gap-2 items-center text-xs">
                                <div className="text-gray-600">
                                  <span className="font-medium">{pu.unit}</span>
                                  <span className="text-gray-400 ml-1">— incluidas: {pu.includedQuantity}, extra: ${pu.overageUnitCostUSD}/u</span>
                                </div>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={usageVal}
                                  onChange={(e) => updateUsage(serviceId, pu.unit, e.target.value)}
                                  className="h-7 text-xs font-mono"
                                  placeholder="Uso/mes"
                                />
                                <div className={`text-[11px] font-mono w-20 text-right ${(unitBreakdown?.overageCostUSD || 0) > 0 ? "text-amber-700" : "text-gray-400"}`}>
                                  {unitBreakdown ? fmtUSD(unitBreakdown.overageCostUSD) : "—"}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {svcBreakdown?.note && (
                        <p className="text-[11px] text-gray-500 italic mt-2 border-t pt-2">{svcBreakdown.note}</p>
                      )}
                    </div>
                  );
                })}

                {/* Totales */}
                {breakdown && (
                  <div className="border-2 border-[#2FA4A9]/30 bg-[#2FA4A9]/5 rounded-lg p-4">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Fijo mensual</div>
                        <div className="font-bold text-lg text-gray-900">{fmtUSD(breakdown.totals.totalFixedUSD)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Variable mensual</div>
                        <div className="font-bold text-lg text-gray-900">{fmtUSD(breakdown.totals.totalVariableUSD)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-[#2FA4A9] font-semibold">Cliente paga/mes</div>
                        <div className="font-bold text-xl text-[#2FA4A9]">{fmtUSD(breakdown.totals.monthlyClientPaysUSD)}</div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-[#2FA4A9]/20 grid grid-cols-3 gap-3 text-xs">
                      <div className="text-center">
                        <span className="text-gray-500">Estimado bajo: </span>
                        <span className="font-mono font-semibold text-gray-700">{fmtUSD(breakdown.totals.monthlyLowUSD)}</span>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-500">Estimado alto (+25%): </span>
                        <span className="font-mono font-semibold text-gray-700">{fmtUSD(breakdown.totals.monthlyHighUSD)}</span>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-500">Anual: </span>
                        <span className="font-mono font-semibold text-gray-700">{fmtUSD(breakdown.totals.annualClientPaysUSD)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="border-t pt-3">
          <div className="flex items-center justify-between w-full gap-3">
            <p className="text-xs text-gray-500">
              {calcMut.isPending && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
              Aplicar reemplaza la sección "Costos operativos" de la propuesta.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button
                onClick={handleApply}
                disabled={!breakdown || applyMut.isPending || Object.keys(selected).length === 0}
                className="bg-[#2FA4A9] hover:bg-[#238b8f] gap-1.5"
              >
                {applyMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {applyMut.isPending ? "Aplicando…" : "Aplicar a propuesta"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
