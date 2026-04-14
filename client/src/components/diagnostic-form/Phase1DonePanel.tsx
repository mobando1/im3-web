import { CheckCircle2, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getIndustriaLabel } from "@shared/industrias";

interface Phase1DonePanelProps {
  fechaCita: string;
  horaCita: string;
  industria: string;
  onStartPhase2: () => void;
  onSkip: () => void;
}

export default function Phase1DonePanel({
  fechaCita,
  horaCita,
  industria,
  onStartPhase2,
  onSkip,
}: Phase1DonePanelProps) {
  const industriaLabel = getIndustriaLabel(industria);

  const formattedDate = fechaCita
    ? (() => {
        try {
          const d = new Date(fechaCita + "T00:00:00");
          return d.toLocaleDateString("es-CO", {
            weekday: "long",
            day: "numeric",
            month: "long",
          });
        } catch {
          return fechaCita;
        }
      })()
    : "";

  return (
    <div className="space-y-6 text-center">
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl font-medium text-foreground">Cita confirmada</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {formattedDate}
            {horaCita && <> a las {horaCita}</>}
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-6 border border-primary/20 bg-primary/5 rounded-md text-left">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Desbloquea tu mini-diagnóstico
            </p>
            <p className="text-sm text-muted-foreground">
              90 segundos más y te enviamos antes de la llamada{" "}
              <span className="text-foreground font-medium">3 casos aplicables a {industriaLabel}</span> con estimación
              de impacto y herramientas. Es lo que usamos para preparar la sesión.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <Button onClick={onStartPhase2} className="gap-2">
          Desbloquear mini-diagnóstico
          <ArrowRight className="w-4 h-4" />
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Saltar, ir al confirmado
        </button>
      </div>
    </div>
  );
}
