import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useLocation } from "wouter";
import { Plus, FileSignature, ExternalLink, Copy, Trash2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Proposal = {
  id: string;
  contactId: string;
  title: string;
  status: string;
  sections: Record<string, string>;
  pricing: any;
  accessToken: string;
  contactName: string;
  contactEmpresa: string;
  contactEmail: string;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  viewed: "Vista",
  accepted: "Aceptada",
  rejected: "Rechazada",
  expired: "Expirada",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-amber-100 text-amber-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-400",
};

export default function AdminProposals() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ contactId: "", title: "", notes: "" });

  const { data: proposals = [], isLoading } = useQuery<Proposal[]>({
    queryKey: ["/api/admin/proposals"],
  });

  const { data: contactsList = [] } = useQuery<Array<{ id: string; nombre: string; empresa: string }>>({
    queryKey: ["/api/admin/contacts"],
    select: (data: any) => (Array.isArray(data) ? data : data?.contacts || []),
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/admin/proposals", data);
      return res.json();
    },
    onSuccess: (proposal) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proposals"] });
      setShowCreate(false);
      setForm({ contactId: "", title: "", notes: "" });
      navigate(`/admin/proposals/${proposal.id}`);
      toast({ title: "Propuesta creada — generando con IA..." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/proposals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proposals"] });
      toast({ title: "Propuesta eliminada" });
    },
  });

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/proposal/${token}`);
    toast({ title: "Link copiado" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Propuestas</h1>
          <p className="text-sm text-gray-500 mt-1">{proposals.length} propuestas en total</p>
        </div>
        <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            apiRequest("POST", "/api/admin/seed-test-contact").then(r => r.json()).then(data => {
              queryClient.invalidateQueries({ queryKey: ["/api/admin/contacts"] });
              toast({ title: data.message });
            }).catch(() => toast({ title: "Error", variant: "destructive" }));
          }}
        >
          <Sparkles className="w-4 h-4 mr-1" /> Contacto demo
        </Button>
        <Button onClick={() => setShowCreate(true)} className="bg-[#2FA4A9] hover:bg-[#238b8f]">
          <Plus className="w-4 h-4 mr-2" /> Nueva propuesta
        </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : proposals.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileSignature className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="text-gray-500">No hay propuestas. Crea la primera.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                <th className="px-5 py-3">Propuesta</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {proposals.map(p => (
                <tr
                  key={p.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/proposals/${p.id}`)}
                >
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900 text-sm">{p.title}</p>
                    {Object.keys(p.sections || {}).length > 0 && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{Object.keys(p.sections).length} secciones generadas</p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm text-gray-700">{p.contactName}</p>
                    <p className="text-xs text-gray-400">{p.contactEmpresa}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status] || p.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-400">
                    {new Date(p.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button onClick={() => copyLink(p.accessToken)} className="p-1.5 rounded-md text-gray-400 hover:text-[#2FA4A9] transition-colors" title="Copiar link">
                        <Copy className="w-4 h-4" />
                      </button>
                      <a href={`/proposal/${p.accessToken}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md text-gray-400 hover:text-[#2FA4A9] transition-colors" title="Ver propuesta">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => { if (confirm(`¿Eliminar "${p.title}"?`)) deleteMutation.mutate(p.id); }}
                        className="p-1.5 rounded-md text-gray-300 hover:text-red-600 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva propuesta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Contacto</Label>
              <Select value={form.contactId} onValueChange={v => setForm(f => ({ ...f, contactId: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar contacto..." /></SelectTrigger>
                <SelectContent>
                  {contactsList.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre} ({c.empresa})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Título <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Se genera automáticamente si está vacío" />
            </div>
            <div className="space-y-2">
              <Label>Notas para la IA <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Instrucciones especiales: ej. 'Enfócate en automatización', 'Presupuesto máximo $10K', etc."
                rows={3}
              />
            </div>
            <Button
              className="w-full bg-[#2FA4A9] hover:bg-[#238b8f] gap-2"
              disabled={!form.contactId || createMutation.isPending}
              onClick={() => createMutation.mutate({ contactId: form.contactId, title: form.title || null, notes: form.notes || null })}
            >
              <Sparkles className="w-4 h-4" />
              {createMutation.isPending ? "Creando..." : "Crear y generar con IA"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
