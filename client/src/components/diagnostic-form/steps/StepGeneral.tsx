import { UseFormReturn } from "react-hook-form";
import { Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INDUSTRIAS, type IndustriaValue } from "@shared/industrias";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const empleadosOptions = ["1-10", "11-25", "26-50", "51-100", "100+"];

export default function StepGeneral({ form }: StepProps) {
  const { register, setValue, watch, formState: { errors } } = form;
  const empleados = watch("empleados");
  const industria = watch("industria");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Paso 2 de 3</p>
          <h2 className="text-lg font-medium text-foreground">Tu empresa</h2>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="participante" className="text-sm font-medium">
          Nombre y cargo
        </Label>
        <Input
          id="participante"
          placeholder="Ej: Juan Pérez, CEO"
          {...register("participante")}
        />
        {errors.participante && <p className="text-xs text-destructive">{errors.participante.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="empresa" className="text-sm font-medium">
          Nombre de la empresa
        </Label>
        <Input
          id="empresa"
          placeholder="Ej: Acme Corp"
          {...register("empresa")}
        />
        {errors.empresa && <p className="text-xs text-destructive">{errors.empresa.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="telefono" className="text-sm font-medium">
          Teléfono / WhatsApp
        </Label>
        <Input
          id="telefono"
          type="tel"
          placeholder="Ej: +57 300 123 4567"
          {...register("telefono")}
        />
        {errors.telefono && <p className="text-xs text-destructive">{errors.telefono.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="industria" className="text-sm font-medium">
          Industria
        </Label>
        <Select
          value={industria || ""}
          onValueChange={(val) => setValue("industria", val as IndustriaValue, { shouldValidate: true })}
        >
          <SelectTrigger id="industria" className="w-full">
            <SelectValue placeholder="Selecciona tu industria" />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIAS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.industria && <p className="text-xs text-destructive">{errors.industria.message}</p>}
      </div>

      {industria === "otro" && (
        <div className="space-y-2">
          <Label htmlFor="industriaOtro" className="text-sm font-medium">
            ¿Cuál industria?
          </Label>
          <Input
            id="industriaOtro"
            placeholder="Describe tu industria"
            {...register("industriaOtro")}
          />
          {errors.industriaOtro && <p className="text-xs text-destructive">{errors.industriaOtro.message}</p>}
        </div>
      )}

      <div className="space-y-3">
        <Label className="text-sm font-medium">Número de empleados</Label>
        <RadioGroup
          value={empleados || ""}
          onValueChange={(val) => setValue("empleados", val, { shouldValidate: true })}
          className="grid grid-cols-2 sm:grid-cols-3 gap-2"
        >
          {empleadosOptions.map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-2 p-3 border rounded-sm cursor-pointer transition-colors text-sm ${
                empleados === opt
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/20 text-muted-foreground"
              }`}
            >
              <RadioGroupItem value={opt} />
              {opt}
            </label>
          ))}
        </RadioGroup>
        {errors.empleados && <p className="text-xs text-destructive">{errors.empleados.message}</p>}
      </div>
    </div>
  );
}
