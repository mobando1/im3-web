import { UseFormReturn } from "react-hook-form";
import { Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const empleadosOptions = ["1-10", "11-25", "26-50", "51-100", "100+"];

export default function StepGeneral({ form }: StepProps) {
  const { register, setValue, watch, formState: { errors } } = form;
  const empleados = watch("empleados");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Paso 2 de 9</p>
          <h2 className="text-lg font-medium text-foreground">Información General</h2>
        </div>
      </div>

      {/* Q1 — Nombre de la empresa */}
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

      {/* Q2 — Industria / Sector */}
      <div className="space-y-2">
        <Label htmlFor="industria" className="text-sm font-medium">
          Industria / Sector
        </Label>
        <Input
          id="industria"
          placeholder="Ej: Tecnología, Salud, Retail..."
          {...register("industria")}
        />
        {errors.industria && <p className="text-xs text-destructive">{errors.industria.message}</p>}
      </div>

      {/* Q3 — Años de operación */}
      <div className="space-y-2">
        <Label htmlFor="anosOperacion" className="text-sm font-medium">
          Años de operación
        </Label>
        <Input
          id="anosOperacion"
          type="number"
          min="0"
          placeholder="Ej: 5"
          {...register("anosOperacion")}
        />
        {errors.anosOperacion && <p className="text-xs text-destructive">{errors.anosOperacion.message}</p>}
      </div>

      {/* Q4 — Número de empleados */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Número de empleados</Label>
        <RadioGroup
          value={empleados}
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

      {/* Q5 — Ciudades o países */}
      <div className="space-y-2">
        <Label htmlFor="ciudades" className="text-sm font-medium">
          Ciudades o países donde opera
        </Label>
        <Input
          id="ciudades"
          placeholder="Ej: Colombia, México, Estados Unidos"
          {...register("ciudades")}
        />
        {errors.ciudades && <p className="text-xs text-destructive">{errors.ciudades.message}</p>}
      </div>

      {/* Q6 — Participante */}
      <div className="space-y-2">
        <Label htmlFor="participante" className="text-sm font-medium">
          Nombre y cargo de quien participará en la auditoría
        </Label>
        <Input
          id="participante"
          placeholder="Ej: Juan Pérez, CEO"
          {...register("participante")}
        />
        {errors.participante && <p className="text-xs text-destructive">{errors.participante.message}</p>}
      </div>
    </div>
  );
}
