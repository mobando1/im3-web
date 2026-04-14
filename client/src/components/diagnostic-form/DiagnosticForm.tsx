import { useState, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import {
  phase1Steps,
  phase2Steps,
  phase1Meta,
  phase2Meta,
  type DiagnosticFormData,
} from "./schema";
import StepBooking from "./steps/StepBooking";
import StepGeneral from "./steps/StepGeneral";
import StepPriorities from "./steps/StepPriorities";
import StepOperation from "./steps/StepOperation";
import StepStack from "./steps/StepStack";
import Phase1DonePanel from "./Phase1DonePanel";

type Phase = "phase1" | "phase1_done" | "phase2";

const ease = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];

interface DiagnosticFormProps {
  onStepChange?: (step: number) => void;
}

export default function DiagnosticForm({ onStepChange }: DiagnosticFormProps) {
  const [phase, setPhase] = useState<Phase>("phase1");
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [diagnosticId, setDiagnosticId] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { language } = useI18n();
  const formStartTime = useRef(Date.now());

  const stepValidators = phase === "phase2" ? phase2Steps : phase1Steps;
  const totalSteps = stepValidators.length;

  useEffect(() => {
    onStepChange?.(currentStep);
  }, [currentStep, onStepChange]);

  const form = useForm<DiagnosticFormData>({
    defaultValues: {
      fechaCita: "",
      horaCita: "",
      email: "",
      participante: "",
      empresa: "",
      telefono: "",
      industria: undefined,
      industriaOtro: "",
      empleados: "",
      areaPrioridad: [],
      presupuesto: "",
      objetivos: [],
      productos: "",
      volumenMensual: "",
      canalesAdquisicion: [],
      herramientas: [],
      herramientasOtras: "",
      conectadas: "",
      madurezTech: "",
      usaIA: "",
    },
  });

  const validateCurrentStep = useCallback(async () => {
    const schema = stepValidators[currentStep];
    if (!schema) return true;

    const values = form.getValues();
    const result = schema.safeParse(values);

    if (!result.success) {
      result.error.issues.forEach((issue) => {
        if (issue.path.length > 0) {
          form.setError(issue.path.join(".") as keyof DiagnosticFormData, {
            type: "manual",
            message: issue.message,
          });
        }
      });
      return false;
    }
    return true;
  }, [currentStep, form, stepValidators]);

  const handleNext = useCallback(async () => {
    const isValid = await validateCurrentStep();
    if (!isValid) return;
    form.clearErrors();
    setDirection(1);
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [validateCurrentStep, form, totalSteps]);

  const handlePrev = useCallback(() => {
    form.clearErrors();
    setDirection(-1);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [form]);

  const handlePhase1Submit = useCallback(async () => {
    const isValid = await validateCurrentStep();
    if (!isValid) return;

    setIsSubmitting(true);
    try {
      const data = form.getValues();
      const formDurationMinutes = Math.round((Date.now() - formStartTime.current) / 60000);
      const payload = {
        fechaCita: data.fechaCita,
        horaCita: data.horaCita,
        email: data.email,
        participante: data.participante,
        empresa: data.empresa,
        telefono: data.telefono,
        industria: data.industria,
        industriaOtro: data.industriaOtro || undefined,
        empleados: data.empleados,
        areaPrioridad: data.areaPrioridad,
        presupuesto: data.presupuesto,
        formDurationMinutes,
        language,
      };

      const res = await apiRequest("POST", "/api/diagnostic", payload);
      const result = (await res.json()) as { id: string };
      setDiagnosticId(result.id);
      setPhase("phase1_done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast({
        title: "Error al agendar",
        description: "No pudimos confirmar tu cita. Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [form, validateCurrentStep, language, toast]);

  const handleStartPhase2 = useCallback(() => {
    setPhase("phase2");
    setCurrentStep(0);
    setDirection(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleSkipPhase2 = useCallback(() => {
    navigate("/confirmed");
  }, [navigate]);

  const handlePhase2Submit = useCallback(async () => {
    if (!diagnosticId) {
      navigate("/confirmed");
      return;
    }
    setIsSubmitting(true);
    try {
      const data = form.getValues();
      const payload = {
        objetivos: data.objetivos,
        productos: data.productos,
        volumenMensual: data.volumenMensual,
        canalesAdquisicion: data.canalesAdquisicion,
        herramientas: data.herramientas,
        herramientasOtras: data.herramientasOtras,
        conectadas: data.conectadas,
        madurezTech: data.madurezTech,
        usaIA: data.usaIA,
      };
      await apiRequest("PATCH", `/api/diagnostic/${diagnosticId}`, payload);
      navigate("/confirmed");
    } catch {
      toast({
        title: "No pudimos guardar los detalles",
        description: "Tu cita está confirmada. Puedes completar esto después.",
        variant: "destructive",
      });
      navigate("/confirmed");
    } finally {
      setIsSubmitting(false);
    }
  }, [diagnosticId, form, navigate, toast]);

  const renderStep = () => {
    if (phase === "phase2") {
      switch (currentStep) {
        case 0: return <StepOperation form={form} />;
        case 1: return <StepStack form={form} />;
        default: return null;
      }
    }
    switch (currentStep) {
      case 0: return <StepBooking form={form} />;
      case 1: return <StepGeneral form={form} />;
      case 2: return <StepPriorities form={form} />;
      default: return null;
    }
  };

  if (phase === "phase1_done") {
    const values = form.getValues();
    return (
      <div className="max-w-4xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key="phase1_done"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease }}
          >
            <Phase1DonePanel
              fechaCita={values.fechaCita}
              horaCita={values.horaCita}
              industria={values.industria || ""}
              onStartPhase2={handleStartPhase2}
              onSkip={handleSkipPhase2}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  const stepMeta = phase === "phase2" ? phase2Meta : phase1Meta;
  const progress = ((currentStep + 1) / totalSteps) * 100;
  const isLastStep = currentStep === totalSteps - 1;
  const phaseLabel = phase === "phase2" ? "Mini-diagnóstico" : "Agendar diagnóstico";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {phaseLabel}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {currentStep + 1} / {totalSteps}
          </span>
        </div>
        <Progress value={progress} className="h-1" />

        <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
          {stepMeta.map((meta, i) => (
            <span
              key={i}
              className={`text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded-sm whitespace-nowrap ${
                i === currentStep
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : i < currentStep
                  ? "text-muted-foreground"
                  : "text-muted-foreground/40"
              }`}
            >
              {meta.title}
            </span>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={`${phase}-${currentStep}`}
          custom={direction}
          initial={{ opacity: 0, x: direction * 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -30 }}
          transition={{ duration: 0.3, ease }}
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
        <Button
          type="button"
          variant="outline"
          onClick={handlePrev}
          disabled={currentStep === 0}
          className="gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Anterior
        </Button>

        {isLastStep ? (
          <Button
            type="button"
            onClick={phase === "phase2" ? handlePhase2Submit : handlePhase1Submit}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {phase === "phase2" ? "Guardando..." : "Confirmando..."}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {phase === "phase2" ? "Enviar y ver confirmado" : "Confirmar cita"}
              </>
            )}
          </Button>
        ) : (
          <Button type="button" onClick={handleNext} className="gap-2">
            Siguiente
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
