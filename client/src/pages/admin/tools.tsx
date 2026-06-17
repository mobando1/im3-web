import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import {
  Mic,
  ScanSearch,
  MessageSquareText,
  Sparkles,
  Calculator,
  TrendingUp,
  Gauge,
  ScrollText,
  UserSearch,
  Wrench,
  Headphones,
  Download,
  FolderSync,
  Loader2,
  AlertTriangle,
} from "lucide-react";

type ReconcileReport = {
  dryRun: boolean;
  totalContacts: number;
  totalFolders: number;
  duplicates: Array<{ contactId: string; empresa: string | null; email: string; folders: Array<{ id: string; name: string; url: string }> }>;
  orphans: Array<{ id: string; name: string; url: string }>;
  missing: Array<{ contactId: string; empresa: string | null; email: string }>;
  ensured: number;
};

type ToolStatus = "active" | "idea";

type Tool = {
  name: string;
  description: string;
  icon: typeof Wrench;
  status: ToolStatus;
  /** If set, renders a "Descargar para Mac" button (e.g. a GitHub Release .dmg). */
  downloadUrl?: string;
  /** If set, renders a "Ver instrucciones" link (setup / install guide). */
  infoUrl?: string;
};

type ToolGroup = {
  label: string;
  description: string;
  tools: Tool[];
};

const toolGroups: ToolGroup[] = [
  {
    label: "Apps existentes",
    description: "Herramientas propias que ya están corriendo",
    tools: [
      {
        name: "IM3 Meeting Copilot",
        description:
          "Copiloto en vivo para reuniones: transcribe a la contraparte y te sugiere tu respuesta en inglés, en tu tono. Captura streaming + metodología de ventas NEPQ. App de Mac.",
        icon: Headphones,
        status: "active",
        downloadUrl:
          "https://github.com/mobando1/im3-meeting-copilot-releases/releases/latest/download/IM3-Meeting-Copilot.dmg",
        infoUrl: "https://github.com/mobando1/im3-meeting-copilot-releases",
      },
      {
        name: "Acta",
        description: "Grabación + transcripción de reuniones con detección de hablantes.",
        icon: Mic,
        status: "active",
      },
      {
        name: "Audit Generator",
        description: "Generador automatizado de auditorías y reportes para clientes.",
        icon: ScanSearch,
        status: "active",
      },
      {
        name: "WhatsApp Exporter",
        description: "Exporta chats completos, transcribe audios y conserva imágenes en su lugar.",
        icon: MessageSquareText,
        status: "active",
      },
      {
        name: "IM3 Tutor",
        description: "Asistente IA embebible para responder dudas y captar leads.",
        icon: Sparkles,
        status: "active",
      },
    ],
  },
  {
    label: "Pipeline de ideas",
    description: "Herramientas a construir como lead magnets y entregables de valor",
    tools: [
      {
        name: "Calculadora costos WhatsApp Business",
        description: "Estima tarifas Meta + markups de BSP por país, categoría y volumen.",
        icon: Calculator,
        status: "idea",
      },
      {
        name: "Calculadora ROI Automatización",
        description: "Ahorro anual y payback estimado para procesos repetitivos.",
        icon: TrendingUp,
        status: "idea",
      },
      {
        name: "Scorecard Madurez IA",
        description: "Score 0-100 con benchmark por industria y roadmap recomendado.",
        icon: Gauge,
        status: "idea",
      },
      {
        name: "Generador Política IA",
        description: "Política de uso de IA empresarial personalizada en PDF + Doc editable.",
        icon: ScrollText,
        status: "idea",
      },
      {
        name: "Reunión Prep desde LinkedIn",
        description: "Brief automático del prospecto con contexto, pain points y talking points.",
        icon: UserSearch,
        status: "idea",
      },
    ],
  },
];

const statusStyles: Record<ToolStatus, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Activo" },
  idea: { bg: "bg-amber-50", text: "text-amber-700", label: "Idea" },
};

export default function ToolsPage() {
  return (
    <div className="space-y-8 pt-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Herramientas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Apps propias de IM3 — las existentes y las que están en pipeline para construir.
        </p>
      </div>

      <DriveReconcileCard />

      {toolGroups.map((group) => (
        <div key={group.label}>
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              {group.label}
            </h2>
            <span className="text-xs text-gray-400">{group.description}</span>
            <span className="text-xs text-gray-400 ml-auto">{group.tools.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.tools.map((tool) => (
              <ToolCard key={tool.name} tool={tool} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DriveReconcileCard() {
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [loading, setLoading] = useState<"dry" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    if (!dryRun && !confirm("Consolidar elige y taggea UNA carpeta canónica para cada cliente con duplicados (las demás quedan listadas para mergear a mano). NO crea carpetas para clientes sin carpeta, ni borra/mueve archivos. ¿Continuar?")) return;
    setLoading(dryRun ? "dry" : "apply");
    setError(null);
    try {
      const res = await apiRequest("POST", `/api/admin/drive/reconcile?dryRun=${dryRun}`);
      setReport(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <FolderSync className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Reconciliar carpetas de Drive</h3>
            <p className="text-xs text-gray-500 mt-1">
              Detecta duplicados/huérfanas en <span className="font-medium">03.clientes</span> y consolida una sola carpeta por cliente.
              El dry-run solo reporta; consolidar taggea/adopta (no borra ni mueve nada).
            </p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => run(true)} disabled={loading !== null} className="gap-1.5">
                {loading === "dry" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
                Reportar (dry-run)
              </Button>
              <Button size="sm" onClick={() => run(false)} disabled={loading !== null} className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white">
                {loading === "apply" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderSync className="w-3.5 h-3.5" />}
                Consolidar
              </Button>
            </div>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            {report && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-3 text-[11px] text-gray-600 flex-wrap">
                  <span>{report.totalContacts} contactos</span>
                  <span>·</span>
                  <span>{report.totalFolders} carpetas</span>
                  <span>·</span>
                  <span className={report.duplicates.length ? "text-amber-700 font-medium" : ""}>{report.duplicates.length} con duplicados</span>
                  <span>·</span>
                  <span>{report.orphans.length} huérfanas</span>
                  <span>·</span>
                  <span>{report.missing.length} sin carpeta</span>
                  {!report.dryRun && <><span>·</span><span className="text-emerald-700">{report.ensured} consolidadas</span></>}
                </div>
                {report.duplicates.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 max-h-60 overflow-y-auto">
                    <p className="text-[11px] font-semibold text-amber-800 flex items-center gap-1 mb-1.5"><AlertTriangle className="w-3 h-3" /> Clientes con múltiples carpetas (revisar/mergear a mano)</p>
                    <div className="space-y-1.5">
                      {report.duplicates.map(d => (
                        <div key={d.contactId} className="text-[11px]">
                          <span className="font-medium text-gray-800">{d.empresa || d.email}</span>
                          <div className="flex flex-wrap gap-1.5 mt-0.5">
                            {d.folders.map(f => (
                              <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-amber-200 text-amber-700 hover:underline truncate max-w-[160px]">{f.name}</a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  const status = statusStyles[tool.status];
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#2FA4A9]/10 text-[#2FA4A9] flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{tool.name}</h3>
              <Badge
                variant="outline"
                className={`text-[10px] h-5 border-0 ${status.bg} ${status.text}`}
              >
                {status.label}
              </Badge>
            </div>
            <p className="text-xs text-gray-500 mt-1 line-clamp-3">{tool.description}</p>
            {tool.downloadUrl && (
              <div className="flex items-center gap-3 mt-3">
                <a
                  href={tool.downloadUrl}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#2FA4A9] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#268d92] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar para Mac
                </a>
                {tool.infoUrl && (
                  <a
                    href={tool.infoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#2FA4A9] hover:underline"
                  >
                    Ver instrucciones
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
