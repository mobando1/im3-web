import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

type ProjectData = {
  contact: { nombre: string; empresa: string; email: string } | null;
  deals: Array<{
    id: string;
    title: string;
    stage: string;
    value: number | null;
    expectedCloseDate: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  updates: Array<{
    id: string;
    content: string;
    createdAt: string;
  }>;
};

const STAGES = [
  { key: "qualification", label: "Diagnostico", description: "Analisis de tu operacion" },
  { key: "proposal", label: "Propuesta", description: "Definicion de alcance y costos" },
  { key: "negotiation", label: "Desarrollo", description: "Construccion de la solucion" },
  { key: "closed_won", label: "Entregado", description: "Sistema en produccion" },
];

function StageTimeline({ currentStage }: { currentStage: string }) {
  const currentIndex = STAGES.findIndex(s => s.key === currentStage);

  return (
    <div className="relative">
      {/* Connection line */}
      <div className="absolute left-[15px] top-8 bottom-8 w-[2px] bg-white/[0.06]" />

      <div className="space-y-6">
        {STAGES.map((stage, i) => {
          const isCompleted = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isPending = i > currentIndex;

          return (
            <div key={stage.key} className="flex items-start gap-4 relative">
              {/* Circle */}
              <div className={`w-[32px] h-[32px] rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                isCompleted
                  ? "bg-[#2FA4A9] shadow-[0_0_12px_rgba(47,164,169,0.3)]"
                  : isCurrent
                    ? "bg-[#2FA4A9]/20 border-2 border-[#2FA4A9] shadow-[0_0_12px_rgba(47,164,169,0.2)]"
                    : "bg-white/[0.04] border border-white/[0.08]"
              }`}>
                {isCompleted ? (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isCurrent ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-[#2FA4A9] animate-pulse" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-white/20" />
                )}
              </div>

              {/* Content */}
              <div className={`pt-1 ${isPending ? "opacity-40" : ""}`}>
                <p className={`font-medium text-sm ${
                  isCurrent ? "text-[#2FA4A9]" : isCompleted ? "text-white/80" : "text-white/40"
                }`}>
                  {stage.label}
                  {isCurrent && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider bg-[#2FA4A9]/10 text-[#2FA4A9] px-2 py-0.5 rounded-full">
                      En curso
                    </span>
                  )}
                </p>
                <p className="text-xs text-white/30 mt-0.5">{stage.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PortalProject() {
  const { data, isLoading } = useQuery<ProjectData>({
    queryKey: ["/api/portal/project"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 border-4 border-white/10 border-t-[#2FA4A9] rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-white/40">No se pudo cargar la informacion del proyecto.</p>
      </div>
    );
  }

  const activeDeal = data.deals.find(d => d.stage !== "closed_lost") || data.deals[0];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Tu proyecto</h1>
        {data.contact && (
          <p className="text-white/40 mt-1">{data.contact.empresa}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline - main focus */}
        <div className="lg:col-span-2 space-y-6">
          {activeDeal ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-lg font-medium text-white">{activeDeal.title}</h2>
                  {activeDeal.expectedCloseDate && (
                    <p className="text-xs text-white/30 mt-1">
                      Fecha estimada: {new Date(activeDeal.expectedCloseDate).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  )}
                </div>
              </div>

              <StageTimeline currentStage={activeDeal.stage} />

              {activeDeal.notes && (
                <div className="mt-6 pt-6 border-t border-white/[0.06]">
                  <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Notas</p>
                  <p className="text-sm text-white/60 leading-relaxed">{activeDeal.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
              <p className="text-white/40">Aun no hay un proyecto asignado.</p>
              <p className="text-white/25 text-sm mt-1">Tu equipo de IM3 te notificara cuando haya novedades.</p>
            </div>
          )}

          {/* Other deals if any */}
          {data.deals.length > 1 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-white/50">Otros proyectos</h3>
              {data.deals.filter(d => d.id !== activeDeal?.id).map(deal => (
                <div key={deal.id} className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white/70">{deal.title}</p>
                    <p className="text-xs text-white/30 mt-0.5 capitalize">{deal.stage.replace("_", " ")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Updates sidebar */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-white/50">Actualizaciones recientes</h3>

          {data.updates.length > 0 ? (
            <div className="space-y-3">
              {data.updates.map(update => (
                <div key={update.id} className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-4">
                  <p className="text-sm text-white/60 leading-relaxed">{update.content}</p>
                  <p className="text-[11px] text-white/20 mt-2">
                    {new Date(update.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-6 text-center">
              <p className="text-xs text-white/30">Sin actualizaciones aun</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
