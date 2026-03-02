import { UseFormReturn } from "react-hook-form";
import { Target } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const objetivosOptions = [
  "Orden — organizar procesos y datos",
  "Automatización — eliminar tareas manuales repetitivas",
  "Escalabilidad — prepararse para crecer sin colapsar",
  "Integración — conectar herramientas que hoy están separadas",
  "Control financiero — visibilidad sobre ingresos, gastos y rentabilidad",
  "Innovación con IA — explorar cómo la inteligencia artificial puede ayudar",
];

export default function StepContext({ form }: StepProps) {
  const { register, setValue, watch, formState: { errors } } = form;
  const objetivos = watch("objetivos") || [];

  const toggleObjetivo = (option: string) => {
    const current = [...objetivos];
    const idx = current.indexOf(option);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(option);
    }
    setValue("objetivos", current, { shouldValidate: true });
  };

  const toggleAll = () => {
    if (objetivos.length === objetivosOptions.length) {
      setValue("objetivos", [], { shouldValidate: true });
    } else {
      setValue("objetivos", [...objetivosOptions], { shouldValidate: true });
    }
  };

  const allSelected = objetivos.length === objetivosOptions.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Target className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Paso 2 de 8</p>
          <h2 className="text-lg font-medium text-foreground">Contexto de la Auditoría</h2>
        </div>
      </div>

      {/* Q7 — Qué busca con la auditoría */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">¿Qué está buscando con esta auditoría?</Label>
        <p className="text-xs text-muted-foreground">Seleccione todas las que apliquen</p>

        <div className="grid gap-2">
          {objetivosOptions.map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-3 p-3 border rounded-sm cursor-pointer transition-colors text-sm ${
                objetivos.includes(opt)
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/20 text-muted-foreground"
              }`}
            >
              <Checkbox
                checked={objetivos.includes(opt)}
                onCheckedChange={() => toggleObjetivo(opt)}
              />
              {opt}
            </label>
          ))}

          {/* Todo lo anterior */}
          <label
            className={`flex items-center gap-3 p-3 border rounded-sm cursor-pointer transition-colors text-sm font-medium ${
              allSelected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-foreground/20 text-muted-foreground"
            }`}
          >
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
            />
            Todo lo anterior
          </label>
        </div>
        {errors.objetivos && <p className="text-xs text-destructive">{errors.objetivos.message}</p>}
      </div>

      {/* Q8 — Resultado esperado */}
      <div className="space-y-2">
        <Label htmlFor="resultadoEsperado" className="text-sm font-medium">
          ¿Qué resultado le gustaría obtener después de la auditoría?
        </Label>
        <Textarea
          id="resultadoEsperado"
          placeholder="Describa lo que espera lograr con este diagnóstico..."
          rows={4}
          {...register("resultadoEsperado")}
        />
        {errors.resultadoEsperado && <p className="text-xs text-destructive">{errors.resultadoEsperado.message}</p>}
      </div>
    </div>
  );
}
