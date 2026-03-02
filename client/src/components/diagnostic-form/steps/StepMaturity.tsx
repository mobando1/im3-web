import { UseFormReturn } from "react-hook-form";
import { Cpu } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const nivelTechOptions = [
  { value: "Básico", desc: "Usamos principalmente papel, Excel y WhatsApp" },
  { value: "Intermedio", desc: "Usamos herramientas digitales pero no están integradas" },
  { value: "Avanzado", desc: "Tenemos sistemas integrados y algunos procesos automatizados" },
  { value: "Muy avanzado", desc: "La tecnología es parte central de nuestra operación" },
];

const usaIAOptions = [
  "Sí, regularmente",
  "Sí, pero de forma básica o esporádica",
  "No, pero nos interesa aprender",
  "No, y no sabemos por dónde empezar",
];

const comodidadOptions = [
  "Muy cómodo — el equipo se adapta rápido",
  "Moderado — se necesita capacitación y tiempo",
  "Bajo — hay resistencia al cambio",
  "Variable — depende del área o persona",
];

const familiaridadConceptos = [
  { key: "automatizacion" as const, label: "Automatización de procesos (Zapier, Make, Power Automate)" },
  { key: "crm" as const, label: "CRM y gestión de clientes" },
  { key: "ia" as const, label: "Inteligencia artificial aplicada a negocios" },
  { key: "integracion" as const, label: "Integración de sistemas (APIs, conectores)" },
  { key: "desarrollo" as const, label: "Desarrollo de aplicaciones a la medida" },
];

const familiaridadLevels = ["Nada", "Algo", "Bien"];

export default function StepMaturity({ form }: StepProps) {
  const { setValue, watch, register, formState: { errors } } = form;
  const nivelTech = watch("nivelTech");
  const usaIA = watch("usaIA");
  const comodidadTech = watch("comodidadTech");
  const familiaridad = watch("familiaridad");

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Cpu className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Paso 7 de 9</p>
          <h2 className="text-lg font-medium text-foreground">Madurez Tecnológica</h2>
        </div>
      </div>

      {/* Q16 — Nivel tecnológico */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">¿Cómo describiría el nivel tecnológico actual de su empresa?</Label>
        <RadioGroup
          value={nivelTech}
          onValueChange={(val) => setValue("nivelTech", val, { shouldValidate: true })}
          className="grid gap-2"
        >
          {nivelTechOptions.map((opt) => (
            <label
              key={opt.value}
              className={`flex flex-col gap-1 p-4 border rounded-sm cursor-pointer transition-colors ${
                nivelTech === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <RadioGroupItem value={opt.value} />
                <span className={`text-sm font-medium ${nivelTech === opt.value ? "text-foreground" : "text-muted-foreground"}`}>
                  {opt.value}
                </span>
              </div>
              <p className="text-xs text-muted-foreground pl-7">{opt.desc}</p>
            </label>
          ))}
        </RadioGroup>
        {errors.nivelTech && <p className="text-xs text-destructive">{errors.nivelTech.message}</p>}
      </div>

      {/* Q17 — ¿Usa IA? */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">
          ¿Alguien en su equipo utiliza herramientas de inteligencia artificial?
        </Label>
        <p className="text-xs text-muted-foreground">ChatGPT, Copilot, Gemini, etc.</p>
        <RadioGroup
          value={usaIA}
          onValueChange={(val) => {
            setValue("usaIA", val, { shouldValidate: true });
            if (val !== "Sí, regularmente") {
              setValue("usaIAParaQue", "", { shouldValidate: true });
            }
          }}
          className="grid gap-2"
        >
          {usaIAOptions.map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-3 p-3 border rounded-sm cursor-pointer transition-colors text-sm ${
                usaIA === opt
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/20 text-muted-foreground"
              }`}
            >
              <RadioGroupItem value={opt} />
              {opt}
            </label>
          ))}
        </RadioGroup>
        {errors.usaIA && <p className="text-xs text-destructive">{errors.usaIA.message}</p>}

        {usaIA === "Sí, regularmente" && (
          <div className="space-y-2 pl-4 border-l-2 border-primary/30">
            <Label htmlFor="usaIAParaQue" className="text-sm font-medium text-muted-foreground">
              ¿Para qué lo utilizan?
            </Label>
            <Input
              id="usaIAParaQue"
              placeholder="Ej: Redacción de contenido, análisis de datos, atención al cliente..."
              {...register("usaIAParaQue")}
            />
            {errors.usaIAParaQue && <p className="text-xs text-destructive">{errors.usaIAParaQue.message}</p>}
          </div>
        )}
      </div>

      {/* Q18 — Comodidad adoptando tech */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">
          ¿Qué tan cómodo se siente su equipo adoptando nuevas herramientas tecnológicas?
        </Label>
        <RadioGroup
          value={comodidadTech}
          onValueChange={(val) => setValue("comodidadTech", val, { shouldValidate: true })}
          className="grid gap-2"
        >
          {comodidadOptions.map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-3 p-3 border rounded-sm cursor-pointer transition-colors text-sm ${
                comodidadTech === opt
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/20 text-muted-foreground"
              }`}
            >
              <RadioGroupItem value={opt} />
              {opt}
            </label>
          ))}
        </RadioGroup>
        {errors.comodidadTech && <p className="text-xs text-destructive">{errors.comodidadTech.message}</p>}
      </div>

      {/* Q19 — Familiaridad con conceptos (Matrix) */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">
          ¿Qué tan familiarizado está con los siguientes conceptos?
        </Label>

        <div className="border border-border rounded-sm overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_repeat(3,64px)] sm:grid-cols-[1fr_repeat(3,80px)] bg-muted/50 border-b border-border">
            <div className="p-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Concepto</div>
            {familiaridadLevels.map((level) => (
              <div key={level} className="p-3 text-xs font-mono uppercase tracking-wider text-muted-foreground text-center">
                {level}
              </div>
            ))}
          </div>

          {/* Concept rows */}
          {familiaridadConceptos.map((concepto, i) => {
            const currentValue = familiaridad?.[concepto.key] || "";
            return (
              <div
                key={concepto.key}
                className={`grid grid-cols-[1fr_repeat(3,64px)] sm:grid-cols-[1fr_repeat(3,80px)] ${
                  i < familiaridadConceptos.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="p-3 text-sm text-foreground/80 flex items-center">
                  {concepto.label}
                </div>
                {familiaridadLevels.map((level) => (
                  <div key={level} className="p-3 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => setValue(`familiaridad.${concepto.key}`, level, { shouldValidate: true })}
                      className={`w-5 h-5 rounded-full border-2 transition-colors ${
                        currentValue === level
                          ? "border-primary bg-primary"
                          : "border-border hover:border-foreground/30"
                      }`}
                      aria-label={`${concepto.label}: ${level}`}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {errors.familiaridad && (
          <p className="text-xs text-destructive">Complete todos los conceptos</p>
        )}
      </div>
    </div>
  );
}
