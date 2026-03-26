import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useLocation } from "wouter";
import { ClipboardCheck, Download, Eye, RefreshCw, Loader2, FolderSync } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Audit = {
  id: number;
  report_type: string;
  company: string;
  status: string;
  step: number | null;
  total_steps: number | null;
  step_message: string | null;
  pdf_path: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  queued: "En cola",
  processing: "Generando...",
  ready: "Listo",
  error: "Error",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  queued: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  ready: "bg-emerald-100 text-emerald-700",
  error: "bg-red-100 text-red-700",
};

const TYPE_LABELS: Record<string, string> = {
  "pre-audit": "Pre-Auditoría",
  "full": "Auditoría Completa",
};

export default function AdminAuditorias() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: audits = [], isLoading } = useQuery<Audit[]>({
    queryKey: ["/api/admin/auditorias"],
    refetchInterval: 10000, // Poll for status updates
  });

  const driveSyncMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/auditorias/drive-sync");
      return res.json();
    },
    onSuccess: (data: { imported?: number; message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auditorias"] });
      toast({ title: data.message || `${data.imported || 0} auditorías importadas de Drive` });
    },
    onError: () => toast({ title: "Error sincronizando con Drive", variant: "destructive" }),
  });

  const filtered = filterStatus === "all" ? audits : audits.filter(a => a.status === filterStatus);

  // Sort: processing first, then ready, then draft, by date desc
  const sorted = [...filtered].sort((a, b) => {
    const statusOrder: Record<string, number> = { processing: 0, queued: 1, ready: 2, draft: 3, error: 4 };
    const diff = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
    if (diff !== 0) return diff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Auditorías</h1>
          <p className="text-sm text-gray-500 mt-1">{audits.length} auditorías en total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => driveSyncMut.mutate()} disabled={driveSyncMut.isPending}>
            {driveSyncMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FolderSync className="w-4 h-4 mr-2" />}
            Sincronizar Drive
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "draft", "processing", "ready", "error"].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterStatus === s ? "bg-[#2FA4A9] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s === "all" ? "Todas" : STATUS_LABELS[s] || s}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay auditorías{filterStatus !== "all" ? ` con estado "${STATUS_LABELS[filterStatus]}"` : ""}</p>
          <p className="text-xs text-gray-400 mt-1">Sincroniza con Drive o genera una auditoría desde un contacto.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                <th className="px-5 py-3">Empresa</th>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Progreso</th>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(audit => (
                <tr
                  key={audit.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/auditorias/${audit.id}`)}
                >
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900 text-sm">{audit.company || "Sin empresa"}</p>
                    <p className="text-xs text-gray-400">{audit.source === "drive_import" ? "Importado de Drive" : "Manual"}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{TYPE_LABELS[audit.report_type] || audit.report_type}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[audit.status] || "bg-gray-100 text-gray-600"}`}>
                      {audit.status === "processing" && <Loader2 className="w-3 h-3 animate-spin" />}
                      {STATUS_LABELS[audit.status] || audit.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {audit.status === "processing" && audit.step && audit.total_steps ? (
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(audit.step / audit.total_steps) * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{audit.step}/{audit.total_steps}</span>
                      </div>
                    ) : audit.status === "ready" ? (
                      <span className="text-xs text-emerald-600">Completado</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-400">
                    {new Date(audit.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {audit.status === "ready" && (
                        <a
                          href={`/api/admin/auditorias/${audit.id}/download`}
                          className="p-1.5 rounded-md text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors"
                          title="Descargar PDF"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => navigate(`/admin/auditorias/${audit.id}`)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors"
                        title="Ver detalle"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
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
