import { useState, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import {
  step0Schema,
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  step6Schema,
  step7Schema,
  stepMeta,
  type DiagnosticFormData,
} from "./schema";
import StepBooking from "./steps/StepBooking";
import StepGeneral from "./steps/StepGeneral";
import StepContext from "./steps/StepContext";
import StepBusiness from "./steps/StepBusiness";
import StepAcquisition from "./steps/StepAcquisition";
import StepTools from "./steps/StepTools";
import StepMaturity from "./steps/StepMaturity";
import StepPriorities from "./steps/StepPriorities";
import StepReview from "./steps/StepReview";

const TOTAL_STEPS = 9;

const stepValidators = [
  step0Schema,
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  step6Schema,
  step7Schema,
  null, // review step has no extra validation
];

const ease = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];

interface DiagnosticFormProps {
  onStepChange?: (step: number) => void;
}

export default function DiagnosticForm({ onStepChange }: DiagnosticFormProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingFromReview, setEditingFromReview] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { language } = useI18n();
  const formStartTime = useRef(Date.now());

  useEffect(() => {
    onStepChange?.(currentStep);
  }, [currentStep, onStepChange]);

  const form = useForm<DiagnosticFormData>({
    defaultValues: {
      fechaCita: "",
      horaCita: "",
      empresa: "",
      industria: "",
      anosOperacion: "",
      empleados: "",
      ciudades: "",
      participante: "",
      email: "",
      telefono: "",
      objetivos: [],
      resultadoEsperado: "",
      productos: "",
      volumenMensual: "",
      clientePrincipal: "",
      clientePrincipalOtro: "",
      canalesAdquisicion: [],
      canalAdquisicionOtro: "",
      canalPrincipal: "",
      herramientas: "",
      conectadas: "",
      conectadasDetalle: "",
      nivelTech: "",
      usaIA: "",
      usaIAParaQue: "",
      comodidadTech: "",
      familiaridad: {
        automatizacion: "",
        crm: "",
        ia: "",
        integracion: "",
        desarrollo: "",
      },
      areaPrioridad: [],
      presupuesto: "",
    },
  });

  const validateCurrentStep = useCallback(async () => {
    const schema = stepValidators[currentStep];
    if (!schema) return true;

    const values = form.getValues();
    const result = schema.safeParse(values);

    if (!result.success) {
      // Trigger validation to show error messages
      const fields = Object.keys(result.error.formErrors.fieldErrors);
      fields.forEach((field) => {
        const errors = (result.error.formErrors.fieldErrors as Record<string, string[] | undefined>)[field];
        if (errors && errors.length > 0) {
          form.setError(field as keyof DiagnosticFormData, {
            type: "manual",
            message: errors[0],
          });
        }
      });

      // Handle refinement errors (shown at form level)
      if (result.error.formErrors.formErrors.length > 0) {
        // Find the path from issues for refinement errors
        result.error.issues.forEach((issue) => {
          if (issue.path.length > 0) {
            form.setError(issue.path.join(".") as keyof DiagnosticFormData, {
              type: "manual",
              message: issue.message,
            });
          }
        });
      }

      return false;
    }
    return true;
  }, [currentStep, form]);

  const goToStep = useCallback((step: number) => {
    if (currentStep === TOTAL_STEPS - 1) {
      setEditingFromReview(true);
    }
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  const handleNext = useCallback(async () => {
    const isValid = await validateCurrentStep();
    if (!isValid) return;

    form.clearErrors();

    if (editingFromReview) {
      setEditingFromReview(false);
      setDirection(1);
      setCurrentStep(TOTAL_STEPS - 1); // back to review
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setDirection(1);
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [validateCurrentStep, form, editingFromReview]);

  const handlePrev = useCallback(() => {
    form.clearErrors();
    setDirection(-1);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [form]);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const data = form.getValues();
      const formDurationMinutes = Math.round((Date.now() - formStartTime.current) / 60000);
      await apiRequest("POST", "/api/diagnostic", { ...data, formDurationMinutes, language });
      navigate("/confirmed");
    } catch {
      toast({
        title: "Error al enviar",
        description: "No se pudo enviar el formulario. Intente nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [form, navigate, toast]);

  const progress = ((currentStep + 1) / TOTAL_STEPS) * 100;
  const isReviewStep = currentStep === TOTAL_STEPS - 1;

  const renderStep = () => {
    switch (currentStep) {
      case 0: return <StepBooking form={form} />;
      case 1: return <StepGeneral form={form} />;
      case 2: return <StepContext form={form} />;
      case 3: return <StepBusiness form={form} />;
      case 4: return <StepAcquisition form={form} />;
      case 5: return <StepTools form={form} />;
      case 6: return <StepMaturity form={form} />;
      case 7: return <StepPriorities form={form} />;
      case 8: return <StepReview form={form} onGoToStep={goToStep} />;
      default: return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Diagnóstico empresarial
          </span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {currentStep + 1} / {TOTAL_STEPS}
          </span>
        </div>
        <Progress value={progress} className="h-1" />

        {/* Step indicators */}
        <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
          {stepMeta.map((meta, i) => (
            <button
              key={i}
              type="button"
              onClick={() => i < currentStep && goToStep(i)}
              disabled={i > currentStep}
              className={`text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded-sm whitespace-nowrap transition-colors ${
                i === currentStep
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : i < currentStep
                  ? "text-muted-foreground hover:text-foreground cursor-pointer"
                  : "text-muted-foreground/40 cursor-not-allowed"
              }`}
            >
              {meta.title}
            </button>
          ))}
        </div>
      </div>

      {/* Step content with animation */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStep}
          custom={direction}
          initial={{ opacity: 0, x: direction * 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -30 }}
          transition={{ duration: 0.3, ease }}
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>

      {/* Navigation buttons */}
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

        {isReviewStep ? (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Enviar diagnóstico
              </>
            )}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleNext}
            className="gap-2"
          >
            {editingFromReview ? "Guardar y volver" : currentStep === TOTAL_STEPS - 2 ? "Revisar respuestas" : "Siguiente"}
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
