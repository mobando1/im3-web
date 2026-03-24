import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useLocation } from "wouter";
import { Plus, FolderKanban, ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  contactId: string | null;
  contactName: string | null;
  startDate: string | null;
  estimatedEndDate: string | null;
  totalBudget: number | null;
  currency: string;
  accessToken: string;
  progress: number;
  taskCount: number;
  completedTaskCount: number;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  planning: "Planeación",
  in_progress: "En progreso",
  paused: "Pausado",
  completed: "Completado",
  cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-blue-100 text-blue-700",
  in_progress: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};

export default function AdminProjects() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [form, setForm] = useState({ name: "", description: "", status: "planning", totalBudget: "", currency: "USD", contactId: "" });

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/admin/projects"],
  });

  const { data: contactsList = [] } = useQuery<Array<{ id: string; nombre: string; empresa: string }>>({
    queryKey: ["/api/admin/contacts"],
    select: (data: any) => (Array.isArray(data) ? data : data?.contacts || []),
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/admin/projects", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      setShowCreate(false);
      setForm({ name: "", description: "", status: "planning", totalBudget: "", currency: "USD", contactId: "" });
      toast({ title: "Proyecto creado" });
    },
  });

  const filtered = filterStatus === "all" ? projects : projects.filter(p => p.status === filterStatus);

  const handleCreate = () => {
    createMutation.mutate({
      name: form.name,
      description: form.description || null,
      status: form.status,
      totalBudget: form.totalBudget ? parseInt(form.totalBudget) : null,
      currency: form.currency,
      contactId: form.contactId || null,
    });
  };

  const copyPortalLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/portal/${token}`);
    toast({ title: "Link copiado al portapapeles" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proyectos</h1>
          <p className="text-sm text-gray-500 mt-1">{projects.length} proyectos en total</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-[#2FA4A9] hover:bg-[#238b8f]">
          <Plus className="w-4 h-4 mr-2" /> Nuevo proyecto
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "planning", "in_progress", "paused", "completed", "cancelled"].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterStatus === s ? "bg-[#2FA4A9] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s === "all" ? "Todos" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Projects table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay proyectos{filterStatus !== "all" ? ` en estado "${STATUS_LABELS[filterStatus]}"` : ""}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                <th className="px-5 py-3">Proyecto</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Progreso</th>
                <th className="px-5 py-3">Portal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => (
                <tr
                  key={p.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/projects/${p.id}`)}
                >
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                    {p.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{p.description}</p>}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{p.contactName || "—"}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#2FA4A9] rounded-full transition-all" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyPortalLink(p.accessToken)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors"
                        title="Copiar link del portal"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <a
                        href={`/portal/${p.accessToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10 transition-colors"
                        title="Abrir portal"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
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
            <DialogTitle>Nuevo proyecto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nombre del proyecto</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: App Logística - TransCarga" />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Breve descripción del proyecto" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Presupuesto</Label>
                <Input type="number" value={form.totalBudget} onChange={e => setForm(f => ({ ...f, totalBudget: e.target.value }))} placeholder="5000" />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="COP">COP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cliente (opcional)</Label>
              <Select value={form.contactId} onValueChange={v => setForm(f => ({ ...f, contactId: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar contacto" /></SelectTrigger>
                <SelectContent>
                  {contactsList.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre} ({c.empresa})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={!form.name || createMutation.isPending} className="w-full bg-[#2FA4A9] hover:bg-[#238b8f]">
              {createMutation.isPending ? "Creando..." : "Crear proyecto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
