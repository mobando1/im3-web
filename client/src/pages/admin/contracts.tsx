import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileCheck, Download, ExternalLink, FileText } from "lucide-react";

type ContractRow = {
  id: string;
  proposalId: string;
  contactId: string;
  title: string;
  status: "draft" | "locked" | "signed" | "cancelled";
  lockedAt: string | null;
  signedAt: string | null;
  signedBy: string | null;
  createdAt: string;
  contactName: string | null;
  contactEmpresa: string | null;
  proposalTitle: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  locked: "Bloqueado",
  signed: "Firmado",
  cancelled: "Cancelado",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  locked: "bg-amber-100 text-amber-700",
  signed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function AdminContracts() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<string>("all");

  const { data: contracts = [], isLoading } = useQuery<ContractRow[]>({
    queryKey: [`/api/admin/contracts${status !== "all" ? `?status=${status}` : ""}`],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-[#2FA4A9]" />
            Contratos
          </h1>
          <p className="text-sm text-gray-500 mt-1">Documentos generados desde propuestas aceptadas. Estado: borrador → bloqueado → firmado.</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/admin/contract-templates")} className="gap-1.5">
          <FileText className="w-4 h-4" /> Plantillas
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="locked">Bloqueado</SelectItem>
            <SelectItem value="signed">Firmado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-gray-400">{contracts.length} contrato{contracts.length !== 1 ? "s" : ""}</span>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">Cargando contratos…</div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border border-dashed rounded-lg">
          {status === "all" ? "Aún no hay contratos. Genera el primero desde una propuesta aceptada." : `Sin contratos en estado "${STATUS_LABELS[status] || status}".`}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Contrato</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Firma</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Creado</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contracts.map(c => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/admin/contracts/${c.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm text-gray-900">{c.title}</div>
                    {c.proposalTitle && <div className="text-[11px] text-gray-400 truncate">desde: {c.proposalTitle}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-700">{c.contactName || "—"}</div>
                    <div className="text-[11px] text-gray-400">{c.contactEmpresa}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {c.signedAt
                      ? <><span>{new Date(c.signedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "2-digit" })}</span><div className="text-[10px] text-gray-400">{c.signedBy}</div></>
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(c.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "2-digit" })}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      <a
                        href={`/api/admin/contracts/${c.id}/pdf`}
                        className="p-1.5 text-gray-400 hover:text-[#2FA4A9]"
                        title="Descargar PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => navigate(`/admin/contracts/${c.id}`)}
                        className="p-1.5 text-gray-400 hover:text-[#2FA4A9]"
                        title="Abrir"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
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
