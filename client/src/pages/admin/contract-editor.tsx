import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SimpleMarkdown } from "@/lib/simple-markdown";
import { ArrowLeft, Lock, Pen, Download, RotateCcw, Save, Loader2, ExternalLink } from "lucide-react";

type ContractDetail = {
  id: string;
  proposalId: string;
  contactId: string;
  templateId: string;
  title: string;
  bodyMarkdown: string;
  resolvedVariables: Record<string, unknown> | null;
  status: "draft" | "locked" | "signed" | "cancelled";
  lockedAt: string | null;
  signedAt: string | null;
  signedBy: string | null;
  signedNotes: string | null;
  accessToken: string;
  notes: string | null;
  createdAt: string;
  contact: { nombre: string; empresa: string; email: string };
  proposal: { title: string; accessToken: string; status: string };
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

export default function AdminContractEditor() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [showVars, setShowVars] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signForm, setSignForm] = useState({ signedBy: "", signedAt: new Date().toISOString().slice(0, 10), signedNotes: "" });
  const [lockOpen, setLockOpen] = useState(false);

  const { data: contract, isLoading } = useQuery<ContractDetail>({
    queryKey: [`/api/admin/contracts/${id}`],
  });

  useEffect(() => {
    if (contract) setDraft(contract.bodyMarkdown);
  }, [contract?.id]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/admin/contracts/${id}`] });

  const saveMut = useMutation({
    mutationFn: async (data: Partial<ContractDetail>) => {
      const res = await apiRequest("PATCH", `/api/admin/contracts/${id}`, data);
      return res.json();
    },
    onSuccess: () => { toast({ title: "✓ Guardado" }); invalidate(); },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const regenMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/contracts/${id}/regenerate`);
      return res.json();
    },
    onSuccess: () => { toast({ title: "✓ Variables re-resueltas" }); invalidate(); },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const lockMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/contracts/${id}/lock`);
      return res.json();
    },
    onSuccess: () => { toast({ title: "✓ Contrato bloqueado" }); invalidate(); setLockOpen(false); },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const signMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/contracts/${id}/sign`, signForm);
      return res.json();
    },
    onSuccess: () => { toast({ title: "✓ Contrato marcado como firmado" }); invalidate(); setSignOpen(false); },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  if (isLoading || !contract) {
    return <div className="text-center py-20 text-gray-400">Cargando contrato…</div>;
  }

  const isDraft = contract.status === "draft";
  const dirty = isDraft && draft !== contract.bodyMarkdown;
  const previewUrl = `${window.location.origin}/contract-preview/${contract.accessToken}`;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <button onClick={() => navigate("/admin/contracts")} className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{contract.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {contract.contact?.nombre} — {contract.contact?.empresa} ·
            <a href={`/admin/proposals/${contract.proposalId}`} className="text-[#2FA4A9] hover:underline ml-1">
              {contract.proposal?.title}
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[contract.status]}`}>
            {STATUS_LABELS[contract.status]}
          </span>
          {contract.lockedAt && (
            <span className="text-[11px] text-gray-400">bloqueado {new Date(contract.lockedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span>
          )}
        </div>
      </div>

      {contract.status === "signed" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900">
          ✓ Firmado por <strong>{contract.signedBy}</strong> el {contract.signedAt && new Date(contract.signedAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}.
          {contract.signedNotes && <div className="text-xs text-emerald-700 mt-1">{contract.signedNotes}</div>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {isDraft && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveMut.mutate({ bodyMarkdown: draft })}
              disabled={!dirty || saveMut.isPending}
              className="gap-1.5"
            >
              {saveMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Guardar cambios
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { if (confirm("¿Re-resolver variables desde la propuesta actual? Pierde cambios manuales.")) regenMut.mutate(); }}
              disabled={regenMut.isPending}
              className="gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Re-renderizar variables
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLockOpen(true)}
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <Lock className="w-3.5 h-3.5" />
              Bloquear (no más edición)
            </Button>
          </>
        )}
        {contract.status === "locked" && (
          <Button size="sm" onClick={() => setSignOpen(true)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            <Pen className="w-3.5 h-3.5" />
            Marcar como firmado
          </Button>
        )}
        <a href={`/api/admin/contracts/${id}/pdf`}>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Descargar PDF
          </Button>
        </a>
        <a href={previewUrl} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline" className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> Preview público
          </Button>
        </a>
        <Button size="sm" variant="outline" onClick={() => setShowVars(!showVars)} className="gap-1.5">
          {showVars ? "Ocultar variables" : "Ver variables resueltas"}
        </Button>
      </div>

      {showVars && contract.resolvedVariables && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <h3 className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-2">Variables inyectadas (auditoría)</h3>
          <pre className="text-[11px] font-mono text-amber-900 overflow-x-auto">{JSON.stringify(contract.resolvedVariables, null, 2)}</pre>
        </div>
      )}

      <div className={`grid gap-4 ${isDraft ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1"}`}>
        {isDraft && (
          <div>
            <div className="text-xs text-gray-500 mb-1.5 font-semibold uppercase tracking-wide">Markdown editable</div>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="font-mono text-xs h-[70vh] resize-none"
              spellCheck={false}
            />
          </div>
        )}
        <div>
          <div className="text-xs text-gray-500 mb-1.5 font-semibold uppercase tracking-wide">{isDraft ? "Preview" : "Contrato"}</div>
          <div className="bg-white border border-gray-200 rounded-lg p-8 overflow-y-auto h-[70vh]">
            <SimpleMarkdown source={isDraft ? draft : contract.bodyMarkdown} className="text-sm" />
          </div>
        </div>
      </div>

      {/* Lock confirmation */}
      <AlertDialog open={lockOpen} onOpenChange={setLockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Bloquear contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              Una vez bloqueado, el contenido queda inmutable. Para hacer cambios deberás generar un contrato nuevo desde la propuesta.
              <br /><br />
              <strong>Asegúrate de haber revisado todo antes de bloquear.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => lockMut.mutate()} disabled={lockMut.isPending} className="bg-amber-600 hover:bg-amber-700">
              {lockMut.isPending ? "Bloqueando…" : "Sí, bloquear"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sign dialog */}
      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar contrato como firmado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Firmado por (cliente) *</Label>
              <Input
                value={signForm.signedBy}
                onChange={(e) => setSignForm({ ...signForm, signedBy: e.target.value })}
                placeholder="Nombre completo del representante del cliente"
              />
            </div>
            <div>
              <Label className="text-xs">Fecha de firma</Label>
              <Input
                type="date"
                value={signForm.signedAt}
                onChange={(e) => setSignForm({ ...signForm, signedAt: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Notas (opcional)</Label>
              <Textarea
                value={signForm.signedNotes}
                onChange={(e) => setSignForm({ ...signForm, signedNotes: e.target.value })}
                rows={2}
                placeholder="Firma escaneada subida a Drive, en sobre, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => signMut.mutate()}
              disabled={!signForm.signedBy.trim() || signMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {signMut.isPending ? "Guardando…" : "Marcar firmado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
