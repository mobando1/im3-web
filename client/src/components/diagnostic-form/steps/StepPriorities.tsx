import { UseFormReturn } from "react-hook-form";
import { TrendingUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const areaOptions = [
  "Ventas y adquisición de clientes",
  "Operaciones y procesos internos",
  "Finanzas y facturación",
  "Atención al cliente y postventa",
  "Marketing y comunicación",
  "Recursos humanos",
];

const presupuestoOptions = [
  "Menos de $1,000 USD/mes",
  "$1,000 – $5,000 USD/mes",
  "$5,000 – $15,000 USD/mes",
  "Más de $15,000 USD/mes",
  "Aún no tenemos presupuesto definido",
  "Depende del ROI que se proyecte",
];

export default function StepPriorities({ form }: StepProps) {
  const { setValue, watch, formState: { errors } } = form;
  const areas = watch("areaPrioridad") || [];
  const presupuesto = watch("presupuesto");

  const toggleArea = (option: string) => {
    const current = [...areas];
    const idx = current.indexOf(option);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(option);
    }
    setValue("areaPrioridad", current, { shouldValidate: true });
  };

  const toggleAll = () => {
    if (areas.length === areaOptions.length) {
      setValue("areaPrioridad", [], { shouldValidate: true });
    } else {
      setValue("areaPrioridad", [...areaOptions], { shouldValidate: true });
    }
  };

  const allSelected = areas.length === areaOptions.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <TrendingUp className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Paso 7 de 8</p>
          <h2 className="text-lg font-medium text-foreground">Prioridades e Inversión</h2>
        </div>
      </div>

      {/* Q20 — Área a mejorar primero */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">¿Qué área desea mejorar primero?</Label>
        <p className="text-xs text-muted-foreground">Seleccione todas las que apliquen</p>

        <div className="grid gap-2">
          {areaOptions.map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-3 p-3 border rounded-sm cursor-pointer transition-colors text-sm ${
                areas.includes(opt)
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/20 text-muted-foreground"
              }`}
            >
              <Checkbox
                checked={areas.includes(opt)}
                onCheckedChange={() => toggleArea(opt)}
              />
              {opt}
            </label>
          ))}

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
            Todas las anteriores
          </label>
        </div>
        {errors.areaPrioridad && <p className="text-xs text-destructive">{errors.areaPrioridad.message}</p>}
      </div>

      {/* Q21 — Presupuesto */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">¿Tiene un presupuesto estimado para invertir en mejoras tecnológicas?</Label>
        <RadioGroup
          value={presupuesto}
          onValueChange={(val) => setValue("presupuesto", val, { shouldValidate: true })}
          className="grid gap-2"
        >
          {presupuestoOptions.map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-3 p-3 border rounded-sm cursor-pointer transition-colors text-sm ${
                presupuesto === opt
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/20 text-muted-foreground"
              }`}
            >
              <RadioGroupItem value={opt} />
              {opt}
            </label>
          ))}
        </RadioGroup>
        {errors.presupuesto && <p className="text-xs text-destructive">{errors.presupuesto.message}</p>}
      </div>
    </div>
  );
}
