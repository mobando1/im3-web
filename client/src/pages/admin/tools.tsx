import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

type ToolStatus = "active" | "idea";

type Tool = {
  name: string;
  description: string;
  icon: typeof Wrench;
  status: ToolStatus;
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
