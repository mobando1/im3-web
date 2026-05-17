import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Plus, Trash2, ExternalLink, Loader2 } from "lucide-react";

type PricingUnit = { unit: string; includedQuantity: number; overageUnitCostUSD: number; note?: string };
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
    billingModel: string;
    fixedMonthlyUSD: number;
    variableMonthlyUSD: number;
    clientPaysMonthlyUSD: number;
    units: Array<{ unit: string; included: number; usage: number; overage: number; overageCostUSD: number }>;
    note?: string;
  }>;
  totals: {
    totalFixedUSD: number;
    totalVariableUSD: number;
    monthlyClientPaysUSD: number;
    annualClientPaysUSD: number;
  };
};

const CATEGORY_LABELS: Record<string, string> = {
  database: "Bases de datos",
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

/**
 * Calculadora ad-hoc — selector simple servicio + unidad + cantidad → resultado inmediato.
 * No está atada a propuesta. Perfecta para presentación en vivo: "¿cuánto cuestan 500 mensajes?".
 */
export function SimulatorCalculator() {
  const { data: services = [], isLoading } = useQuery<StackService[]>({
    queryKey: ["/api/admin/stack-services"],
  });

  // Modo simple: 1 servicio + 1 unidad + cantidad. Modo avanzado: array de servicios.
  const [mode, setMode] = useState<"quick" | "stack">("quick");

  // Modo quick
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const selectedService = services.find(s => s.id === selectedServiceId);

  // Modo stack
  const [stack, setStack] = useState<Record<string, Record<string, number>>>({});

  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);

  const calcMut = useMutation({
    mutationFn: async (items: Array<{ serviceId: string; usageEstimate: Record<string, number> }>) => {
      const res = await apiRequest("POST", "/api/admin/stack-simulator/calculate", { items });
      return res.json() as Promise<Breakdown>;
    },
    onSuccess: (data) => setBreakdown(data),
  });

  // Modo quick: usuario edita un servicio → calcula auto con debounce
  const [quickUsage, setQuickUsage] = useState<Record<string, number>>({});

  // Reset quickUsage al cambiar de servicio
  useEffect(() => {
    if (selectedService) {
      setQuickUsage(Object.fromEntries((selectedService.pricingUnits || []).map(pu => [pu.unit, 0])));
      setBreakdown(null);
    }
  }, [selectedServiceId]);

  // Auto-calcular en modo quick con debounce
  useEffect(() => {
    if (mode !== "quick" || !selectedServiceId) return;
    const timer = setTimeout(() => {
      calcMut.mutate([{ serviceId: selectedServiceId, usageEstimate: quickUsage }]);
    }, 400);
    return () => clearTimeout(timer);
  }, [mode, selectedServiceId, quickUsage]);

  // Auto-calcular en modo stack con debounce
  useEffect(() => {
    if (mode !== "stack" || Object.keys(stack).length === 0) {
      if (mode === "stack") setBreakdown(null);
      return;
    }
    const timer = setTimeout(() => {
      const items = Object.entries(stack).map(([serviceId, usageEstimate]) => ({ serviceId, usageEstimate }));
      calcMut.mutate(items);
    }, 400);
    return () => clearTimeout(timer);
  }, [mode, stack]);

  const groupedServices = useMemo(() => {
    const grouped: Record<string, StackService[]> = {};
    for (const s of services) {
      (grouped[s.category] ||= []).push(s);
    }
    return grouped;
  }, [services]);

  if (isLoading) return <div className="text-center py-12 text-gray-400">Cargando catálogo…</div>;

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
        <button
          onClick={() => setMode("quick")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === "quick" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
        >
          Rápida (1 servicio)
        </button>
        <button
          onClick={() => setMode("stack")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === "stack" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
        >
          Stack completo
        </button>
      </div>

      {mode === "quick" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
            <div>
              <label className="text-xs font-semibold text-gray-600">Servicio</label>
              <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger><SelectValue placeholder="Elige un servicio del catálogo…" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(groupedServices).map(([cat, list]) => (
                    <div key={cat}>
                      <div className="text-[10px] font-semibold text-gray-400 uppercase px-2 py-1">{CATEGORY_LABELS[cat]}</div>
                      {list.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}{s.vendor ? ` — ${s.vendor}` : ""}</SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedService?.url && (
              <a href={selectedService.url} target="_blank" rel="noopener noreferrer" className="self-end text-[11px] text-[#2FA4A9] hover:underline flex items-center gap-1 mb-2">
                Pricing oficial <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {selectedService && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{selectedService.name}</h3>
                  <p className="text-xs text-gray-500">Base mensual: <span className="font-mono">{fmtUSD(parseFloat(selectedService.baseFeeUSD || "0"))}</span>
                    {parseFloat(selectedService.markupPercent || "0") > 0 && <> · markup IM3 +{selectedService.markupPercent}%</>}
                  </p>
                </div>
                {breakdown?.services[0] && (
                  <div className="text-right">
                    <div className="text-[10px] text-gray-400 uppercase">Cliente paga</div>
                    <div className="font-bold text-xl text-[#2FA4A9]">{fmtUSD(breakdown.services[0].clientPaysMonthlyUSD)}<span className="text-xs text-gray-400">/mes</span></div>
                    <div className="text-[11px] text-gray-500">{fmtUSD(breakdown.totals.annualClientPaysUSD)}/año</div>
                  </div>
                )}
              </div>

              {(selectedService.pricingUnits || []).length === 0 ? (
                <p className="text-xs text-gray-400 italic">Sin tarifas variables — solo base fee mensual fija.</p>
              ) : (
                <div className="space-y-2">
                  {selectedService.pricingUnits.map(pu => {
                    const usageVal = quickUsage[pu.unit] || 0;
                    const unitBd = breakdown?.services[0]?.units.find(u => u.unit === pu.unit);
                    const isOverage = (unitBd?.overageCostUSD || 0) > 0;
                    return (
                      <div key={pu.unit} className="grid grid-cols-[1fr_120px_auto] gap-3 items-center text-sm">
                        <div className="text-gray-700">
                          <div>{pu.unit}</div>
                          <div className="text-[10px] text-gray-400 font-mono">incluidas: {pu.includedQuantity} · extra: ${pu.overageUnitCostUSD}/u</div>
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          value={usageVal}
                          onChange={(e) => setQuickUsage({ ...quickUsage, [pu.unit]: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-xs font-mono text-right"
                        />
                        <div className={`text-xs font-mono w-24 text-right ${isOverage ? "text-amber-700 font-semibold" : "text-gray-400"}`}>
                          {unitBd ? fmtUSD(unitBd.overageCostUSD) : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        // Modo stack
        <div className="space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600">Servicios en el stack</span>
              <Select
                value=""
                onValueChange={(v) => {
                  const svc = services.find(s => s.id === v);
                  if (svc && !stack[v]) {
                    setStack({ ...stack, [v]: Object.fromEntries((svc.pricingUnits || []).map(pu => [pu.unit, 0])) });
                  }
                }}
              >
                <SelectTrigger className="w-[220px] h-8 text-xs"><SelectValue placeholder="+ Agregar servicio" /></SelectTrigger>
                <SelectContent>
                  {services.filter(s => !stack[s.id]).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {Object.keys(stack).length === 0 && (
              <p className="text-xs text-gray-400 italic text-center py-4">Agrega servicios al stack para calcular el costo total.</p>
            )}
            <div className="space-y-2">
              {Object.entries(stack).map(([serviceId, usage]) => {
                const svc = services.find(s => s.id === serviceId);
                if (!svc) return null;
                const svcBd = breakdown?.services.find(b => b.serviceId === serviceId);
                return (
                  <div key={serviceId} className="bg-white border border-gray-200 rounded-md p-3">
                    <div className="flex items-baseline justify-between mb-2">
                      <div>
                        <span className="font-medium text-sm">{svc.name}</span>
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[svc.category]}`}>{CATEGORY_LABELS[svc.category]}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {svcBd && <span className="text-sm font-mono font-semibold text-[#2FA4A9]">{fmtUSD(svcBd.clientPaysMonthlyUSD)}/mes</span>}
                        <button onClick={() => { const n = { ...stack }; delete n[serviceId]; setStack(n); }} className="text-gray-300 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {(svc.pricingUnits || []).length > 0 && (
                      <div className="space-y-1 mt-2">
                        {svc.pricingUnits.map(pu => (
                          <div key={pu.unit} className="grid grid-cols-[1fr_100px] gap-2 items-center text-[11px]">
                            <span className="text-gray-600 truncate">{pu.unit}</span>
                            <Input
                              type="number"
                              step="0.01"
                              value={usage[pu.unit] || 0}
                              onChange={(e) => setStack({ ...stack, [serviceId]: { ...usage, [pu.unit]: parseFloat(e.target.value) || 0 } })}
                              className="h-7 text-[11px] font-mono text-right"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {breakdown && Object.keys(stack).length > 0 && (
            <div className="bg-[#2FA4A9]/5 border-2 border-[#2FA4A9]/30 rounded-lg p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Fijo/mes</div>
                  <div className="font-bold text-base text-gray-900">{fmtUSD(breakdown.totals.totalFixedUSD)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Variable/mes</div>
                  <div className="font-bold text-base text-gray-900">{fmtUSD(breakdown.totals.totalVariableUSD)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[#2FA4A9] font-semibold">Total mensual</div>
                  <div className="font-bold text-xl text-[#2FA4A9]">{fmtUSD(breakdown.totals.monthlyClientPaysUSD)}</div>
                  <div className="text-[10px] text-gray-500">{fmtUSD(breakdown.totals.annualClientPaysUSD)}/año</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {calcMut.isPending && (
        <p className="text-[11px] text-gray-400 text-center flex items-center justify-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Calculando…
        </p>
      )}
    </div>
  );
}
