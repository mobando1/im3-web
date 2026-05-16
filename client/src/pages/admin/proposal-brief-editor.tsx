import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, BookOpen, Sparkles, Send, Eye, AlertTriangle, Wand2, ExternalLink, Copy, Loader2, MessageCircle, Download } from "lucide-react";
import { ProposalBriefChatPanel } from "@/components/proposal/ProposalBriefChatPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { ProposalBriefData, BriefModule, BriefFAQ, BriefGlossaryTerm } from "@shared/proposal-template/types";

type BriefRow = {
  id: string;
  proposalId: string;
  contactId: string;
  title: string | null;
  status: "not_generated" | "draft" | "ready" | "sent";
  accessToken: string;
  sections: ProposalBriefData | Record<string, unknown> | null;
  outdatedSinceProposalUpdate: string | null;
  generatedAt: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  viewCount?: number;
};

type ProposalRow = {
  id: string;
  title: string;
  contact?: { nombre: string; empresa: string };
  sections: { solution?: { modules?: Array<{ number: number; title: string }> } } | null;
};

const STATUS_LABELS: Record<string, string> = {
  not_generated: "No generado",
  draft: "Borrador",
  ready: "Listo",
  sent: "Enviado",
};

const STATUS_COLORS: Record<string, string> = {
  not_generated: "bg-gray-100 text-gray-700",
  draft: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-700",
  sent: "bg-[#2FA4A9]/10 text-[#2FA4A9]",
};

export default function ProposalBriefEditor() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeModuleKey, setActiveModuleKey] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiOptions, setAiOptions] = useState<Array<{ label: string; description: string; module: BriefModule }> | null>(null);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const { data: proposal } = useQuery<ProposalRow>({ queryKey: [`/api/admin/proposals/${id}`] });

  const { data: brief, isLoading } = useQuery<BriefRow | null>({
    queryKey: [`/api/admin/proposals/${id}/brief`],
  });

  const invalidateBrief = () => queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${id}/brief`] });

  // Generar el brief con IA — primera vez o re-generar completo
  const generateMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/proposals/${id}/brief/generate`);
      return res.json() as Promise<BriefRow>;
    },
    onSuccess: () => {
      toast({ title: "✓ Brief generado" });
      invalidateBrief();
    },
    onError: (err: any) => toast({ title: "Error generando brief", description: err?.message || "Revisa la consola", variant: "destructive" }),
  });

  // Patch del brief (edición manual)
  const patchMut = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/admin/proposals/${id}/brief`, patch);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✓ Guardado" });
      invalidateBrief();
    },
    onError: (err: any) => toast({ title: "Error guardando", description: err?.message, variant: "destructive" }),
  });

  // Generar 3 variantes del módulo activo
  const aiOptionsMut = useMutation({
    mutationFn: async ({ moduleKey, instruction }: { moduleKey: string; instruction: string }) => {
      const res = await apiRequest("POST", `/api/admin/proposals/${id}/brief/modules/${moduleKey}/options`, { instruction });
      return res.json() as Promise<{ options: Array<{ label: string; description: string; module: BriefModule }> }>;
    },
    onSuccess: (data) => setAiOptions(data.options || []),
    onError: (err: any) => toast({ title: "Error generando opciones", description: err?.message, variant: "destructive" }),
  });

  // Aplicar una opción
  const aiApplyMut = useMutation({
    mutationFn: async ({ moduleKey, module }: { moduleKey: string; module: BriefModule }) => {
      const res = await apiRequest("POST", `/api/admin/proposals/${id}/brief/modules/${moduleKey}/apply`, { module });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✓ Variante aplicada" });
      invalidateBrief();
      setAiOpen(false);
      setAiOptions(null);
      setAiInstruction("");
    },
    onError: (err: any) => toast({ title: "Error aplicando variante", description: err?.message, variant: "destructive" }),
  });

  // Enviar al cliente
  const sendMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/proposals/${id}/brief/send`);
      return res.json() as Promise<{ briefUrl: string }>;
    },
    onSuccess: (data) => {
      toast({ title: "Brief enviado al cliente", description: data.briefUrl });
      invalidateBrief();
      setConfirmSendOpen(false);
    },
    onError: (err: any) => toast({ title: "Error enviando brief", description: err?.message, variant: "destructive" }),
  });

  const briefData: Partial<ProposalBriefData> = (brief?.sections as Partial<ProposalBriefData>) || {};
  const modules: BriefModule[] = briefData.modules || [];
  const activeModule = modules.find(m => m.key === activeModuleKey) || modules[0];

  // Auto-seleccionar primer módulo cuando cargue el brief
  useEffect(() => {
    if (modules.length && !activeModuleKey) setActiveModuleKey(modules[0].key);
  }, [modules.length, activeModuleKey]);

  const updateModule = (moduleKey: string, patch: Partial<BriefModule>) => {
    const newModules = modules.map(m => m.key === moduleKey ? { ...m, ...patch } : m);
    const newBriefData: ProposalBriefData = {
      intro: briefData.intro || { context: "", howToRead: "" },
      modules: newModules,
      faqs: briefData.faqs,
      glossary: briefData.glossary,
    };
    patchMut.mutate({ sections: newBriefData });
  };

  const updateIntro = (patch: Partial<{ context: string; howToRead: string }>) => {
    const newBriefData: ProposalBriefData = {
      intro: { ...(briefData.intro || { context: "", howToRead: "" }), ...patch },
      modules: modules,
      faqs: briefData.faqs,
      glossary: briefData.glossary,
    };
    patchMut.mutate({ sections: newBriefData });
  };

  const updateFAQs = (faqs: BriefFAQ[]) => {
    const newBriefData: ProposalBriefData = {
      intro: briefData.intro || { context: "", howToRead: "" },
      modules: modules,
      faqs,
      glossary: briefData.glossary,
    };
    patchMut.mutate({ sections: newBriefData });
  };

  const updateGlossary = (glossary: BriefGlossaryTerm[]) => {
    const newBriefData: ProposalBriefData = {
      intro: briefData.intro || { context: "", howToRead: "" },
      modules: modules,
      faqs: briefData.faqs,
      glossary,
    };
    patchMut.mutate({ sections: newBriefData });
  };

  const copyLink = () => {
    if (!brief?.accessToken) return;
    navigator.clipboard.writeText(`${window.location.origin}/brief/${brief.accessToken}`);
    toast({ title: "Link copiado" });
  };

  if (isLoading) {
    return <div className="text-center py-20 text-gray-400">Cargando brief...</div>;
  }

  // Caso 1: brief no existe todavía
  if (!brief) {
    const proposalReady = proposal?.sections?.solution?.modules && proposal.sections.solution.modules.length > 0;
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <button onClick={() => navigate(`/admin/proposals/${id}`)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Volver a la propuesta
        </button>
        <div className="bg-white border border-gray-200 rounded-xl p-8 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6 text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900">Brief Técnico Detallado</h1>
              <p className="text-sm text-gray-600 mt-1">
                Material de soporte que se envía al cliente <strong>después</strong> de la reunión donde se presentó la propuesta inicial. Profundiza cada módulo: qué problema resuelve, cómo funciona, en qué parte de la reunión surgió, ejemplos concretos y qué pasaría si no se hace.
              </p>
            </div>
          </div>
          {!proposalReady ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
              La propuesta inicial aún no tiene módulos en <code className="font-mono text-xs">solution</code>. Genera primero la propuesta con IA antes de crear el brief.
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                La IA tomará todo el contexto del cliente (diagnóstico, emails, notas, documentos) <strong>+ la propuesta inicial ya aprobada</strong> para generar un módulo expandido por cada módulo de la solución.
              </p>
              <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending} className="bg-[#2FA4A9] hover:bg-[#238b8f] gap-2">
                {generateMut.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando…</> : <><Sparkles className="w-4 h-4" /> Generar Brief con IA</>}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Caso 2: brief existe — editor completo
  const hasSections = modules.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate(`/admin/proposals/${id}`)} className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-amber-700" />
            <h1 className="text-2xl font-bold text-gray-900 truncate">{brief.title || "Brief técnico"}</h1>
          </div>
          {proposal?.contact && (
            <p className="text-sm text-gray-500">{proposal.contact.nombre} — {proposal.contact.empresa}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[brief.status]}`}>
            {STATUS_LABELS[brief.status]}
          </span>
          {brief.status === "sent" && (
            <>
              <button onClick={copyLink} className="p-2 rounded-lg text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10" title="Copiar link público">
                <Copy className="w-4 h-4" />
              </button>
              <a href={`/brief/${brief.accessToken}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10" title="Abrir vista pública">
                <ExternalLink className="w-4 h-4" />
              </a>
            </>
          )}
        </div>
      </div>

      {/* Banner outdated */}
      {brief.outdatedSinceProposalUpdate && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-amber-900">
            <strong>La propuesta inicial cambió desde que se generó este brief</strong> (el {new Date(brief.outdatedSinceProposalUpdate).toLocaleDateString("es-CO")}).
            Considera regenerar o ajustar manualmente para mantener coherencia.
          </div>
          <Button size="sm" variant="outline" onClick={() => generateMut.mutate()} disabled={generateMut.isPending} className="gap-1.5 border-amber-300">
            {generateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Regenerar todo
          </Button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => generateMut.mutate()} disabled={generateMut.isPending} className="gap-1.5">
          {generateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generateMut.isPending ? "Regenerando…" : "Regenerar todo"}
        </Button>
        {hasSections && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
            onClick={() => setChatOpen(true)}
          >
            <MessageCircle className="w-4 h-4" /> Asistente del brief
          </Button>
        )}
        {brief.status === "sent" && (
          <a href={`/brief/${brief.accessToken}`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Eye className="w-4 h-4" /> Ver brief público
            </Button>
          </a>
        )}
        {hasSections && brief.status !== "sent" && (
          <Button size="sm" onClick={() => setConfirmSendOpen(true)} disabled={sendMut.isPending} className="bg-[#2FA4A9] hover:bg-[#238b8f] gap-1.5">
            <Send className="w-4 h-4" /> {sendMut.isPending ? "Enviando…" : "Enviar al cliente"}
          </Button>
        )}
        {hasSections && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              const url = `/api/admin/proposals/${id}/brief/pdf`;
              window.open(url, "_blank");
              toast({ title: "Generando PDF…", description: "Puede tardar unos segundos." });
            }}
          >
            <Download className="w-4 h-4" /> Descargar PDF
          </Button>
        )}
      </div>

      {hasSections && (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* Sidebar de módulos */}
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold px-3 py-2">Introducción</div>
            <button
              onClick={() => setActiveModuleKey("__intro__")}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeModuleKey === "__intro__" ? "bg-amber-50 text-amber-900 border border-amber-200" : "hover:bg-gray-50 text-gray-700"}`}
            >
              Contexto del documento
            </button>

            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold px-3 py-2 mt-3">Módulos</div>
            {modules.map((m, idx) => (
              <button
                key={m.key}
                onClick={() => setActiveModuleKey(m.key)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeModuleKey === m.key ? "bg-amber-50 text-amber-900 border border-amber-200" : "hover:bg-gray-50 text-gray-700"}`}
              >
                <div className="font-medium truncate">{idx + 1}. {m.title}</div>
                <div className="text-[11px] text-gray-500 font-mono truncate">{m.key}</div>
              </button>
            ))}

            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold px-3 py-2 mt-3">Extras</div>
            <button
              onClick={() => setActiveModuleKey("__faqs__")}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeModuleKey === "__faqs__" ? "bg-amber-50 text-amber-900 border border-amber-200" : "hover:bg-gray-50 text-gray-700"}`}
            >
              FAQs ({(briefData.faqs || []).length})
            </button>
            <button
              onClick={() => setActiveModuleKey("__glossary__")}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeModuleKey === "__glossary__" ? "bg-amber-50 text-amber-900 border border-amber-200" : "hover:bg-gray-50 text-gray-700"}`}
            >
              Glosario ({(briefData.glossary || []).length})
            </button>
          </div>

          {/* Editor area */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            {activeModuleKey === "__intro__" && (
              <IntroEditor intro={briefData.intro || { context: "", howToRead: "" }} onSave={updateIntro} saving={patchMut.isPending} />
            )}
            {activeModuleKey === "__faqs__" && (
              <FAQsEditor faqs={briefData.faqs || []} onSave={updateFAQs} saving={patchMut.isPending} />
            )}
            {activeModuleKey === "__glossary__" && (
              <GlossaryEditor glossary={briefData.glossary || []} onSave={updateGlossary} saving={patchMut.isPending} />
            )}
            {activeModule && activeModuleKey !== "__intro__" && activeModuleKey !== "__faqs__" && activeModuleKey !== "__glossary__" && (
              <ModuleEditor
                key={activeModule.key}
                module={activeModule}
                onSave={(patch) => updateModule(activeModule.key, patch)}
                saving={patchMut.isPending}
                onAi={() => {
                  setAiInstruction("");
                  setAiOptions(null);
                  setAiOpen(true);
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* AI variants dialog */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wand2 className="w-5 h-5 text-purple-600" /> Generar variantes con IA</DialogTitle>
            <DialogDescription>
              Escribe qué quieres mejorar/ajustar del módulo "{activeModule?.title}". La IA genera 3 variantes (conservador, vendedor, didáctico) y eliges la que prefieras.
            </DialogDescription>
          </DialogHeader>
          {!aiOptions && (
            <div className="space-y-3">
              <Textarea
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder='Ej: "Profundiza más en cómo se integra con el ERP", "Agrega un ejemplo concreto de la industria del cliente", "Hazlo más corto y directo"...'
                rows={4}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setAiOpen(false)}>Cancelar</Button>
                <Button
                  onClick={() => activeModule && aiOptionsMut.mutate({ moduleKey: activeModule.key, instruction: aiInstruction })}
                  disabled={!aiInstruction.trim() || aiOptionsMut.isPending}
                  className="bg-[#2FA4A9] hover:bg-[#238b8f] gap-1.5"
                >
                  {aiOptionsMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {aiOptionsMut.isPending ? "Generando 3 variantes…" : "Generar variantes"}
                </Button>
              </DialogFooter>
            </div>
          )}
          {aiOptions && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {aiOptions.map((opt, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:border-[#2FA4A9] transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-xs text-gray-500">{opt.description}</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => activeModule && aiApplyMut.mutate({ moduleKey: activeModule.key, module: opt.module })}
                      disabled={aiApplyMut.isPending}
                      className="bg-[#2FA4A9] hover:bg-[#238b8f]"
                    >
                      Aplicar
                    </Button>
                  </div>
                  <div className="space-y-2 text-xs text-gray-700">
                    <div><strong>Problema:</strong> {opt.module.problemSolved}</div>
                    <div><strong>Cómo funciona:</strong> {opt.module.howItWorks}</div>
                    <div><strong>Sin esto:</strong> {opt.module.withoutThis}</div>
                  </div>
                </div>
              ))}
              <DialogFooter>
                <Button variant="outline" onClick={() => { setAiOptions(null); setAiInstruction(""); }}>Volver</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm send */}
      <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar brief al cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se enviará por email al cliente <strong>{proposal?.contact?.nombre}</strong> con el link público al brief detallado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => sendMut.mutate()} disabled={sendMut.isPending} className="bg-[#2FA4A9] hover:bg-[#238b8f]">
              {sendMut.isPending ? "Enviando…" : "Enviar brief"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Chat panel */}
      <ProposalBriefChatPanel proposalId={id!} open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}

// ─── Sub-componentes de edición ───

function ModuleEditor({ module: m, onSave, saving, onAi }: {
  module: BriefModule;
  onSave: (patch: Partial<BriefModule>) => void;
  saving: boolean;
  onAi: () => void;
}) {
  const [draft, setDraft] = useState<BriefModule>(m);
  useEffect(() => { setDraft(m); }, [m.key, m]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(m);

  const examplesText = (draft.examples || []).join("\n");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{m.title}</h2>
          <p className="text-xs text-gray-500 font-mono">{m.key}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onAi} className="gap-1.5 border-purple-200 text-purple-700">
            <Wand2 className="w-3.5 h-3.5" /> Variantes IA
          </Button>
          <Button size="sm" onClick={() => onSave(draft)} disabled={!dirty || saving} className="bg-[#2FA4A9] hover:bg-[#238b8f]">
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>

      <Field label="Título" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
      <FieldArea label="Qué problema resuelve" value={draft.problemSolved} onChange={(v) => setDraft({ ...draft, problemSolved: v })} rows={4} />
      <FieldArea label="Cómo funciona" value={draft.howItWorks} onChange={(v) => setDraft({ ...draft, howItWorks: v })} rows={5} />
      <FieldArea label="Contexto de la reunión" value={draft.meetingContext} onChange={(v) => setDraft({ ...draft, meetingContext: v })} rows={3} />
      <FieldArea label="Por qué esta solución" value={draft.whyThisChoice} onChange={(v) => setDraft({ ...draft, whyThisChoice: v })} rows={4} />
      <FieldArea label="Qué pasa si no se hace" value={draft.withoutThis} onChange={(v) => setDraft({ ...draft, withoutThis: v })} rows={4} />
      <div>
        <Label className="text-sm font-semibold text-gray-700">Ejemplos (uno por línea)</Label>
        <Textarea
          value={examplesText}
          onChange={(e) => setDraft({ ...draft, examples: e.target.value.split("\n").map(l => l.trim()).filter(Boolean) })}
          rows={4}
          className="mt-1 font-mono text-sm"
        />
      </div>
      <FieldArea label="Detalles técnicos (opcional)" value={draft.technicalDetails || ""} onChange={(v) => setDraft({ ...draft, technicalDetails: v || undefined })} rows={3} />
    </div>
  );
}

function IntroEditor({ intro, onSave, saving }: { intro: { context: string; howToRead: string }; onSave: (p: Partial<{ context: string; howToRead: string }>) => void; saving: boolean }) {
  const [draft, setDraft] = useState(intro);
  useEffect(() => { setDraft(intro); }, [intro]);
  const dirty = draft.context !== intro.context || draft.howToRead !== intro.howToRead;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Introducción del documento</h2>
          <p className="text-xs text-gray-500">Lo que el cliente lee al abrir el brief</p>
        </div>
        <Button size="sm" onClick={() => onSave(draft)} disabled={!dirty || saving} className="bg-[#2FA4A9] hover:bg-[#238b8f]">
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
      <FieldArea label="Contexto" value={draft.context} onChange={(v) => setDraft({ ...draft, context: v })} rows={5} />
      <FieldArea label="Cómo leer este documento" value={draft.howToRead} onChange={(v) => setDraft({ ...draft, howToRead: v })} rows={4} />
    </div>
  );
}

function FAQsEditor({ faqs, onSave, saving }: { faqs: BriefFAQ[]; onSave: (faqs: BriefFAQ[]) => void; saving: boolean }) {
  const [draft, setDraft] = useState<BriefFAQ[]>(faqs);
  useEffect(() => { setDraft(faqs); }, [faqs]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(faqs);

  const addFAQ = () => setDraft([...draft, { question: "", answer: "" }]);
  const updateFAQ = (i: number, patch: Partial<BriefFAQ>) => setDraft(draft.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  const removeFAQ = (i: number) => setDraft(draft.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">FAQs</h2>
          <p className="text-xs text-gray-500">Preguntas frecuentes del cliente</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addFAQ}>+ Añadir</Button>
          <Button size="sm" onClick={() => onSave(draft)} disabled={!dirty || saving} className="bg-[#2FA4A9] hover:bg-[#238b8f]">
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
      <div className="space-y-4">
        {draft.map((f, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-start gap-2">
              <Input value={f.question} onChange={(e) => updateFAQ(i, { question: e.target.value })} placeholder="Pregunta" className="font-medium" />
              <Button size="sm" variant="ghost" onClick={() => removeFAQ(i)} className="text-red-500 hover:text-red-700">×</Button>
            </div>
            <Textarea value={f.answer} onChange={(e) => updateFAQ(i, { answer: e.target.value })} placeholder="Respuesta" rows={3} />
          </div>
        ))}
        {!draft.length && <p className="text-sm text-gray-500 italic">No hay FAQs. Añade una pregunta arriba.</p>}
      </div>
    </div>
  );
}

function GlossaryEditor({ glossary, onSave, saving }: { glossary: BriefGlossaryTerm[]; onSave: (g: BriefGlossaryTerm[]) => void; saving: boolean }) {
  const [draft, setDraft] = useState<BriefGlossaryTerm[]>(glossary);
  useEffect(() => { setDraft(glossary); }, [glossary]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(glossary);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Glosario</h2>
          <p className="text-xs text-gray-500">Términos técnicos definidos para el cliente</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDraft([...draft, { term: "", definition: "" }])}>+ Añadir</Button>
          <Button size="sm" onClick={() => onSave(draft)} disabled={!dirty || saving} className="bg-[#2FA4A9] hover:bg-[#238b8f]">
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {draft.map((g, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-3 items-start">
            <Input value={g.term} onChange={(e) => setDraft(draft.map((d, idx) => idx === i ? { ...d, term: e.target.value } : d))} placeholder="Término" />
            <Textarea value={g.definition} onChange={(e) => setDraft(draft.map((d, idx) => idx === i ? { ...d, definition: e.target.value } : d))} placeholder="Definición" rows={2} />
            <Button size="sm" variant="ghost" onClick={() => setDraft(draft.filter((_, idx) => idx !== i))} className="text-red-500">×</Button>
          </div>
        ))}
        {!draft.length && <p className="text-sm text-gray-500 italic">No hay términos. Añade uno arriba.</p>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-sm font-semibold text-gray-700">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
    </div>
  );
}

function FieldArea({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <Label className="text-sm font-semibold text-gray-700">{label}</Label>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="mt-1" />
    </div>
  );
}
