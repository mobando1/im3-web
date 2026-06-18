import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { KeyRound, Search, Plus, Eye, EyeOff, Copy, Star, Pencil, Trash2, Link2, FileText, Lightbulb, FileKey, ExternalLink, X } from "lucide-react";

const BRAND = "#2FA4A9";
const REVEAL_TIMEOUT_MS = 20_000;

type SecretField = { label: string; value: string };

type VaultItem = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  url: string | null;
  username: string | null;
  ownerScope: string;
  contactId: string | null;
  projectId: string | null;
  tags: string[] | null;
  favorite: boolean;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
};

type Contact = { id: string; nombre: string; empresa: string; email: string };

const KIND_LABELS: Record<string, string> = {
  credential: "Credencial",
  link: "Enlace",
  note: "Nota",
  idea: "Idea",
  doc: "Documento",
};
const KIND_ICONS: Record<string, typeof KeyRound> = {
  credential: KeyRound,
  link: Link2,
  note: FileText,
  idea: Lightbulb,
  doc: FileKey,
};
const KIND_OPTIONS = ["credential", "link", "note", "idea", "doc"];

type SecretMode = "keep" | "replace" | "clear";

type FormState = {
  id: string | null;
  kind: string;
  title: string;
  description: string;
  url: string;
  username: string;
  ownerScope: string;
  contactId: string;
  tags: string;
  favorite: boolean;
  secretFields: SecretField[];
  secretMode: SecretMode; // solo relevante en edición de items con secreto
};

const emptyForm = (): FormState => ({
  id: null,
  kind: "credential",
  title: "",
  description: "",
  url: "",
  username: "",
  ownerScope: "internal",
  contactId: "",
  tags: "",
  favorite: false,
  secretFields: [{ label: "Contraseña", value: "" }],
  secretMode: "replace",
});

export default function AdminVault() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [contactFilter, setContactFilter] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<VaultItem | null>(null);

  // Secretos revelados en memoria (por item) + timers de auto-ocultado.
  const [revealed, setRevealed] = useState<Record<string, SecretField[]>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const t = timers.current;
    return () => { Object.values(t).forEach(clearTimeout); };
  }, []);

  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (kindFilter) params.set("kind", kindFilter);
  if (scopeFilter) params.set("ownerScope", scopeFilter);
  if (contactFilter) params.set("contactId", contactFilter);
  if (onlyFavorites) params.set("favorite", "true");
  const listUrl = `/api/admin/vault${params.toString() ? `?${params.toString()}` : ""}`;

  const { data: listData, isLoading } = useQuery<{ items: VaultItem[]; total: number }>({
    queryKey: [listUrl],
  });
  const items = listData?.items ?? [];

  const { data: contactsData } = useQuery<{ contacts: Contact[] }>({
    queryKey: ["/api/admin/contacts?limit=100"],
  });
  const contacts = contactsData?.contacts ?? [];
  const contactName = (id: string | null) => {
    if (!id) return null;
    const c = contacts.find((x) => x.id === id);
    return c ? `${c.nombre} · ${c.empresa}` : null;
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [listUrl] });

  const buildPayload = (f: FormState) => {
    const tags = f.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const base: Record<string, unknown> = {
      kind: f.kind,
      title: f.title.trim(),
      description: f.description.trim() || null,
      url: f.url.trim() || null,
      username: f.username.trim() || null,
      ownerScope: f.ownerScope,
      contactId: f.contactId || null,
      tags,
      favorite: f.favorite,
    };
    // Tri-estado del secreto.
    if (f.id === null) {
      // Crear: solo enviar si hay campos con valor.
      const fields = f.secretFields.filter((s) => s.label.trim() && s.value !== "");
      if (fields.length > 0) base.secretFields = fields;
    } else if (f.secretMode === "clear") {
      base.secretFields = [];
    } else if (f.secretMode === "replace") {
      const fields = f.secretFields.filter((s) => s.label.trim() && s.value !== "");
      // Reemplazar con campos vacíos NO borra el secreto (se comporta como "mantener").
      // Para borrar está la opción explícita "Eliminar secreto" (clear).
      if (fields.length > 0) base.secretFields = fields;
    }
    // secretMode "keep" → no se envía secretFields (sin cambios)
    return base;
  };

  const saveMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = buildPayload(f);
      if (f.id === null) {
        return (await apiRequest("POST", "/api/admin/vault", payload)).json();
      }
      return (await apiRequest("PATCH", `/api/admin/vault/${f.id}`, payload)).json();
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: form.id ? "Item actualizado" : "Item creado" });
    },
    onError: (e: Error) => toast({ title: "Error al guardar", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/admin/vault/${id}`)).json(),
    onSuccess: () => { invalidate(); setDeleteTarget(null); toast({ title: "Item eliminado" }); },
    onError: (e: Error) => toast({ title: "Error al eliminar", description: e.message, variant: "destructive" }),
  });

  const revealMutation = useMutation({
    // gcTime: 0 → el plano descifrado no sobrevive en la MutationCache una vez sin observadores.
    gcTime: 0,
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/vault/${id}/reveal`);
      return { id, data: (await res.json()) as { secretFields: SecretField[] } };
    },
    onSuccess: ({ id, data }) => {
      setRevealed((r) => ({ ...r, [id]: data.secretFields }));
      if (timers.current[id]) clearTimeout(timers.current[id]);
      timers.current[id] = setTimeout(() => {
        setRevealed((r) => { const n = { ...r }; delete n[id]; return n; });
        revealMutation.reset(); // purga el plano de la cache de la mutación al auto-ocultar
      }, REVEAL_TIMEOUT_MS);
    },
    onError: (e: Error) => toast({ title: "No se pudo revelar", description: e.message, variant: "destructive" }),
  });

  const hide = (id: string) => {
    if (timers.current[id]) clearTimeout(timers.current[id]);
    setRevealed((r) => { const n = { ...r }; delete n[id]; return n; });
    revealMutation.reset(); // no dejar el secreto en la cache de la mutación tras ocultar
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copiado al portapapeles" });
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  };

  const openCreate = () => { setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (it: VaultItem) => {
    setForm({
      id: it.id,
      kind: it.kind,
      title: it.title,
      description: it.description ?? "",
      url: it.url ?? "",
      username: it.username ?? "",
      ownerScope: it.ownerScope,
      contactId: it.contactId ?? "",
      tags: (it.tags ?? []).join(", "),
      favorite: it.favorite,
      secretFields: [{ label: "Contraseña", value: "" }],
      secretMode: it.hasSecret ? "keep" : "replace",
    });
    setDialogOpen(true);
  };

  const setSecretField = (i: number, patch: Partial<SecretField>) =>
    setForm((f) => ({ ...f, secretFields: f.secretFields.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  const addSecretField = () => setForm((f) => ({ ...f, secretFields: [...f.secretFields, { label: "", value: "" }] }));
  const removeSecretField = (i: number) => setForm((f) => ({ ...f, secretFields: f.secretFields.filter((_, idx) => idx !== i) }));

  const isEditing = form.id !== null;
  const showSecretEditor = !isEditing || form.secretMode === "replace";

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <KeyRound className="w-6 h-6" style={{ color: BRAND }} />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Bóveda</h1>
            <p className="text-xs text-gray-500">Credenciales cifradas, enlaces y notas — en un solo lugar.</p>
          </div>
        </div>
        <Button onClick={openCreate} className="shrink-0" style={{ backgroundColor: BRAND }}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo item
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título, descripción o usuario…" className="pl-9" />
        </div>
        <Select value={kindFilter || "__all__"} onValueChange={(v) => setKindFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los tipos</SelectItem>
            {KIND_OPTIONS.map((k) => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={contactFilter || "__all__"} onValueChange={(v) => setContactFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="sm:w-52"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="__all__">Todos los clientes</SelectItem>
            {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} · {c.empresa}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant={onlyFavorites ? "default" : "outline"}
          onClick={() => setOnlyFavorites((v) => !v)}
          className="shrink-0"
          style={onlyFavorites ? { backgroundColor: BRAND } : undefined}
        >
          <Star className={`w-4 h-4 ${onlyFavorites ? "fill-current" : ""}`} />
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-gray-400 py-12 text-center">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <KeyRound className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No hay items todavía. Crea el primero.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const Icon = KIND_ICONS[it.kind] ?? FileText;
            const cName = contactName(it.contactId);
            const revealedFields = revealed[it.id];
            return (
              <Card key={it.id} className="border-gray-200">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${BRAND}15` }}>
                      <Icon className="w-4 h-4" style={{ color: BRAND }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 truncate">{it.title}</span>
                        {it.favorite && <Star className="w-3.5 h-3.5 fill-current text-amber-400" />}
                        <Badge variant="secondary" className="text-[10px]">{KIND_LABELS[it.kind] ?? it.kind}</Badge>
                        {it.ownerScope === "client" && <Badge variant="outline" className="text-[10px]">Cliente</Badge>}
                      </div>
                      {(it.username || cName) && (
                        <div className="text-xs text-gray-500 mt-0.5 truncate">
                          {it.username && <span className="font-mono">{it.username}</span>}
                          {it.username && cName && <span> · </span>}
                          {cName && <span>{cName}</span>}
                        </div>
                      )}
                      {it.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{it.description}</p>}
                      {it.url && (
                        <a href={it.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: BRAND }}>
                          <ExternalLink className="w-3 h-3" /> Abrir enlace
                        </a>
                      )}
                      {(it.tags ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(it.tags ?? []).map((t) => <Badge key={t} variant="outline" className="text-[10px] font-normal">{t}</Badge>)}
                        </div>
                      )}

                      {/* Secreto revelado */}
                      {revealedFields && (
                        <div className="mt-2 space-y-1.5 rounded-lg bg-gray-50 border border-gray-200 p-2.5">
                          {revealedFields.length === 0 && <p className="text-xs text-gray-400">Sin campos secretos.</p>}
                          {revealedFields.map((s, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-[11px] text-gray-400 w-24 shrink-0 truncate">{s.label}</span>
                              <code className="text-xs font-mono flex-1 truncate text-gray-800">{s.value}</code>
                              <Button size="sm" variant="ghost" className="h-6 px-1.5 shrink-0" onClick={() => copy(s.value)}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                          <p className="text-[10px] text-gray-400 pt-1">Se oculta automáticamente a los 20s.</p>
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {it.hasSecret && (
                        revealedFields ? (
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => hide(it.id)} title="Ocultar">
                            <EyeOff className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => revealMutation.mutate(it.id)} disabled={revealMutation.isPending && revealMutation.variables === it.id} title="Revelar secreto">
                            <Eye className="w-4 h-4" />
                          </Button>
                        )
                      )}
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(it)} title="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(it)} title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar item" : "Nuevo item"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((k) => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Ámbito</Label>
                <Select value={form.ownerScope} onValueChange={(v) => setForm((f) => ({ ...f, ownerScope: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Interno (IM3)</SelectItem>
                    <SelectItem value="client">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Título *</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ej. AWS Console — cuenta principal" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Usuario / identificador</Label>
                <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="usuario, email…" />
              </div>
              <div>
                <Label className="text-xs">URL</Label>
                <Input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://… o link de Drive" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Cliente asociado</Label>
              <Select value={form.contactId || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, contactId: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Sin cliente" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="__none__">— Sin cliente —</SelectItem>
                  {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} · {c.empresa}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Notas (no secretas)</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="Contexto, instrucciones, recordatorios…" />
            </div>

            <div>
              <Label className="text-xs">Etiquetas (separadas por coma)</Label>
              <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="aws, infra, prod" />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.favorite} onCheckedChange={(v) => setForm((f) => ({ ...f, favorite: v }))} />
              <Label className="text-xs">Marcar como favorito</Label>
            </div>

            {/* Sección de secreto */}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold">Campos secretos (cifrados)</Label>
              </div>

              {isEditing && (
                <div className="mb-2">
                  <Select value={form.secretMode} onValueChange={(v) => setForm((f) => ({ ...f, secretMode: v as SecretMode }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">Mantener secreto actual</SelectItem>
                      <SelectItem value="replace">Reemplazar secreto</SelectItem>
                      <SelectItem value="clear">Eliminar secreto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showSecretEditor && (
                <div className="space-y-2">
                  {form.secretFields.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input value={s.label} onChange={(e) => setSecretField(i, { label: e.target.value })} placeholder="Etiqueta" className="w-32 shrink-0" />
                      <Input type="password" value={s.value} onChange={(e) => setSecretField(i, { value: e.target.value })} placeholder="Valor" className="flex-1 font-mono" />
                      <Button size="sm" variant="ghost" className="h-8 px-1.5 shrink-0" onClick={() => removeSecretField(i)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={addSecretField} className="w-full">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Añadir campo
                  </Button>
                  <p className="text-[10px] text-gray-400">Se cifran con AES-256-GCM antes de guardarse. Nunca se devuelven en listados.</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending || !form.title.trim()}
              style={{ backgroundColor: BRAND }}
            >
              {saveMutation.isPending ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Se moverá a la papelera (borrado suave, recuperable). El secreto cifrado se conserva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
