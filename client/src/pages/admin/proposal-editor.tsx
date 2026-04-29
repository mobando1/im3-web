import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Copy, ExternalLink, Send, Sparkles, Save, Eye, FolderKanban, FileSearch, X, Wand2, Check, RotateCcw } from "lucide-react";
import { SectionForm, hasTypedForm } from "@/components/proposal/SectionForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

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
  const [editContent, setEditContent] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [showSources, setShowSources] = useState(false);
  // AI modify modal state
  const [aiModifyOpen, setAiModifyOpen] = useState(false);
  const [aiModifySection, setAiModifySection] = useState<string | null>(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiNewContent, setAiNewContent] = useState<string | null>(null);
  const [aiNewRaw, setAiNewRaw] = useState<unknown>(null); // objeto crudo (para update optimista del cache)
  const [aiOriginalRaw, setAiOriginalRaw] = useState<unknown>(null); // snapshot de lo original para comparar
  const [aiChangedFields, setAiChangedFields] = useState<string[]>([]); // qué campos cambiaron
  const [aiNoChangeWarning, setAiNoChangeWarning] = useState(false); // Claude no cambió nada

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
      toast({ title: "✓ Guardado — recargando..." });
      setTimeout(() => window.location.reload(), 800);
    },
    onError: (err: any) => {
      toast({ title: "Error guardando", description: err?.message || "Revisa la consola", variant: "destructive" });
      console.error("[Save] Error:", err);
    },
  });

  // Regenerate section with AI instruction (returns structured section for new schema, or string for legacy)
  const aiModifyMut = useMutation({
    mutationFn: async ({ sectionKey, instruction }: { sectionKey: string; instruction: string }) => {
      const res = await apiRequest("POST", `/api/admin/proposals/${id}/sections/${sectionKey}/regenerate`, { instruction });
      return res.json() as Promise<{ section?: unknown; content?: string; sectionKey: string }>;
    },
    onSuccess: (data) => {
      // Detectar qué cambió entre original y nueva versión
      const newValue = data.section !== undefined ? data.section : data.content;

      if (data.section !== undefined) {
        setAiNewContent(JSON.stringify(data.section, null, 2));
        setAiNewRaw(data.section);
      } else if (typeof data.content === "string") {
        setAiNewContent(data.content);
        setAiNewRaw(data.content);
      }

      // Calcular diff
      const changed = diffPaths(aiOriginalRaw, newValue);
      setAiChangedFields(changed);

      // Warn si no cambió nada
      const nothingChanged = changed.length === 0 ||
        JSON.stringify(aiOriginalRaw) === JSON.stringify(newValue);
      setAiNoChangeWarning(nothingChanged);

      if (nothingChanged) {
        console.warn("[AI Modify] Claude devolvió contenido idéntico al original. Instrucción:", aiInstruction);
      }
    },
    onError: (err: any) => {
      toast({ title: "Error regenerando con IA", description: err?.message || "No se pudo regenerar. Revisa la consola del browser (Cmd+Option+J).", variant: "destructive" });
      console.error("[AI Modify] Error:", err);
    },
  });

  const openAiModify = (sectionKey: string) => {
    setAiModifySection(sectionKey);
    setAiInstruction("");
    setAiNewContent(null);
    setAiNewRaw(null);
    setAiOriginalRaw(proposal?.sections?.[sectionKey] ?? null);
    setAiChangedFields([]);
    setAiNoChangeWarning(false);
    setAiModifyOpen(true);
  };

  const submitAiModify = () => {
    if (!aiModifySection || !aiInstruction.trim()) return;
    aiModifyMut.mutate({ sectionKey: aiModifySection, instruction: aiInstruction.trim() });
  };

  const acceptAiResult = async () => {
    if (!aiModifySection || aiNewContent === null) return;

    toast({
      title: "✓ Sección actualizada — recargando...",
      description: "Los cambios se guardaron en el servidor. Recargando para mostrarlos.",
    });

    // La API ya persistió los cambios en DB. Recargar la página es lo más confiable
    // para que el UI refleje el estado real. El cache de TanStack Query tiene issues
    // con actualizaciones optimistas en este flujo.
    setTimeout(() => window.location.reload(), 800);
  };

  const tryAgain = () => {
    setAiNewContent(null);
    setAiNewRaw(null);
    setAiChangedFields([]);
    setAiNoChangeWarning(false);
    // Mantener instrucción para editarla o cambiarla
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
        <button onClick={() => navigate("/admin/proposals")} className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
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
          onClick={() => generateMut.mutate()}
          disabled={generateMut.isPending}
          className="gap-1.5"
        >
          <Sparkles className="w-4 h-4" />
          {generateMut.isPending ? "Generando..." : hasSections ? "Re-generar con IA" : "Generar con IA"}
        </Button>
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
            onClick={() => sendMut.mutate()}
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
          <a href={`/proposal/${proposal.accessToken}?pdf=true`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Save className="w-4 h-4" /> Descargar PDF
            </Button>
          </a>
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
              {SECTION_ORDER.map(key => (
                <button
                  key={key}
                  onClick={() => { setActiveSection(key); setEditingSection(null); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeSection === key
                      ? "bg-[#2FA4A9]/10 text-[#2FA4A9] font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {SECTION_LABELS[key]}
                  {!sections[key] && <span className="text-gray-300 ml-1">—</span>}
                </button>
              ))}
              {pricing && (
                <button
                  onClick={() => { setActiveSection("pricing"); setEditingSection(null); }}
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
            {activeSection === "pricing" ? (
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
                {pricing?.paymentOptions && (
                  <div className="pt-2">
                    <p className="text-xs text-gray-500 font-medium mb-1">Opciones de pago:</p>
                    <div className="flex gap-2">
                      {pricing.paymentOptions.map((po: string, i: number) => (
                        <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{po}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">{SECTION_LABELS[activeSection]}</h2>
                  {editingSection === activeSection ? (
                    (isNewFormat && hasTypedForm(activeSection)) ? null : (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveSection} className="gap-1.5 bg-[#2FA4A9] hover:bg-[#238b8f]">
                          <Save className="w-3.5 h-3.5" /> Guardar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingSection(null)}>Cancelar</Button>
                      </div>
                    )
                  ) : (
                    <div className="flex gap-2">
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
                    </div>
                  )}
                </div>

                {editingSection === activeSection ? (
                  isNewFormat && hasTypedForm(activeSection) ? (
                    <SectionForm
                      sectionKey={activeSection}
                      data={(sections[activeSection] as Record<string, unknown>) ?? {}}
                      onSave={(updated) => {
                        const newSections = { ...sections, [activeSection]: updated };
                        updateMut.mutate({ sections: newSections });
                        setEditingSection(null);
                      }}
                      onCancel={() => setEditingSection(null)}
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
                ) : (
                  <p className="text-gray-400 text-sm">Esta sección aún no tiene contenido.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Modify Dialog */}
      <Dialog open={aiModifyOpen} onOpenChange={(open) => {
        if (!open) {
          setAiModifyOpen(false);
          setAiNewContent(null);
          setAiInstruction("");
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-purple-600" />
              Modificar con IA: {aiModifySection ? SECTION_LABELS[aiModifySection] : ""}
            </DialogTitle>
            <DialogDescription>
              Dile a Claude qué quieres cambiar. Reescribe solo esta sección en ~5 segundos manteniendo coherencia con el resto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Contenido actual (read-only) */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Contenido actual</Label>
              {isNewFormat ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                  <FriendlyView data={aiModifySection ? sections[aiModifySection] : null} />
                </div>
              ) : (
                <div
                  className="prose prose-sm max-w-none text-gray-700 bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto border border-gray-200"
                  dangerouslySetInnerHTML={{ __html: (aiModifySection && sections[aiModifySection]) || "<p class='text-gray-400'>(vacío)</p>" }}
                />
              )}
            </div>

            {/* Instrucción */}
            <div>
              <Label htmlFor="ai-instruction" className="text-sm font-medium">
                ¿Qué quieres cambiar?
              </Label>
              <Textarea
                id="ai-instruction"
                value={aiInstruction}
                onChange={e => setAiInstruction(e.target.value)}
                rows={4}
                disabled={aiModifyMut.isPending || !!aiNewContent}
                placeholder="Ejemplos:&#10;- Hazlo más corto, 3 párrafos máximo&#10;- Tono más informal, cercano&#10;- Agrega que ofrecemos 30% de descuento por pago anual&#10;- Enfócalo más en el retorno de inversión&#10;- Cambia el ejemplo del tráfico por uno de retail"
                className="mt-1.5 text-sm"
              />
            </div>

            {/* Loading state con progreso */}
            {aiModifyMut.isPending && (
              <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <div className="flex-1">
                  <p className="text-sm text-purple-700 font-medium">Reescribiendo con Claude…</p>
                  <p className="text-[11px] text-purple-600">Manteniendo coherencia con las otras secciones · ~3-5s</p>
                </div>
              </div>
            )}

            {/* Nueva versión con diff highlighted */}
            {aiNewContent !== null && !aiModifyMut.isPending && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-purple-700 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Nueva versión
                  </Label>
                  {aiChangedFields.length > 0 && (
                    <span className="text-[10px] text-purple-600 font-mono">
                      {aiChangedFields.length} campo{aiChangedFields.length > 1 ? "s" : ""} cambiado{aiChangedFields.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Warning si Claude no cambió nada */}
                {aiNoChangeWarning && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
                    <p className="text-sm text-amber-800 font-semibold">⚠️ Claude no cambió nada</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      La versión generada es idéntica al original. Prueba con una instrucción más específica
                      (ej: "cambia el precio a $26.000.000 COP" en vez de "bájale el precio").
                    </p>
                  </div>
                )}

                {/* Diff visual de campos cambiados */}
                {aiChangedFields.length > 0 && aiChangedFields.length <= 10 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mb-2">
                    <p className="text-[11px] font-mono text-blue-700 font-medium mb-1">Cambios detectados:</p>
                    <ul className="text-[11px] text-blue-900 space-y-0.5">
                      {aiChangedFields.slice(0, 10).map((path) => (
                        <li key={path} className="font-mono">• {path}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {isNewFormat && aiNewRaw !== null ? (
                  <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                    <HighlightedFriendlyView data={aiNewRaw} changedFields={aiChangedFields} />
                  </div>
                ) : (
                  <div
                    className="prose prose-sm max-w-none text-gray-900 bg-purple-50 border-2 border-purple-200 rounded-lg p-4 max-h-96 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: aiNewContent }}
                  />
                )}

                <details className="mt-2">
                  <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON crudo (debug)</summary>
                  <pre className="text-[10px] bg-gray-50 border border-gray-200 rounded p-2 mt-1 overflow-x-auto max-h-40">{aiNewContent}</pre>
                </details>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            {aiNewContent === null ? (
              <>
                <Button variant="ghost" onClick={() => setAiModifyOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={submitAiModify}
                  disabled={!aiInstruction.trim() || aiModifyMut.isPending}
                  className="bg-purple-600 hover:bg-purple-700 gap-1.5"
                >
                  <Wand2 className="w-4 h-4" />
                  {aiModifyMut.isPending ? "Generando…" : "Generar nueva versión"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={tryAgain} className="gap-1.5">
                  <RotateCcw className="w-4 h-4" /> Intentar otra vez
                </Button>
                <Button onClick={acceptAiResult} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
                  <Check className="w-4 h-4" /> Aceptar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
