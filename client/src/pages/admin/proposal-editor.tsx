import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Copy, ExternalLink, Send, Sparkles, Save, Eye, FolderKanban, FileSearch, X, Wand2, Check, RotateCcw, Trash2, MessageCircle } from "lucide-react";
import { SectionForm, hasTypedForm } from "@/components/proposal/SectionForm";
import { ProposalChatPanel } from "@/components/proposal/ProposalChatPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";

// Nuevo schema ProposalData (shared/proposal-template/types.ts)
// Nota: "testimonials" removida por ahora — revivir cuando tengamos casos reales autorizados
const SECTION_LABELS_NEW: Record<string, string> = {
  meta: "Metadatos",
  hero: "Hero (Portada)",
  summary: "Resumen Ejecutivo",
  problem: "El Problema",
  solution: "Nuestra Solución",
  tech: "Cómo Funciona",
  timeline: "Cronograma",
  roi: "Retorno de Inversión",
  authority: "Sobre IM3 Systems",
  pricing: "Inversión",
  hardware: "Hardware",
  operationalCosts: "Costos Operativos",
  cta: "Próximos Pasos",
};

const SECTION_ORDER_NEW = ["meta", "hero", "summary", "problem", "solution", "tech", "timeline", "roi", "authority", "pricing", "hardware", "operationalCosts", "cta"];

// Secciones que se pueden eliminar de la propuesta (todas las opcionales en proposalDataSchema)
const DELETABLE_SECTIONS_NEW = new Set(["summary", "problem", "tech", "timeline", "roi", "authority", "hardware", "operationalCosts"]);

// Legacy schema (propuestas viejas)
const SECTION_LABELS_LEGACY: Record<string, string> = {
  resumen: "Resumen Ejecutivo",
  problema: "El Problema",
  solucion: "Nuestra Solución",
  alcance: "Alcance y Fases",
  tecnologia: "Stack Técnico",
  inversion: "Inversión",
  roi: "ROI Estimado",
  equipo: "Sobre IM3 Systems",
  siguientes_pasos: "Próximos Pasos",
};

const SECTION_ORDER_LEGACY = ["resumen", "problema", "solucion", "alcance", "tecnologia", "inversion", "roi", "equipo", "siguientes_pasos"];

// Fases del progreso de generación (timing aproximado basado en mediciones reales)
const GENERATION_PHASES = [
  { from: 0, to: 3, emoji: "📊", text: "Analizando todo el contexto del cliente — diagnóstico, emails, documentos, reuniones…" },
  { from: 3, to: 8, emoji: "✍️", text: "Escribiendo hero y resumen ejecutivo con tono IM3…" },
  { from: 8, to: 14, emoji: "🎯", text: "Construyendo problema, solución y módulos personalizados…" },
  { from: 14, to: 19, emoji: "💰", text: "Calculando ROI, pricing y costos operativos…" },
  { from: 19, to: 24, emoji: "🛡️", text: "Quality Gate: validando matemática y coherencia…" },
  { from: 24, to: 999, emoji: "✨", text: "Finalizando propuesta…" },
];

function GenerationProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 300);
    return () => clearInterval(interval);
  }, []);

  const phase = GENERATION_PHASES.find(p => elapsed >= p.from && elapsed < p.to) || GENERATION_PHASES[GENERATION_PHASES.length - 1];
  const progressPercent = Math.min(95, (elapsed / 24) * 100);

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{phase.emoji}</span>
            <span className="text-sm font-semibold text-purple-900">{phase.text}</span>
          </div>
          <div className="text-[11px] text-purple-600 mt-0.5 font-mono">{elapsed}s transcurridos</div>
        </div>
      </div>
      <div className="w-full h-1.5 bg-purple-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <p className="text-[11px] text-purple-700/70 text-center">
        Claude Sonnet 4 + 2 quality gates con Haiku. No cierres esta ventana — te aviso cuando esté listo.
      </p>
    </div>
  );
}

/** Render amigable de cualquier sub-estructura (string, number, array, object). Recursivo. */
function FriendlyView({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) {
    return <span className="text-gray-400 italic text-sm">(vacío)</span>;
  }
  if (typeof data === "string") {
    return <span className="text-gray-800 text-sm whitespace-pre-wrap">{data || <em className="text-gray-400">(sin texto)</em>}</span>;
  }
  if (typeof data === "number" || typeof data === "boolean") {
    return <span className="font-mono text-sm text-emerald-700">{String(data)}</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-gray-400 italic text-sm">(lista vacía)</span>;
    const allSimple = data.every((it) => typeof it === "string" || typeof it === "number");
    if (allSimple) {
      return (
        <ul className="list-disc pl-5 space-y-1">
          {data.map((it, idx) => (
            <li key={idx} className="text-gray-800 text-sm">{String(it)}</li>
          ))}
        </ul>
      );
    }
    return (
      <div className="space-y-3">
        {data.map((item, idx) => (
          <div key={idx} className="border-l-2 border-gray-200 pl-3">
            <div className="text-xs font-medium text-gray-400 mb-1">#{idx + 1}</div>
            <FriendlyView data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    return (
      <div className={`space-y-2.5 ${depth > 0 ? "" : ""}`}>
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[140px_1fr] gap-3 items-start">
            <div className="text-xs font-mono uppercase tracking-wide text-gray-500 pt-0.5">{key}</div>
            <div className="min-w-0">
              <FriendlyView data={value} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-gray-500 text-sm">{String(data)}</span>;
}

/** Compara recursivamente dos valores y devuelve los paths que cambiaron. */
function diffPaths(a: unknown, b: unknown, path = ""): string[] {
  if (a === b) return [];
  if (typeof a !== typeof b) return [path || "(raíz)"];
  if (a === null || b === null) return [path || "(raíz)"];
  if (typeof a !== "object") {
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [path || "(raíz)"];
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [path || "(raíz)"];
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  const changed: string[] = [];
  for (const key of keys) {
    const subPath = path ? `${path}.${key}` : key;
    const childChanges = diffPaths(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      subPath
    );
    changed.push(...childChanges);
  }
  return changed;
}

/** Render visual de qué campos cambiaron — resaltado con highlight amarillo. */
function HighlightedFriendlyView({ data, changedFields, currentPath = "" }: { data: unknown; changedFields: string[]; currentPath?: string }) {
  if (data === null || data === undefined) {
    return <span className="text-gray-400 italic text-sm">(vacío)</span>;
  }
  if (typeof data === "string") {
    const isChanged = changedFields.some(f => f === currentPath || f.startsWith(currentPath + "."));
    return (
      <span className={`text-sm whitespace-pre-wrap ${isChanged ? "bg-yellow-100 px-1 rounded" : "text-gray-800"}`}>
        {data || <em className="text-gray-400">(sin texto)</em>}
      </span>
    );
  }
  if (typeof data === "number" || typeof data === "boolean") {
    const isChanged = changedFields.some(f => f === currentPath);
    return <span className={`font-mono text-sm ${isChanged ? "bg-yellow-100 px-1 rounded text-emerald-800" : "text-emerald-700"}`}>{String(data)}</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-gray-400 italic text-sm">(lista vacía)</span>;
    const allSimple = data.every((it) => typeof it === "string" || typeof it === "number");
    if (allSimple) {
      return (
        <ul className="list-disc pl-5 space-y-1">
          {data.map((it, idx) => {
            const subPath = `${currentPath}[${idx}]`;
            const isChanged = changedFields.some(f => f === subPath || f === currentPath);
            return <li key={idx} className={`text-sm ${isChanged ? "bg-yellow-100 px-1 rounded" : "text-gray-800"}`}>{String(it)}</li>;
          })}
        </ul>
      );
    }
    return (
      <div className="space-y-3">
        {data.map((item, idx) => (
          <div key={idx} className="border-l-2 border-gray-200 pl-3">
            <div className="text-xs font-medium text-gray-400 mb-1">#{idx + 1}</div>
            <HighlightedFriendlyView data={item} changedFields={changedFields} currentPath={`${currentPath}[${idx}]`} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    return (
      <div className="space-y-2.5">
        {entries.map(([key, value]) => {
          const subPath = currentPath ? `${currentPath}.${key}` : key;
          const isFieldChanged = changedFields.some(f => f === subPath);
          return (
            <div key={key} className="grid grid-cols-[140px_1fr] gap-3 items-start">
              <div className={`text-xs font-mono uppercase tracking-wide pt-0.5 ${isFieldChanged ? "text-yellow-700 font-semibold" : "text-gray-500"}`}>
                {key} {isFieldChanged && <span className="ml-1 text-[10px]">●</span>}
              </div>
              <div className="min-w-0">
                <HighlightedFriendlyView data={value} changedFields={changedFields} currentPath={subPath} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return <span className="text-gray-500 text-sm">{String(data)}</span>;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  viewed: "Vista",
  accepted: "Aceptada",
  rejected: "Rechazada",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-amber-100 text-amber-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export default function ProposalEditor() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState("resumen");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);

  useUnsavedChangesWarning(hasUnsavedChanges);

  const guardedNav = (action: () => void) => {
    if (hasUnsavedChanges) {
      setPendingNav(() => action);
    } else {
      action();
    }
  };
  const [editContent, setEditContent] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [showSources, setShowSources] = useState(false);
  // AI modify modal state
  // AI modify modal state — generates 3 options for user to pick
  const [aiModifyOpen, setAiModifyOpen] = useState(false);
  const [aiModifySection, setAiModifySection] = useState<string | null>(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiOptions, setAiOptions] = useState<Array<{ label: string; description: string; section: unknown }> | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const { data: proposal, isLoading } = useQuery<any>({
    queryKey: [`/api/admin/proposals/${id}`],
  });

  const { data: engagement } = useQuery<{
    totalViews: number;
    firstOpenedAt: string | null;
    lastOpenedAt: string | null;
    uniqueDevices: number;
    uniqueIps: number;
    totalTimeSeconds: number;
    sections: Array<{ section: string; views: number; timeSpent: number }>;
  }>({
    queryKey: [`/api/admin/proposals/${id}/engagement`],
    refetchInterval: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${id}`] });

  // Generate with AI
  const generateMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/proposals/${id}/generate`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Propuesta generada — recargando..." });
      setTimeout(() => window.location.reload(), 800);
    },
    onError: () => toast({ title: "Error generando propuesta", variant: "destructive" }),
  });

  // Update proposal
  const updateMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await apiRequest("PATCH", `/api/admin/proposals/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "✓ Guardado" });
      invalidate();
    },
    onError: (err: any) => {
      toast({ title: "Error guardando", description: err?.message || "Revisa la consola", variant: "destructive" });
      console.error("[Save] Error:", err);
    },
  });

  // AI modify: generates 3 options, user picks one
  const aiOptionsMut = useMutation({
    mutationFn: async ({ sectionKey, instruction }: { sectionKey: string; instruction: string }) => {
      const res = await apiRequest("POST", `/api/admin/proposals/${id}/sections/${sectionKey}/options`, { instruction });
      return res.json() as Promise<{ options: Array<{ label: string; description: string; section: unknown }> }>;
    },
    onSuccess: (data) => setAiOptions(data.options || []),
    onError: (err: any) => toast({ title: "Error generando opciones", description: err?.message, variant: "destructive" }),
  });

  const aiApplyMut = useMutation({
    mutationFn: async ({ sectionKey, section }: { sectionKey: string; section: unknown }) => {
      const res = await apiRequest("POST", `/api/admin/proposals/${id}/sections/${sectionKey}/apply`, { section });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✓ Opción aplicada" });
      invalidate();
      setAiModifyOpen(false);
      setAiOptions(null);
      setAiInstruction("");
    },
    onError: (err: any) => toast({ title: "Error aplicando", description: err?.message, variant: "destructive" }),
  });

  const openAiModify = (sectionKey: string) => {
    setAiModifySection(sectionKey);
    setAiInstruction("");
    setAiOptions(null);
    setAiModifyOpen(true);
  };

  const submitAiModify = () => {
    if (!aiModifySection || !aiInstruction.trim()) return;
    setAiOptions(null);
    aiOptionsMut.mutate({ sectionKey: aiModifySection, instruction: aiInstruction.trim() });
  };

  const pickOption = (option: { section: unknown }) => {
    if (!aiModifySection) return;
    aiApplyMut.mutate({ sectionKey: aiModifySection, section: option.section });
  };

  // Send to client
  const sendMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/proposals/${id}/send`);
      return res.json();
    },
    onSuccess: (data) => {
      invalidate();
      toast({ title: "Propuesta enviada al cliente" });
    },
    onError: () => toast({ title: "Error enviando propuesta", variant: "destructive" }),
  });

  // Delete a section (set to null)
  const deleteSectionMut = useMutation({
    mutationFn: async (sectionKey: string) => {
      const newSections = { ...sections, [sectionKey]: null };
      await apiRequest("PATCH", `/api/admin/proposals/${id}`, { sections: newSections });
    },
    onSuccess: () => {
      toast({ title: "✓ Sección eliminada" });
      setEditingSection(null);
      setHasUnsavedChanges(false);
      invalidate();
    },
    onError: () => toast({ title: "Error eliminando sección", variant: "destructive" }),
  });

  // Restore a section (regenerate via AI by clearing it then regenerating)
  const restoreSectionMut = useMutation({
    mutationFn: async (sectionKey: string) => {
      const res = await apiRequest("POST", `/api/admin/proposals/${id}/sections/${sectionKey}/options`, { instruction: "Generar contenido completo y útil para esta sección desde cero, basado en el resto de la propuesta y datos del cliente." });
      return res.json() as Promise<{ options: Array<{ label: string; description: string; section: unknown }> }>;
    },
    onSuccess: (data) => {
      setAiModifySection(prev => prev); // keep
      setAiOptions(data.options || []);
      setAiModifyOpen(true);
    },
    onError: () => toast({ title: "Error generando sección", variant: "destructive" }),
  });

  const handleDeleteSection = (sectionKey: string) => {
    if (window.confirm(`¿Eliminar la sección "${SECTION_LABELS[sectionKey]}"? No se mostrará en la propuesta. Podrás restaurarla luego.`)) {
      deleteSectionMut.mutate(sectionKey);
    }
  };

  const handleRestoreSection = (sectionKey: string) => {
    setAiModifySection(sectionKey);
    setAiInstruction("");
    setAiOptions(null);
    setAiModifyOpen(true);
    restoreSectionMut.mutate(sectionKey);
  };

  // Convert to project
  const convertMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/proposals/${id}/convert-to-project`, { startDate: new Date().toISOString() });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Proyecto creado: ${data.phasesCreated} fases, ${data.tasksCreated} tareas` });
      navigate(`/admin/projects/${data.projectId}`);
    },
    onError: () => toast({ title: "Error creando proyecto", variant: "destructive" }),
  });

  // Auto-generate on first load if sections are empty
  useEffect(() => {
    if (proposal && (!proposal.sections || Object.keys(proposal.sections).length === 0) && !generateMut.isPending) {
      generateMut.mutate();
    }
  }, [proposal?.id]);

  // Pre-compute formato/labels (safe durante loading — fallback a legacy vacío)
  const sectionsForHooks: Record<string, any> = proposal?.sections || {};
  const isNewFormat = Boolean(sectionsForHooks.meta && sectionsForHooks.hero && sectionsForHooks.summary);
  const hasSectionsForHooks = Object.keys(sectionsForHooks).length > 0;
  const sectionOrderForHooks = isNewFormat ? SECTION_ORDER_NEW : SECTION_ORDER_LEGACY;

  // Si activeSection no pertenece al formato actual, saltar a la primera sección válida.
  // DEBE estar antes del early return para respetar las reglas de hooks.
  useEffect(() => {
    if (hasSectionsForHooks && !sectionOrderForHooks.includes(activeSection)) {
      setActiveSection(sectionOrderForHooks[0]);
    }
  }, [isNewFormat, hasSectionsForHooks]);

  if (isLoading || !proposal) {
    return <div className="text-center py-20 text-gray-400">Cargando propuesta...</div>;
  }

  const sections: Record<string, any> = proposal.sections || {};
  const pricing = proposal.pricing;
  const hasSections = hasSectionsForHooks;

  // Labels y orden según formato detectado
  const SECTION_LABELS = isNewFormat ? SECTION_LABELS_NEW : SECTION_LABELS_LEGACY;
  const SECTION_ORDER = sectionOrderForHooks;

  const saveSection = () => {
    if (!editingSection) return;
    let value: unknown = editContent;
    if (isNewFormat) {
      try {
        value = JSON.parse(editContent);
      } catch (err: any) {
        toast({ title: "JSON inválido", description: err?.message || "Revisa la estructura", variant: "destructive" });
        return;
      }
    }
    const updated = { ...sections, [editingSection]: value };
    updateMut.mutate({ sections: updated });
    setEditingSection(null);
  };

  const getSectionDisplayContent = (key: string): string => {
    const val = sections[key];
    if (val === undefined || val === null) return "";
    if (isNewFormat) return JSON.stringify(val, null, 2);
    return typeof val === "string" ? val : JSON.stringify(val, null, 2);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/proposal/${proposal.accessToken}`);
    toast({ title: "Link copiado" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => guardedNav(() => navigate("/admin/proposals"))} className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{proposal.title}</h1>
          {proposal.contact && (
            <p className="text-sm text-gray-500 mt-0.5">{proposal.contact.nombre} — {proposal.contact.empresa}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[proposal.status]}`}>
            {STATUS_LABELS[proposal.status]}
          </span>
          <button onClick={copyLink} className="p-2 rounded-lg text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10" title="Copiar link">
            <Copy className="w-4 h-4" />
          </button>
          <a href={`/proposal/${proposal.accessToken}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-gray-400 hover:text-[#2FA4A9] hover:bg-[#2FA4A9]/10" title="Preview">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Stats */}
      {proposal.viewCount > 0 && (
        <div className="flex gap-4 text-xs text-gray-500">
          <span>Vistas: <strong>{proposal.viewCount}</strong></span>
          {proposal.viewedAt && <span>Primera vista: {new Date(proposal.viewedAt).toLocaleDateString("es-CO")}</span>}
          {proposal.acceptedAt && <span className="text-emerald-600 font-semibold">Aceptada: {new Date(proposal.acceptedAt).toLocaleDateString("es-CO")}</span>}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Si NO hay secciones todavía, generar directo (no es destructivo)
            if (!hasSections) {
              generateMut.mutate();
              return;
            }
            // Re-generar SÍ es destructivo: borra todas las secciones existentes
            setConfirmText("");
            setConfirmRegenOpen(true);
          }}
          disabled={generateMut.isPending}
          className="gap-1.5"
        >
          <Sparkles className="w-4 h-4" />
          {generateMut.isPending ? "Generando..." : hasSections ? "Re-generar con IA" : "Generar con IA"}
        </Button>
        {hasSections && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
            onClick={() => setChatOpen(true)}
          >
            <MessageCircle className="w-4 h-4" /> Asistente IA
          </Button>
        )}
        {hasSections && (
          <a
            href={`/proposal/${proposal.accessToken}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="outline" className="gap-1.5">
              <Eye className="w-4 h-4" /> Ver propuesta web
            </Button>
          </a>
        )}
        {hasSections && proposal.aiSourcesReport && Object.keys(proposal.aiSourcesReport).length > 0 && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowSources(!showSources)}>
            <FileSearch className="w-4 h-4" /> {showSources ? "Ocultar fuentes" : "Ver fuentes AI"}
          </Button>
        )}
        {hasSections && proposal.status === "draft" && (
          <Button
            size="sm"
            onClick={() => {
              setConfirmText("");
              setConfirmSendOpen(true);
            }}
            disabled={sendMut.isPending}
            className="bg-[#2FA4A9] hover:bg-[#238b8f] gap-1.5"
          >
            <Send className="w-4 h-4" />
            {sendMut.isPending ? "Enviando..." : "Enviar al cliente"}
          </Button>
        )}
        {hasSections && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => convertMut.mutate()}
            disabled={convertMut.isPending}
            className="gap-1.5"
          >
            <FolderKanban className="w-4 h-4" />
            {convertMut.isPending ? "Creando proyecto..." : "Crear proyecto"}
          </Button>
        )}
        {hasSections && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              // El server responde con Content-Type: application/octet-stream +
              // Content-Disposition: attachment, así que el browser SIEMPRE descarga.
              const url = `/api/proposal/${proposal.accessToken}/pdf`;
              const name = (proposal.contactEmpresa || proposal.contactName || "IM3").replace(/[^\w-]+/g, "_");
              console.log("[PDF admin] Descargando:", url);

              const a = document.createElement("a");
              a.href = url;
              a.download = `Propuesta-${name}.pdf`;
              a.rel = "noopener";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);

              toast({ title: "Generando PDF…", description: "Tarda ~15s la primera vez. La descarga aparecerá automáticamente." });
            }}
          >
            <Save className="w-4 h-4" /> Descargar PDF
          </Button>
        )}
        {hasSections && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={copyLink}>
            <Copy className="w-4 h-4" /> Copiar link
          </Button>
        )}
      </div>

      {/* Proposal URL display */}
      {hasSections && (
        <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="text-xs text-gray-500 shrink-0">URL de la propuesta:</span>
          <code className="text-xs text-[#2FA4A9] font-mono flex-1 truncate">{window.location.origin}/proposal/{proposal.accessToken}</code>
          <Button size="sm" variant="ghost" className="shrink-0 h-7 px-2" onClick={copyLink}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Engagement tracking */}
      {hasSections && engagement && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
              📊 Engagement del cliente
            </h3>
            {engagement.totalViews > 0 && (
              <span className="text-[10px] text-gray-400">Auto-refresh cada 30s</span>
            )}
          </div>

          {engagement.totalViews === 0 ? (
            <p className="text-sm text-gray-400 italic">El cliente aún no ha abierto la propuesta.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">Primera apertura</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {engagement.firstOpenedAt ? new Date(engagement.firstOpenedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">Última actividad</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {engagement.lastOpenedAt ? new Date(engagement.lastOpenedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">Tiempo total</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {engagement.totalTimeSeconds < 60
                      ? `${engagement.totalTimeSeconds}s`
                      : `${Math.floor(engagement.totalTimeSeconds / 60)}m ${engagement.totalTimeSeconds % 60}s`}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">Dispositivos</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {engagement.uniqueDevices}{engagement.uniqueIps > engagement.uniqueDevices ? ` · ${engagement.uniqueIps} IPs` : ""}
                  </div>
                </div>
              </div>

              {engagement.sections.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Tiempo por sección</div>
                  <div className="flex flex-wrap gap-1.5">
                    {engagement.sections.slice(0, 6).map((s) => (
                      <span
                        key={s.section}
                        className={`text-xs px-2 py-1 rounded-full ${
                          ["inversion", "pricing", "costos-operativos", "operationalCosts"].includes(s.section)
                            ? "bg-red-50 text-red-700 font-semibold"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {s.section} · {s.timeSpent < 60 ? `${s.timeSpent}s` : `${Math.floor(s.timeSpent / 60)}m`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Sources Report Panel */}
      {showSources && proposal.aiSourcesReport && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
              <FileSearch className="w-4 h-4" /> Reporte de Fuentes AI
            </h3>
            <button onClick={() => setShowSources(false)} className="text-amber-400 hover:text-amber-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-amber-600">Este reporte muestra de donde el AI extrajo la informacion para cada seccion. Solo visible para admin.</p>
          <div className="space-y-2">
            {Object.entries(proposal.aiSourcesReport as Record<string, string[]>).map(([section, sources]) => (
              <div key={section} className="bg-white rounded-md p-3 border border-amber-100">
                <p className="text-xs font-medium text-gray-700 mb-1">{SECTION_LABELS[section] || section}</p>
                <ul className="space-y-0.5">
                  {(sources || []).map((source: string, i: number) => (
                    <li key={i} className="text-[11px] text-gray-500 flex items-start gap-1.5">
                      <span className="text-amber-400 mt-0.5 shrink-0">•</span>
                      {source}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {!hasSections && !generateMut.isPending ? (
        <div className="text-center py-16 space-y-3">
          <Sparkles className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="text-gray-500">La propuesta aún no tiene contenido.</p>
          <p className="text-xs text-gray-400">Haz click en "Generar con IA" para crear el contenido automáticamente.</p>
        </div>
      ) : generateMut.isPending ? (
        <div className="py-8">
          <GenerationProgress />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Section nav */}
          <div className="lg:col-span-1">
            <nav className="space-y-1 sticky top-4">
              {SECTION_ORDER.map(key => {
                const isDeleted = isNewFormat && DELETABLE_SECTIONS_NEW.has(key) && sections[key] === null;
                const isEmpty = !sections[key] && !isDeleted;
                return (
                  <button
                    key={key}
                    onClick={() => guardedNav(() => { setActiveSection(key); setEditingSection(null); })}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeSection === key
                        ? "bg-[#2FA4A9]/10 text-[#2FA4A9] font-medium"
                        : isDeleted
                          ? "text-gray-400 line-through hover:bg-gray-50"
                          : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {SECTION_LABELS[key]}
                    {isDeleted && <span className="text-amber-500 ml-1 no-underline" title="Eliminada">⊘</span>}
                    {isEmpty && <span className="text-gray-300 ml-1">—</span>}
                  </button>
                );
              })}
              {pricing && (
                <button
                  onClick={() => guardedNav(() => { setActiveSection("pricing"); setEditingSection(null); })}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeSection === "pricing"
                      ? "bg-[#2FA4A9]/10 text-[#2FA4A9] font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  Inversión
                </button>
              )}
            </nav>
          </div>

          {/* Section content */}
          <div className="lg:col-span-3">
            {/* Legacy pricing view — solo para propuestas viejas que tienen proposal.pricing separado */}
            {activeSection === "pricing" && !isNewFormat && pricing ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <h2 className="text-lg font-bold text-gray-900">Inversión</h2>
                <div className="text-center py-4">
                  <p className="text-4xl font-bold text-gray-900">${pricing?.total?.toLocaleString()} <span className="text-lg text-gray-400">{pricing?.currency}</span></p>
                </div>
                {pricing?.includes && (
                  <div className="bg-[#2FA4A9]/5 rounded-xl p-4">
                    <p className="text-sm font-medium text-gray-900 mb-2">Incluye:</p>
                    <ul className="space-y-1">
                      {pricing.includes.map((item: string, i: number) => (
                        <li key={i} className="text-sm text-gray-600 flex items-center gap-2">
                          <span className="text-emerald-500">✓</span> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">{SECTION_LABELS[activeSection]}</h2>
                  <div className="flex gap-2 items-center">
                    {/* Eliminar SECCIÓN COMPLETA — siempre visible para secciones eliminables */}
                    {isNewFormat && DELETABLE_SECTIONS_NEW.has(activeSection) && sections[activeSection] && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => handleDeleteSection(activeSection)}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Eliminar sección
                      </Button>
                    )}
                    {editingSection === activeSection ? (
                      (isNewFormat && hasTypedForm(activeSection)) ? null : (
                        <>
                          <Button size="sm" onClick={saveSection} className="gap-1.5 bg-[#2FA4A9] hover:bg-[#238b8f]">
                            <Save className="w-3.5 h-3.5" /> Guardar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingSection(null)}>Cancelar</Button>
                        </>
                      )
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
                          onClick={() => openAiModify(activeSection)}
                        >
                          <Wand2 className="w-3.5 h-3.5" /> Modificar con IA
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditingSection(activeSection); setEditContent(getSectionDisplayContent(activeSection)); }}>
                          Editar
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {editingSection === activeSection ? (
                  isNewFormat && hasTypedForm(activeSection) ? (
                    <SectionForm
                      sectionKey={activeSection}
                      data={(sections[activeSection] as Record<string, unknown>) ?? {}}
                      onSave={(updated) => {
                        const newSections = { ...sections, [activeSection]: updated };
                        updateMut.mutate({ sections: newSections });
                        setHasUnsavedChanges(false);
                        setEditingSection(null);
                      }}
                      onSaveImmediate={(updated) => {
                        const newSections = { ...sections, [activeSection]: updated };
                        updateMut.mutate({ sections: newSections });
                      }}
                      onCancel={() => { setHasUnsavedChanges(false); setEditingSection(null); }}
                      onDirtyChange={setHasUnsavedChanges}
                    />
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-500">Editando {isNewFormat ? "JSON" : "HTML"}</p>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveSection} className="gap-1.5 bg-[#2FA4A9] hover:bg-[#238b8f]">
                            <Save className="w-3.5 h-3.5" /> Guardar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingSection(null)}>Cancelar</Button>
                        </div>
                      </div>
                      <Textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        rows={20}
                        className="font-mono text-xs"
                        placeholder={isNewFormat ? "JSON de la sección…" : "HTML de la sección…"}
                      />
                      {isNewFormat && (
                        <p className="text-xs text-amber-600 mt-1">
                          ⓘ Editando JSON. Esta sección no tiene formulario visual todavía — usa JSON o "Modificar con IA".
                        </p>
                      )}
                    </>
                  )
                ) : sections[activeSection] !== undefined && sections[activeSection] !== null ? (
                  isNewFormat ? (
                    <div className="bg-gray-50/50 border border-gray-200 rounded-lg p-5">
                      <FriendlyView data={sections[activeSection]} />
                    </div>
                  ) : (
                    <div
                      className="prose prose-sm max-w-none text-gray-700"
                      dangerouslySetInnerHTML={{ __html: String(sections[activeSection]) }}
                    />
                  )
                ) : isNewFormat && DELETABLE_SECTIONS_NEW.has(activeSection) ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
                    <p className="text-sm text-amber-800 mb-3">Esta sección está eliminada — no se mostrará en la propuesta.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRestoreSection(activeSection)}
                      disabled={restoreSectionMut.isPending}
                      className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> {restoreSectionMut.isPending ? "Generando..." : "Restaurar con IA"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">Esta sección aún no tiene contenido.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Modify Dialog — 3 opciones */}
      <Dialog open={aiModifyOpen} onOpenChange={(open) => {
        if (!open) { setAiModifyOpen(false); setAiOptions(null); setAiInstruction(""); }
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-purple-600" />
              Modificar con IA: {aiModifySection ? SECTION_LABELS[aiModifySection] : ""}
            </DialogTitle>
            <DialogDescription>
              Explica qué quieres cambiar y por qué. Claude genera 3 opciones diferentes para que elijas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Contenido actual colapsable */}
            <details className="bg-gray-50 border border-gray-200 rounded-lg">
              <summary className="px-3 py-2 text-xs text-gray-500 cursor-pointer hover:text-gray-700">Ver contenido actual</summary>
              <div className="px-3 pb-3 max-h-40 overflow-y-auto">
                <FriendlyView data={aiModifySection ? sections[aiModifySection] : null} />
              </div>
            </details>

            {/* Instrucción con contexto */}
            <div>
              <Label htmlFor="ai-instruction" className="text-sm font-medium">
                ¿Qué quieres cambiar y por qué?
              </Label>
              <Textarea
                id="ai-instruction"
                value={aiInstruction}
                onChange={e => setAiInstruction(e.target.value)}
                rows={4}
                disabled={aiOptionsMut.isPending}
                placeholder="Sé específico — dale contexto:&#10;&#10;Ej: 'El cliente mencionó en la reunión que su mayor dolor es perder contratos por lentitud en contratación. Reescribe esta sección enfocándote en eso, no en las horas extras. Usa un tono más directo y agrega que podemos tener candidatos listos en 24h.'&#10;&#10;Mientras más contexto des, mejores las opciones."
                className="mt-1.5 text-sm"
              />
            </div>

            {/* Loading */}
            {aiOptionsMut.isPending && (
              <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <div>
                  <p className="text-sm text-purple-700 font-medium">Generando 3 opciones con Claude…</p>
                  <p className="text-[11px] text-purple-600">Cada una con un enfoque diferente · ~8-12 segundos</p>
                </div>
              </div>
            )}

            {/* 3 Opciones */}
            {aiOptions && aiOptions.length > 0 && !aiOptionsMut.isPending && (
              <div className="space-y-3">
                <Label className="text-xs text-purple-700 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> {aiOptions.length} opciones generadas — elige una:
                </Label>
                {aiOptions.map((option, idx) => (
                  <div key={idx} className="border-2 border-gray-200 hover:border-purple-400 rounded-lg p-4 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-purple-600 bg-purple-100 rounded-full w-6 h-6 flex items-center justify-center">{idx + 1}</span>
                          <h4 className="text-sm font-semibold text-gray-900">{option.label}</h4>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 ml-8">{option.description}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => pickOption(option)}
                        disabled={aiApplyMut.isPending}
                        className="bg-emerald-600 hover:bg-emerald-700 gap-1 shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {aiApplyMut.isPending ? "Aplicando…" : "Usar esta"}
                      </Button>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto ml-8">
                      <FriendlyView data={option.section} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setAiModifyOpen(false)}>Cerrar</Button>
            {!aiOptions && (
              <Button
                onClick={submitAiModify}
                disabled={!aiInstruction.trim() || aiOptionsMut.isPending}
                className="bg-purple-600 hover:bg-purple-700 gap-1.5"
              >
                <Wand2 className="w-4 h-4" />
                {aiOptionsMut.isPending ? "Generando…" : "Generar 3 opciones"}
              </Button>
            )}
            {aiOptions && (
              <Button variant="outline" onClick={() => { setAiOptions(null); }} className="gap-1.5">
                <RotateCcw className="w-4 h-4" /> Nuevas opciones
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingNav !== null} onOpenChange={(open) => { if (!open) setPendingNav(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tienes cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Si continúas, los cambios que hiciste en esta sección se perderán. ¿Quieres descartarlos?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingNav(null)}>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = pendingNav;
                setPendingNav(null);
                setHasUnsavedChanges(false);
                if (action) action();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Descartar cambios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar envío al cliente — acción irreversible visible al cliente */}
      <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[#2FA4A9]">
              <Send className="w-5 h-5" /> Enviar propuesta al cliente
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-gray-600">
                <p>
                  Esta acción <strong>envía un email al cliente</strong> con el link de la propuesta.
                  El cliente la verá inmediatamente. <strong>No es deshacible.</strong>
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-1">
                  <p><strong>Cliente:</strong> {proposal?.contactName} <span className="text-gray-400">— {proposal?.contactEmpresa}</span></p>
                  <p><strong>Email:</strong> {proposal?.contactEmail}</p>
                  <p><strong>Propuesta:</strong> {proposal?.title}</p>
                </div>
                <p className="text-xs text-gray-500">
                  Para confirmar, escribe <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-[11px]">ENVIAR</code> abajo:
                </p>
                <Input
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder="ENVIAR"
                  autoFocus
                  className="font-mono"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText.trim().toUpperCase() !== "ENVIAR"}
              onClick={() => {
                sendMut.mutate();
                setConfirmSendOpen(false);
              }}
              className="bg-[#2FA4A9] hover:bg-[#238b8f] disabled:opacity-50"
            >
              <Send className="w-4 h-4 mr-1.5" /> Enviar al cliente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar re-generar con IA — borra todas las secciones existentes */}
      <AlertDialog open={confirmRegenOpen} onOpenChange={setConfirmRegenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
              <Sparkles className="w-5 h-5" /> Re-generar propuesta con IA
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-gray-600">
                <p>
                  Esta acción <strong>borra TODAS las secciones actuales</strong> y genera una propuesta nueva
                  desde cero con IA. Los cambios manuales y los del chat se perderán.
                </p>
                <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 text-xs">
                  💡 Si solo quieres ajustar partes, mejor usa el botón "Asistente IA" o "Modificar con IA" por sección.
                </p>
                <p className="text-xs text-gray-500">
                  Para confirmar, escribe <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-[11px]">REGENERAR</code> abajo:
                </p>
                <Input
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder="REGENERAR"
                  autoFocus
                  className="font-mono"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText.trim().toUpperCase() !== "REGENERAR"}
              onClick={() => {
                generateMut.mutate();
                setConfirmRegenOpen(false);
              }}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 mr-1.5" /> Re-generar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {hasSections && proposal && (
        <ProposalChatPanel
          proposalId={proposal.id}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
