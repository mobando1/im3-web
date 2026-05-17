import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

type DriftedService = {
  name: string;
  catalogName: string;
  lastPriceUpdate: string;
};

type DriftedProposal = {
  proposalId: string;
  title: string;
  contactId: string;
  contactName: string | null;
  contactEmpresa: string | null;
  status: string;
  proposalUpdatedAt: string;
  driftedServices: DriftedService[];
};

type DriftReport = { total: number; proposals: DriftedProposal[] };

/**
 * Banner amarillo que aparece cuando hay propuestas con precios desactualizados.
 * Se autoesconde si total === 0. Colapsable para detalles por propuesta.
 */
export function StackDriftBanner({ className }: { className?: string }) {
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<DriftReport>({
    queryKey: ["/api/admin/stack-drift"],
    refetchInterval: 60_000, // re-chequea cada minuto
  });

  if (isLoading || !data || data.total === 0) return null;

  return (
    <div className={`bg-amber-50 border border-amber-200 rounded-lg overflow-hidden ${className || ""}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100/50 transition-colors"
      >
        <div className="flex items-center gap-3 text-left">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-amber-900">
              {data.total} propuesta{data.total !== 1 ? "s" : ""} con precios desactualizados
            </div>
            <div className="text-xs text-amber-700">
              Editaste el catálogo después de generar estas propuestas. Revisa si necesitas actualizarlas antes de enviarlas al cliente.
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-amber-600" /> : <ChevronDown className="w-4 h-4 text-amber-600" />}
      </button>

      {expanded && (
        <div className="border-t border-amber-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-amber-100 bg-amber-50/40">
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-amber-800 uppercase tracking-wide">Propuesta</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-amber-800 uppercase tracking-wide">Cliente</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-amber-800 uppercase tracking-wide">Servicios desactualizados</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-amber-800 uppercase tracking-wide">Generada</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-50">
              {data.proposals.map(p => (
                <tr key={p.proposalId} className="hover:bg-amber-50/30">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900 text-sm">{p.title}</div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">{p.status}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-sm text-gray-700">{p.contactName || "—"}</div>
                    <div className="text-[11px] text-gray-400">{p.contactEmpresa}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {p.driftedServices.map((s, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800" title={`Actualizado ${new Date(s.lastPriceUpdate).toLocaleDateString("es-CO")}`}>
                          {s.catalogName}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                    {new Date(p.proposalUpdatedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "2-digit" })}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => navigate(`/admin/proposals/${p.proposalId}`)}
                      className="inline-flex items-center gap-1 text-xs text-[#2FA4A9] hover:underline"
                    >
                      Abrir <ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
