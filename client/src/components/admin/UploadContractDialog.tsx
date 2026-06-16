import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Check, ChevronsUpDown, Loader2 } from "lucide-react";

type ContactLite = { id: string; nombre: string; empresa: string; email: string };
type ContactsResponse = { contacts: ContactLite[] };

/**
 * Diálogo para subir un contrato firmado (PDF) y amarrarlo a un cliente.
 * Si `presetContactId` viene dado (ej: desde el detalle de un contacto), se oculta el
 * selector de cliente. Si no, muestra un combobox para elegir el contacto.
 */
export function UploadContractDialog({
  open,
  onClose,
  onUploaded,
  presetContactId,
  presetContactLabel,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  presetContactId?: string;
  presetContactLabel?: string;
}) {
  const [contactId, setContactId] = useState<string>(presetContactId ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [signedAt, setSignedAt] = useState("");
  const [signedNotes, setSignedNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: contactsData } = useQuery<ContactsResponse>({
    queryKey: ["/api/admin/contacts?limit=1000"],
    enabled: open && !presetContactId,
  });
  const contacts = contactsData?.contacts ?? [];
  const selected = contacts.find(c => c.id === contactId);
  const effectiveContactId = presetContactId ?? contactId;

  function reset() {
    setContactId(presetContactId ?? ""); setFile(null); setTitle("");
    setSignedBy(""); setSignedAt(""); setSignedNotes(""); setError(null);
  }

  async function handleUpload() {
    if (!effectiveContactId || !file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (title.trim()) fd.append("title", title.trim());
      if (signedBy.trim()) fd.append("signedBy", signedBy.trim());
      if (signedAt) fd.append("signedAt", signedAt);
      if (signedNotes.trim()) fd.append("signedNotes", signedNotes.trim());
      const res = await fetch(`/api/admin/contacts/${effectiveContactId}/contracts/upload`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Error subiendo el contrato");
      reset();
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo el contrato");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Subir contrato firmado</DialogTitle>
          <DialogDescription>Sube un PDF firmado y amárralo a un cliente. Se guarda en su carpeta de Drive (subcarpeta "Contratos").</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {presetContactId ? (
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <div className="text-sm text-gray-700 bg-gray-50 rounded-md px-3 py-2 border border-gray-200">{presetContactLabel || "Cliente seleccionado"}</div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">Cliente *</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className="truncate">{selected ? `${selected.empresa} — ${selected.nombre}` : "Selecciona un cliente…"}</span>
                    <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar por empresa o nombre…" />
                    <CommandList>
                      <CommandEmpty>Sin resultados.</CommandEmpty>
                      <CommandGroup>
                        {contacts.map(c => (
                          <CommandItem
                            key={c.id}
                            value={`${c.empresa} ${c.nombre} ${c.email}`}
                            onSelect={() => { setContactId(c.id); setPickerOpen(false); }}
                          >
                            <Check className={`w-4 h-4 ${contactId === c.id ? "opacity-100" : "opacity-0"}`} />
                            <div className="min-w-0">
                              <div className="text-sm truncate">{c.empresa}</div>
                              <div className="text-[11px] text-gray-400 truncate">{c.nombre} · {c.email}</div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Archivo (PDF) *</Label>
            <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Título (opcional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Contrato de desarrollo 2026" className="text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Firmado por</Label>
              <Input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Nombre" className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha de firma</Label>
              <Input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} className="text-sm" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notas (opcional)</Label>
            <Textarea value={signedNotes} onChange={(e) => setSignedNotes(e.target.value)} rows={2} className="text-sm" />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>Cancelar</Button>
          <Button onClick={handleUpload} disabled={!effectiveContactId || !file || uploading} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white gap-1.5">
            {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo…</> : <><Upload className="w-4 h-4" /> Subir y amarrar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
