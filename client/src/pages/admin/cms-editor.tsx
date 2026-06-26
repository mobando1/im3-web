import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Save, Rocket, History, Smartphone, Monitor, RotateCcw, Loader2, Upload, Sparkles, Send } from "lucide-react";
import { translations, type Language } from "@shared/landing-defaults";
import { deepMerge } from "@shared/cms-merge";
import { getAtPath } from "@shared/cms-path";
import { scoreSeoWithOg } from "@shared/cms-seo-score";
import { CMS_MANIFEST, type FieldDef } from "@shared/cms-field-manifest";

const LANGS: Language[] = ["es", "en"];

type LangDraft = Record<string, unknown>;
type CmsPage = {
  id: string;
  siteId: string;
  slug: string;
  title: string;
  status: string;
  keyphrase: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  draftContent: Record<string, unknown> | null;
  publishedContent: Record<string, unknown> | null;
  publishedAt: string | null;
};
type CmsSite = { id: string; domain: string; name: string; accessToken: string };
type PageResponse = { page: CmsPage; site: CmsSite };
type Snapshot = { id: string; changeSummary: string | null; createdAt: string };

function collectStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectStrings(x, out));
  return out;
}

export default function AdminCmsEditor({ mode = "admin" }: { mode?: "admin" | "client" }) {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = mode === "admin";
  // Config de endpoints según superficie: admin (por pageId) vs cliente (scoped por sesión).
  const api = isAdmin
    ? {
        key: `/api/admin/cms/pages/${id}`,
        load: `/api/admin/cms/pages/${id}`,
        save: `/api/admin/cms/pages/${id}`,
        publish: `/api/admin/cms/pages/${id}/publish`,
        snapshots: `/api/admin/cms/pages/${id}/snapshots`,
        revert: `/api/admin/cms/pages/${id}/revert`,
        chat: `/api/admin/cms/pages/${id}/chat`,
        media: "/api/admin/cms/media",
      }
    : {
        key: "/api/portal/cms/page",
        load: "/api/portal/cms/page",
        save: "/api/portal/cms/page",
        publish: "/api/portal/cms/page/publish",
        snapshots: "",
        revert: "",
        chat: "",
        media: "/api/portal/cms/media",
      };

  const { data, isLoading } = useQuery<PageResponse>({
    queryKey: [api.key],
    enabled: isAdmin ? !!id : true,
  });

  const [lang, setLang] = useState<Language>("es");
  const [draft, setDraft] = useState<Record<Language, LangDraft>>({ es: {}, en: {} });
  const [seo, setSeo] = useState({ keyphrase: "", metaTitle: "", metaDescription: "", ogImageUrl: "" });
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [iframeKey, setIframeKey] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [reason, setReason] = useState("");
  const loadedRef = useRef(false);

  // Inicializar el borrador una sola vez cuando llegan los datos
  useEffect(() => {
    if (!data || loadedRef.current) return;
    loadedRef.current = true;
    const dc = (data.page.draftContent ?? {}) as Record<string, unknown>;
    setDraft({ es: (dc.es as LangDraft) ?? {}, en: (dc.en as LangDraft) ?? {} });
    setSeo({
      keyphrase: data.page.keyphrase ?? "",
      metaTitle: data.page.metaTitle ?? "",
      metaDescription: data.page.metaDescription ?? "",
      ogImageUrl: data.page.ogImageUrl ?? "",
    });
  }, [data]);

  // Contenido mergeado por idioma (defaults + overrides del borrador)
  const merged = useMemo(
    () => ({
      es: deepMerge(translations.es, draft.es),
      en: deepMerge(translations.en, draft.en),
    }),
    [draft],
  );

  const fieldValue = (path: string): string => {
    const v = getAtPath(merged[lang], path);
    return typeof v === "string" ? v : v == null ? "" : String(v);
  };

  const onFieldChange = (path: string, value: string) => {
    setDraft((prev) => {
      const next: Record<Language, LangDraft> = {
        es: JSON.parse(JSON.stringify(prev.es)),
        en: JSON.parse(JSON.stringify(prev.en)),
      };
      // setAtPath inline (evita import extra en cliente)
      const parts = path.split(".");
      let cur: any = next[lang];
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const nextIsIndex = /^\d+$/.test(parts[i + 1]);
        if (cur[part] == null || typeof cur[part] !== "object") cur[part] = nextIsIndex ? [] : {};
        cur = cur[part];
      }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
    setDirty((prev) => new Set(prev).add(`${lang}|${path}`));
  };

  const uploadImage = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    if (data?.site?.id) fd.append("siteId", data.site.id);
    const res = await fetch(api.media, { method: "POST", body: fd, credentials: "include" });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || "Error subiendo imagen");
    }
    const json = await res.json();
    return json.url as string;
  };

  const renderField = (fullPath: string, f: FieldDef) => {
    const value = fieldValue(fullPath);
    if (f.kind === "image") {
      return (
        <div key={fullPath} className="space-y-1">
          <Label className="text-xs">{f.label}</Label>
          <div className="flex items-center gap-2">
            {value ? <img src={value} alt="" className="w-10 h-10 object-cover rounded border shrink-0" /> : null}
            <Input value={value} onChange={(e) => onFieldChange(fullPath, e.target.value)} placeholder="/assets/... o sube un archivo" />
            <label className="shrink-0">
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const url = await uploadImage(file);
                    onFieldChange(fullPath, url);
                    toast({ title: "Imagen subida" });
                  } catch (err: any) {
                    toast({ title: "No se pudo subir", description: err?.message, variant: "destructive" });
                  } finally {
                    e.target.value = "";
                  }
                }}
              />
              <span className="inline-flex items-center gap-1 px-2 py-2 text-xs border rounded-md cursor-pointer hover:bg-muted whitespace-nowrap">
                <Upload className="w-3 h-3" /> Subir
              </span>
            </label>
          </div>
        </div>
      );
    }
    return (
      <div key={fullPath} className="space-y-1">
        <Label className="text-xs">{f.label}</Label>
        {f.kind === "textarea" ? (
          <Textarea rows={2} value={value} onChange={(e) => onFieldChange(fullPath, e.target.value)} />
        ) : (
          <Input value={value} onChange={(e) => onFieldChange(fullPath, e.target.value)} />
        )}
      </div>
    );
  };

  // SEO score en vivo
  const seoResult = useMemo(() => {
    const h1 = (() => {
      const v = getAtPath(merged[lang], "hero.headline");
      return typeof v === "string" ? v : "";
    })();
    const bodyText = collectStrings(merged[lang]).join(" ");
    return scoreSeoWithOg({
      keyphrase: seo.keyphrase,
      metaTitle: seo.metaTitle,
      metaDescription: seo.metaDescription,
      h1,
      bodyText,
      ogImageUrl: seo.ogImageUrl,
    });
  }, [merged, lang, seo]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const contentEdits = Array.from(dirty).map((k) => {
        const sep = k.indexOf("|");
        const l = k.slice(0, sep) as Language;
        const path = k.slice(sep + 1);
        const v = getAtPath(draft[l], path);
        return { lang: l, path, value: typeof v === "string" ? v : v == null ? "" : String(v) };
      });
      const res = await apiRequest("PATCH", api.save, { contentEdits, seo });
      return res.json();
    },
    onSuccess: (updated: CmsPage) => {
      const dc = (updated.draftContent ?? {}) as Record<string, unknown>;
      setDraft({ es: (dc.es as LangDraft) ?? {}, en: (dc.en as LangDraft) ?? {} });
      setDirty(new Set());
      setIframeKey((k) => k + 1);
      qc.invalidateQueries({ queryKey: [api.key] });
      toast({ title: "Borrador guardado", description: "Los cambios viven en el borrador. Publica para que salgan en vivo." });
    },
    onError: (e: any) => toast({ title: "No se pudo guardar", description: e?.message, variant: "destructive" }),
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", api.publish, { consent: true, reason });
      return res.json();
    },
    onSuccess: () => {
      setPublishOpen(false);
      setConsent(false);
      setReason("");
      setIframeKey((k) => k + 1);
      qc.invalidateQueries({ queryKey: [api.key] });
      if (isAdmin) qc.invalidateQueries({ queryKey: ["/api/admin/cms/sites"] });
      toast({ title: "¡Publicado!", description: "Los cambios ya están en vivo en el sitio." });
    },
    onError: (e: any) => toast({ title: "No se pudo publicar", description: e?.message, variant: "destructive" }),
  });

  const { data: snapshots } = useQuery<Snapshot[]>({
    queryKey: [api.snapshots],
    enabled: isAdmin && !!id && historyOpen,
  });

  const revertMut = useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await apiRequest("POST", api.revert, { snapshotId });
      return res.json();
    },
    onSuccess: (updated: CmsPage) => {
      const dc = (updated.draftContent ?? {}) as Record<string, unknown>;
      setDraft({ es: (dc.es as LangDraft) ?? {}, en: (dc.en as LangDraft) ?? {} });
      setSeo({
        keyphrase: updated.keyphrase ?? "",
        metaTitle: updated.metaTitle ?? "",
        metaDescription: updated.metaDescription ?? "",
        ogImageUrl: updated.ogImageUrl ?? "",
      });
      setDirty(new Set());
      setHistoryOpen(false);
      setIframeKey((k) => k + 1);
      toast({ title: "Versión restaurada al borrador", description: "Revisa y publica para que salga en vivo." });
    },
    onError: (e: any) => toast({ title: "No se pudo revertir", description: e?.message, variant: "destructive" }),
  });

  // ── Asistente IA ──
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");

  const { data: chatHistory } = useQuery<Array<{ id: string; role: string; content: string; toolCalls: { tool: string; summary: string }[] | null }>>({
    queryKey: [api.chat],
    enabled: isAdmin && !!id && chatOpen,
  });

  const chatMut = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", api.chat, { message });
      return res.json();
    },
    onSuccess: (result: { assistantMessage: string; toolCalls: { tool: string; summary: string }[]; page: CmsPage | null }) => {
      setChatInput("");
      qc.invalidateQueries({ queryKey: [api.chat] });
      if (result.page) {
        const dc = (result.page.draftContent ?? {}) as Record<string, unknown>;
        setDraft({ es: (dc.es as LangDraft) ?? {}, en: (dc.en as LangDraft) ?? {} });
        setSeo({
          keyphrase: result.page.keyphrase ?? "",
          metaTitle: result.page.metaTitle ?? "",
          metaDescription: result.page.metaDescription ?? "",
          ogImageUrl: result.page.ogImageUrl ?? "",
        });
        setDirty(new Set());
        if (result.toolCalls?.length) setIframeKey((k) => k + 1);
      }
    },
    onError: (e: any) => toast({ title: "Error en el asistente", description: e?.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // El editor corre en el hub (hub.im3systems.com), pero el landing vive en el
  // dominio público. En el hub, "/" redirige a /admin → el iframe debe apuntar al
  // dominio público. En local/mismo host, usamos ruta relativa.
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const isLocal = /^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(host);
  const sameHost = host === data.site.domain || host === `www.${data.site.domain}`;
  const previewBase = isLocal || sameHost ? "" : `https://${data.site.domain}`;
  const previewUrl = `${previewBase}/?cms_preview=${encodeURIComponent(data.site.accessToken)}`;
  const dirtyCount = dirty.size;

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(isAdmin ? "/admin/cms" : "/portal/projects")} aria-label="Volver">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{data.page.title} · {data.site.name}</h1>
            <span className="text-xs text-muted-foreground">
              {dirtyCount > 0 ? `${dirtyCount} cambio(s) sin guardar` : "Sin cambios pendientes"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setChatOpen(true)}>
                <Sparkles className="w-4 h-4 mr-1" /> Asistente IA
              </Button>
              <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
                <History className="w-4 h-4 mr-1" /> Historial
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Guardar borrador
          </Button>
          <Button size="sm" onClick={() => setPublishOpen(true)}>
            <Rocket className="w-4 h-4 mr-1" /> Publicar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Columna editor */}
        <div className="space-y-4">
          {/* Tabs idioma */}
          <div className="flex gap-1 rounded-lg border p-1 w-fit">
            {LANGS.map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-3 py-1 text-sm rounded-md transition ${lang === l ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {l === "es" ? "Español" : "English"}
              </button>
            ))}
          </div>

          {/* SEO */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                SEO
                <Badge
                  variant={seoResult.score >= 80 ? "default" : seoResult.score >= 50 ? "secondary" : "destructive"}
                >
                  {seoResult.score}/100
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Frase clave</Label>
                <Input value={seo.keyphrase} onChange={(e) => setSeo((s) => ({ ...s, keyphrase: e.target.value }))} placeholder="ej. automatización con IA" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Meta título ({seo.metaTitle.length}/60)</Label>
                <Input value={seo.metaTitle} onChange={(e) => setSeo((s) => ({ ...s, metaTitle: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Meta descripción ({seo.metaDescription.length}/160)</Label>
                <Textarea rows={2} value={seo.metaDescription} onChange={(e) => setSeo((s) => ({ ...s, metaDescription: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Imagen OG (URL)</Label>
                <Input value={seo.ogImageUrl} onChange={(e) => setSeo((s) => ({ ...s, ogImageUrl: e.target.value }))} placeholder="/assets/opengraph.jpg" />
              </div>
              <ul className="space-y-1 pt-1">
                {seoResult.checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-xs">
                    <span
                      className={`mt-1 inline-block w-2 h-2 rounded-full shrink-0 ${c.status === "good" ? "bg-green-500" : c.status === "warn" ? "bg-amber-500" : "bg-red-500"}`}
                    />
                    <span className="text-muted-foreground">{c.label}: {c.detail}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Secciones de contenido */}
          <Accordion type="multiple" defaultValue={[CMS_MANIFEST[0]?.key]} className="space-y-2">
            {CMS_MANIFEST.map((section) => (
              <AccordionItem key={section.key} value={section.key} className="border rounded-lg px-3">
                <AccordionTrigger className="text-sm font-semibold">{section.label}</AccordionTrigger>
                <AccordionContent className="space-y-3 pb-3">
                  {(section.fields ?? []).map((f) => renderField(f.path, f))}
                  {(section.lists ?? []).map((list) => {
                    const arr = getAtPath(translations.es, list.path);
                    const count = Array.isArray(arr) ? arr.length : 0;
                    return (
                      <div key={list.path} className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">{list.label}</p>
                        {Array.from({ length: count }).map((_, i) => (
                          <div key={i} className="rounded-md border p-2 space-y-2">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{list.itemLabel} {i + 1}</p>
                            {list.fields.map((f) => renderField(`${list.path}.${i}.${f.path}`, f))}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* Columna preview */}
        <div className="lg:sticky lg:top-4 h-fit space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Vista previa (borrador)</span>
            <div className="flex gap-1 rounded-lg border p-1">
              <button onClick={() => setDevice("desktop")} className={`p-1.5 rounded ${device === "desktop" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} aria-label="Escritorio">
                <Monitor className="w-4 h-4" />
              </button>
              <button onClick={() => setDevice("mobile")} className={`p-1.5 rounded ${device === "mobile" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} aria-label="Móvil">
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="rounded-lg border overflow-hidden bg-muted/30 flex justify-center">
            <iframe
              key={iframeKey}
              src={previewUrl}
              title="Vista previa"
              className="bg-white"
              style={{ width: device === "mobile" ? 390 : "100%", height: "75vh", border: "none" }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            La vista previa muestra el <strong>borrador</strong>. Guarda para refrescarla. El sitio público solo cambia al publicar.
          </p>
        </div>
      </div>

      {/* Dialog publicar */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicar cambios</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esto reemplaza el contenido en vivo de <strong>{data.site.domain}</strong> con el borrador actual.
              Se guarda una versión anterior por si necesitas revertir.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Nota (opcional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ej. actualicé el titular y precios" />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
              <span>Confirmo que revisé el borrador y autorizo publicarlo en vivo.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>Cancelar</Button>
            <Button onClick={() => publishMut.mutate()} disabled={!consent || publishMut.isPending}>
              {publishMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Rocket className="w-4 h-4 mr-1" />}
              Publicar ahora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog historial */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Historial de versiones</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {!snapshots || snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay versiones guardadas. Se crea una cada vez que publicas.</p>
            ) : (
              snapshots.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{s.changeSummary || "Publicación"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString("es-CO")}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => revertMut.mutate(s.id)} disabled={revertMut.isPending}>
                    <RotateCcw className="w-4 h-4 mr-1" /> Restaurar
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog asistente IA */}
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Asistente IA</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Pídele cambios en lenguaje natural (ej. "cambia el titular a…", "sube el SEO"). Edita el <strong>borrador</strong>, nunca publica. Guarda tus cambios manuales antes de usarlo.
          </p>
          <div className="space-y-3 max-h-[50vh] overflow-y-auto py-2">
            {!chatHistory || chatHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aún no hay mensajes. Escribe abajo lo que quieres cambiar.</p>
            ) : (
              chatHistory.map((m) => (
                <div key={m.id} className={`text-sm rounded-lg p-2 ${m.role === "user" ? "bg-primary/10 ml-8" : "bg-muted mr-8"}`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.toolCalls && m.toolCalls.length > 0 ? (
                    <p className="text-[11px] text-muted-foreground mt-1">✎ {m.toolCalls.map((t) => t.summary).join(", ")}</p>
                  ) : null}
                </div>
              ))
            )}
            {chatMut.isPending ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Pensando…</div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="ej. cambia el titular a 'Sistemas con IA que sí funcionan'"
              onKeyDown={(e) => {
                if (e.key === "Enter" && chatInput.trim() && !chatMut.isPending) chatMut.mutate(chatInput.trim());
              }}
            />
            <Button size="icon" onClick={() => chatInput.trim() && chatMut.mutate(chatInput.trim())} disabled={!chatInput.trim() || chatMut.isPending}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
