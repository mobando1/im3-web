import { UseFormReturn } from "react-hook-form";
import { Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const clienteOptions = [
  "Consumidores individuales",
  "Empresas",
  "Gobierno / sector público",
  "Instituciones educativas",
  "Otro",
];

export default function StepBusiness({ form }: StepProps) {
  const { register, setValue, watch, formState: { errors } } = form;
  const clientePrincipal = watch("clientePrincipal");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Briefcase className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Paso 3 de 8</p>
          <h2 className="text-lg font-medium text-foreground">Modelo de Negocio</h2>
        </div>
      </div>

      {/* Q9 — Productos o servicios */}
      <div className="space-y-2">
        <Label htmlFor="productos" className="text-sm font-medium">
          ¿Qué productos o servicios ofrece la empresa?
        </Label>
        <Textarea
          id="productos"
          placeholder="Describa sus productos y/o servicios principales..."
          rows={4}
          {...register("productos")}
        />
        {errors.productos && <p className="text-xs text-destructive">{errors.productos.message}</p>}
      </div>

      {/* Q10 — Volumen mensual */}
      <div className="space-y-2">
        <Label htmlFor="volumenMensual" className="text-sm font-medium">
          ¿Cuántos clientes, pedidos o proyectos maneja al mes aproximadamente?
        </Label>
        <Input
          id="volumenMensual"
          placeholder="Ej: 50 clientes, 200 pedidos..."
          {...register("volumenMensual")}
        />
        {errors.volumenMensual && <p className="text-xs text-destructive">{errors.volumenMensual.message}</p>}
      </div>

      {/* Q11 — Cliente principal */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">¿Quién es su cliente principal?</Label>
        <RadioGroup
          value={clientePrincipal}
          onValueChange={(val) => {
            setValue("clientePrincipal", val, { shouldValidate: true });
            if (val !== "Otro") {
              setValue("clientePrincipalOtro", "", { shouldValidate: true });
            }
          }}
          className="grid gap-2"
        >
          {clienteOptions.map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-3 p-3 border rounded-sm cursor-pointer transition-colors text-sm ${
                clientePrincipal === opt
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/20 text-muted-foreground"
              }`}
            >
              <RadioGroupItem value={opt} />
              {opt}
            </label>
          ))}
        </RadioGroup>
        {errors.clientePrincipal && <p className="text-xs text-destructive">{errors.clientePrincipal.message}</p>}

        {clientePrincipal === "Otro" && (
          <div className="space-y-2 pl-4 border-l-2 border-primary/30">
            <Label htmlFor="clientePrincipalOtro" className="text-sm font-medium text-muted-foreground">
              ¿Cuál?
            </Label>
            <Input
              id="clientePrincipalOtro"
              placeholder="Especifique..."
              {...register("clientePrincipalOtro")}
            />
            {errors.clientePrincipalOtro && <p className="text-xs text-destructive">{errors.clientePrincipalOtro.message}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
