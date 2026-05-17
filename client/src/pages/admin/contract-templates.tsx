import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, FileCheck, Trash2, Star, Eye } from "lucide-react";
import { SimpleMarkdown, extractVariables } from "@/lib/simple-markdown";

type ContractTemplate = {
  id: string;
  name: string;
  description: string | null;
  bodyMarkdown: string;
  expectedVariables: string[];
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const KNOWN_VARIABLES = [
  "fecha.hoy", "fecha.firma",
  "cliente.nombre", "cliente.empresa", "cliente.email", "cliente.telefono",
  "im3.nombre", "im3.email", "im3.representante",
  "proposal.titulo", "proposal.alcance",
  "pricing.totalUSD", "pricing.milestones",
  "costos.totalMensualUSD", "costos.totalAnualUSD", "costos.desglose",
  "timeline.semanas", "timeline.fechaInicio", "timeline.fechaFin",
];

function emptyTemplate(): Partial<ContractTemplate> {
  return {
    name: "",
    description: "",
    bodyMarkdown: "# Nuevo contrato\n\nEscribe aquí el cuerpo del contrato usando variables como `{{cliente.nombre}}`.\n",
    expectedVariables: [],
    isDefault: false,
    isActive: true,
  };
}

export default function AdminContractTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Partial<ContractTemplate> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const { data: templates = [], isLoading } = useQuery<ContractTemplate[]>({
    queryKey: ["/api/admin/contract-templates"],
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/contract-templates"] });

  const createMut = useMutation({
    mutationFn: async (data: Partial<ContractTemplate>) => {
      const res = await apiRequest("POST", "/api/admin/contract-templates", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✓ Plantilla creada" });
      invalidate();
      setEditing(null);
      setIsNew(false);
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ContractTemplate> }) => {
      const res = await apiRequest("PATCH", `/api/admin/contract-templates/${id}`, data);
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
      await apiRequest("DELETE", `/api/admin/contract-templates/${id}`);
    },
    onSuccess: () => { toast({ title: "✓ Archivada" }); invalidate(); },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!editing?.name?.trim() || !editing?.bodyMarkdown?.trim()) {
      toast({ title: "Faltan campos", description: "name y bodyMarkdown son requeridos", variant: "destructive" });
      return;
    }
    // Auto-extraer variables del template para guardar
    const expectedVariables = extractVariables(editing.bodyMarkdown);
    const data = { ...editing, expectedVariables };
    if (isNew) createMut.mutate(data);
    else if (editing.id) updateMut.mutate({ id: editing.id as string, data });
  };

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById("template-body") as HTMLTextAreaElement | null;
    const v = `{{${variable}}}`;
    if (textarea && editing) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newBody = (editing.bodyMarkdown || "").substring(0, start) + v + (editing.bodyMarkdown || "").substring(end);
      setEditing({ ...editing, bodyMarkdown: newBody });
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + v.length;
      }, 0);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-[#2FA4A9]" />
            Plantillas de Contrato
          </h1>
          <p className="text-sm text-gray-500 mt-1">Plantillas Markdown con variables. Cuando generas un contrato desde una propuesta aceptada, las variables se reemplazan automáticamente.</p>
        </div>
        <Button onClick={() => { setEditing(emptyTemplate()); setIsNew(true); }} className="bg-[#2FA4A9] hover:bg-[#238b8f] gap-1.5">
          <Plus className="w-4 h-4" /> Nueva plantilla
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">Cargando…</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border border-dashed rounded-lg">
          No hay plantillas. Crea la primera arriba.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map(t => (
            <div key={t.id} className={`bg-white border rounded-lg p-4 hover:border-[#2FA4A9] transition-colors ${!t.isActive ? "opacity-40" : ""}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {t.isDefault && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 flex items-center gap-1">
                        <Star className="w-2.5 h-2.5 fill-amber-500" /> Default
                      </span>
                    )}
                    <h3 className="font-semibold text-gray-900 truncate">{t.name}</h3>
                  </div>
                  {t.description && <p className="text-xs text-gray-500 line-clamp-2">{t.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditing(t); setIsNew(false); }} className="p-1.5 text-gray-400 hover:text-[#2FA4A9]" title="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {!t.isDefault && (
                    <button
                      onClick={() => { if (confirm(`¿Archivar "${t.name}"?`)) deleteMut.mutate(t.id); }}
                      className="p-1.5 text-gray-300 hover:text-red-500"
                      title="Archivar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
                {t.expectedVariables.length} variable{t.expectedVariables.length !== 1 ? "s" : ""} · actualizado {new Date(t.updatedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "2-digit" })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setIsNew(false); } }}>
        <DialogContent className="max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{isNew ? "Nueva plantilla de contrato" : `Editar: ${editing?.name}`}</DialogTitle>
            <DialogDescription>
              Variables `{`{{}}`}` se resaltan en amarillo. Click en un chip de abajo para insertarla en el cursor.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="flex-1 overflow-hidden flex flex-col gap-3 min-h-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label className="text-xs">Descripción</Label>
                    <Input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Cuándo usar esta plantilla" />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-600 mb-2">
                    <Switch checked={editing.isDefault ?? false} onCheckedChange={(v) => setEditing({ ...editing, isDefault: v })} />
                    Default
                  </label>
                </div>
              </div>

              {/* Variables chips */}
              <div>
                <Label className="text-xs">Variables disponibles (click para insertar)</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {KNOWN_VARIABLES.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-gray-100 hover:bg-amber-100 hover:text-amber-800 text-gray-600 transition-colors"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor + preview side by side */}
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Markdown del contrato</span>
                <label className="flex items-center gap-2">
                  <Switch checked={showPreview} onCheckedChange={setShowPreview} />
                  Mostrar preview
                </label>
              </div>
              <div className={`flex-1 overflow-hidden grid gap-3 min-h-0 ${showPreview ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
                <Textarea
                  id="template-body"
                  value={editing.bodyMarkdown || ""}
                  onChange={(e) => setEditing({ ...editing, bodyMarkdown: e.target.value })}
                  className="font-mono text-xs h-full min-h-[400px] resize-none"
                  spellCheck={false}
                />
                {showPreview && (
                  <div className="border border-gray-200 rounded-lg p-4 overflow-y-auto bg-white">
                    <SimpleMarkdown source={editing.bodyMarkdown || ""} className="text-sm" />
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); setIsNew(false); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-[#2FA4A9] hover:bg-[#238b8f]">
              {createMut.isPending || updateMut.isPending ? "Guardando…" : (isNew ? "Crear" : "Guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
