import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Copy, ExternalLink, Send, Sparkles, Save, Eye, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const SECTION_LABELS: Record<string, string> = {
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

const SECTION_ORDER = ["resumen", "problema", "solucion", "alcance", "tecnologia", "inversion", "roi", "equipo", "siguientes_pasos"];

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

  const { data: proposal, isLoading } = useQuery<any>({
    queryKey: [`/api/admin/proposals/${id}`],
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/admin/proposals/${id}`] });

  // Generate with AI
  const generateMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/proposals/${id}/generate`);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Propuesta generada con IA" });
    },
    onError: () => toast({ title: "Error generando propuesta", variant: "destructive" }),
  });

  // Update proposal
  const updateMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await apiRequest("PATCH", `/api/admin/proposals/${id}`, data);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Propuesta actualizada" });
    },
  });

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

  if (isLoading || !proposal) {
    return <div className="text-center py-20 text-gray-400">Cargando propuesta...</div>;
  }

  const sections = proposal.sections || {};
  const pricing = proposal.pricing;
  const hasSections = Object.keys(sections).length > 0;

  const saveSection = () => {
    if (!editingSection) return;
    const updated = { ...sections, [editingSection]: editContent };
    updateMut.mutate({ sections: updated });
    setEditingSection(null);
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

      {/* Content */}
      {!hasSections && !generateMut.isPending ? (
        <div className="text-center py-16 space-y-3">
          <Sparkles className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="text-gray-500">La propuesta aún no tiene contenido.</p>
          <p className="text-xs text-gray-400">Haz click en "Generar con IA" para crear el contenido automáticamente.</p>
        </div>
      ) : generateMut.isPending ? (
        <div className="text-center py-16 space-y-3">
          <div className="w-10 h-10 border-3 border-[#2FA4A9] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 font-medium">Generando propuesta con IA...</p>
          <p className="text-xs text-gray-400">Esto puede tomar 15-30 segundos</p>
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
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveSection} className="gap-1.5 bg-[#2FA4A9] hover:bg-[#238b8f]">
                        <Save className="w-3.5 h-3.5" /> Guardar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingSection(null)}>Cancelar</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setEditingSection(activeSection); setEditContent(sections[activeSection] || ""); }}>
                      Editar
                    </Button>
                  )}
                </div>

                {editingSection === activeSection ? (
                  <Textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={15}
                    className="font-mono text-sm"
                    placeholder="HTML de la sección..."
                  />
                ) : sections[activeSection] ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-700"
                    dangerouslySetInnerHTML={{ __html: sections[activeSection] }}
                  />
                ) : (
                  <p className="text-gray-400 text-sm">Esta sección aún no tiene contenido.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
