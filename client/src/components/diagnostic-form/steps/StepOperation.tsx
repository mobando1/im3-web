import { UseFormReturn } from "react-hook-form";
import { Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const objetivosOptions = [
  "Orden — organizar procesos y datos",
  "Automatización — eliminar tareas manuales repetitivas",
  "Escalabilidad — prepararse para crecer sin colapsar",
  "Integración — conectar herramientas separadas",
  "Control financiero — visibilidad sobre ingresos y gastos",
  "Innovación con IA — explorar cómo puede ayudar",
];

const canalesOptions = [
  "Marketing digital",
  "Referidos",
  "Ventas directas",
  "Licitaciones",
  "Marketplace",
  "Distribuidores / partners",
];

export default function StepOperation({ form }: StepProps) {
  const { register, setValue, watch, formState: { errors } } = form;
  const objetivos = watch("objetivos") || [];
  const canales = watch("canalesAdquisicion") || [];

  const toggleArray = (field: "objetivos" | "canalesAdquisicion", value: string) => {
    const current = field === "objetivos" ? [...objetivos] : [...canales];
    const idx = current.indexOf(value);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(value);
    setValue(field, current, { shouldValidate: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Briefcase className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Paso 1 de 2 · Opcional</p>
          <h2 className="text-lg font-medium text-foreground">Tu operación</h2>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">¿Qué objetivo principal persigues?</Label>
        <p className="text-xs text-muted-foreground">Selecciona los que apliquen</p>
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
                onCheckedChange={() => toggleArray("objetivos", opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="productos" className="text-sm font-medium">
          ¿Qué productos o servicios ofreces?
        </Label>
        <Textarea
          id="productos"
          placeholder="Ej: Software de gestión contable para pymes"
          rows={2}
          {...register("productos")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="volumenMensual" className="text-sm font-medium">
          Volumen mensual aproximado (clientes, pedidos o proyectos)
        </Label>
        <Input
          id="volumenMensual"
          placeholder="Ej: 150 pedidos/mes"
          {...register("volumenMensual")}
        />
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">¿Cómo llegan hoy tus clientes?</Label>
        <div className="grid sm:grid-cols-2 gap-2">
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
                onCheckedChange={() => toggleArray("canalesAdquisicion", opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
