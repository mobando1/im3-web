import { UseFormReturn } from "react-hook-form";
import { Wrench } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const conectadasOptions = ["Sí", "No", "Parcialmente"];

export default function StepTools({ form }: StepProps) {
  const { register, setValue, watch, formState: { errors } } = form;
  const conectadas = watch("conectadas");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Wrench className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Paso 5 de 8</p>
          <h2 className="text-lg font-medium text-foreground">Sistemas y Herramientas</h2>
        </div>
      </div>

      {/* Q14 — Herramientas actuales */}
      <div className="space-y-2">
        <Label htmlFor="herramientas" className="text-sm font-medium">
          ¿Qué herramientas o software utilizan actualmente?
        </Label>
        <p className="text-xs text-muted-foreground">
          Ej: Excel, CRM, ERP, sistema interno, papel, WhatsApp, etc.
        </p>
        <Textarea
          id="herramientas"
          placeholder="Liste las herramientas que usa su equipo día a día..."
          rows={4}
          {...register("herramientas")}
        />
        {errors.herramientas && <p className="text-xs text-destructive">{errors.herramientas.message}</p>}
      </div>

      {/* Q15 — ¿Están conectadas? */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">¿Sus herramientas están conectadas entre sí?</Label>
        <RadioGroup
          value={conectadas}
          onValueChange={(val) => setValue("conectadas", val, { shouldValidate: true })}
          className="grid grid-cols-3 gap-2"
        >
          {conectadasOptions.map((opt) => (
            <label
              key={opt}
              className={`flex items-center justify-center gap-2 p-3 border rounded-sm cursor-pointer transition-colors text-sm ${
                conectadas === opt
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/20 text-muted-foreground"
              }`}
            >
              <RadioGroupItem value={opt} className="sr-only" />
              {opt}
            </label>
          ))}
        </RadioGroup>
        {errors.conectadas && <p className="text-xs text-destructive">{errors.conectadas.message}</p>}

        {(conectadas === "Sí" || conectadas === "Parcialmente") && (
          <div className="space-y-2 pl-4 border-l-2 border-primary/30">
            <Label htmlFor="conectadasDetalle" className="text-sm font-medium text-muted-foreground">
              Cuéntenos más sobre cómo están conectadas
            </Label>
            <Textarea
              id="conectadasDetalle"
              placeholder="Ej: Usamos Zapier para conectar el CRM con email..."
              rows={3}
              {...register("conectadasDetalle")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
