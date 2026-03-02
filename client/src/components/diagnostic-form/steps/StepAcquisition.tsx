import { UseFormReturn } from "react-hook-form";
import { Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const canalesOptions = [
  "Marketing digital (redes sociales, Google Ads, SEO)",
  "Referidos",
  "Ventas directas",
  "Licitaciones",
  "Marketplace (Amazon, MercadoLibre, etc.)",
  "Distribuidores / partners",
  "Otro",
];

export default function StepAcquisition({ form }: StepProps) {
  const { register, setValue, watch, formState: { errors } } = form;
  const canales = watch("canalesAdquisicion") || [];

  const toggleCanal = (option: string) => {
    const current = [...canales];
    const idx = current.indexOf(option);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(option);
    }
    setValue("canalesAdquisicion", current, { shouldValidate: true });
    if (option === "Otro" && idx >= 0) {
      setValue("canalAdquisicionOtro", "", { shouldValidate: true });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Paso 4 de 8</p>
          <h2 className="text-lg font-medium text-foreground">Adquisición de Clientes</h2>
        </div>
      </div>

      {/* Q12 — Cómo llegan los clientes */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">¿Cómo llegan actualmente sus clientes?</Label>
        <p className="text-xs text-muted-foreground">Seleccione todas las que apliquen</p>

        <div className="grid gap-2">
          {canalesOptions.map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-3 p-3 border rounded-sm cursor-pointer transition-colors text-sm ${
                canales.includes(opt)
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/20 text-muted-foreground"
              }`}
            >
              <Checkbox
                checked={canales.includes(opt)}
                onCheckedChange={() => toggleCanal(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
        {errors.canalesAdquisicion && <p className="text-xs text-destructive">{errors.canalesAdquisicion.message}</p>}

        {canales.includes("Otro") && (
          <div className="space-y-2 pl-4 border-l-2 border-primary/30">
            <Label htmlFor="canalAdquisicionOtro" className="text-sm font-medium text-muted-foreground">
              ¿Cuál?
            </Label>
            <Input
              id="canalAdquisicionOtro"
              placeholder="Especifique..."
              {...register("canalAdquisicionOtro")}
            />
            {errors.canalAdquisicionOtro && <p className="text-xs text-destructive">{errors.canalAdquisicionOtro.message}</p>}
          </div>
        )}
      </div>

      {/* Q13 — Canal principal */}
      <div className="space-y-2">
        <Label htmlFor="canalPrincipal" className="text-sm font-medium">
          ¿Cuál es el principal canal por donde se generan sus ventas?
        </Label>
        <Input
          id="canalPrincipal"
          placeholder="Ej: Referidos, Instagram, ventas directas..."
          {...register("canalPrincipal")}
        />
        {errors.canalPrincipal && <p className="text-xs text-destructive">{errors.canalPrincipal.message}</p>}
      </div>
    </div>
  );
}
