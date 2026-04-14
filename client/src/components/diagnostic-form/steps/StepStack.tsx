import { UseFormReturn } from "react-hook-form";
import { Cpu } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const herramientasOptions = [
  "Excel / Google Sheets",
  "WhatsApp",
  "Email",
  "CRM (HubSpot, Salesforce, Pipedrive)",
  "ERP",
  "Contabilidad (QuickBooks, Siigo, Alegra)",
  "E-commerce (Shopify, Woo, VTEX)",
  "Zapier / Make",
  "Notion",
  "ClickUp / Asana / Trello",
];

const madurezOptions = [
  {
    value: "basico",
    label: "Apenas empezamos",
    desc: "Papel, Excel y WhatsApp. No usamos IA.",
  },
  {
    value: "intermedio",
    label: "Digitales pero sin conectar",
    desc: "Usamos varias herramientas. IA básica (ChatGPT).",
  },
  {
    value: "avanzado",
    label: "Integrados y automatizados",
    desc: "Sistemas conectados, IA en algunos flujos.",
  },
  {
    value: "tech_first",
    label: "Tech-first",
    desc: "IA y automatización son parte central de la operación.",
  },
];

const conectadasOptions = [
  { value: "si", label: "Sí, todo conectado" },
  { value: "parcialmente", label: "Parcialmente" },
  { value: "no", label: "No, son silos" },
];

const usaIAOptions = [
  { value: "si", label: "Sí, ya la usamos" },
  { value: "no", label: "No o muy poco" },
];

export default function StepStack({ form }: StepProps) {
  const { register, setValue, watch } = form;
  const herramientas = watch("herramientas") || [];
  const conectadas = watch("conectadas") || "";
  const madurezTech = watch("madurezTech") || "";
  const usaIA = watch("usaIA") || "";

  const toggleHerramienta = (value: string) => {
    const current = [...herramientas];
    const idx = current.indexOf(value);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(value);
    setValue("herramientas", current, { shouldValidate: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Cpu className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Paso 2 de 2 · Opcional</p>
          <h2 className="text-lg font-medium text-foreground">Tu stack</h2>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">¿Qué herramientas usan hoy?</Label>
        <p className="text-xs text-muted-foreground">Selecciona todas las que apliquen</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {herramientasOptions.map((opt) => (
            <label
              key={opt}
              className={`flex items-center gap-3 p-3 border rounded-sm cursor-pointer transition-colors text-sm ${
                herramientas.includes(opt)
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/20 text-muted-foreground"
              }`}
            >
              <Checkbox
                checked={herramientas.includes(opt)}
                onCheckedChange={() => toggleHerramienta(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
        <Input
          placeholder="¿Otras herramientas? (opcional)"
          {...register("herramientasOtras")}
        />
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">¿Están conectadas entre sí?</Label>
        <RadioGroup
          value={conectadas}
          onValueChange={(val) => setValue("conectadas", val, { shouldValidate: true })}
          className="grid sm:grid-cols-3 gap-2"
        >
          {conectadasOptions.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-2 p-3 border rounded-sm cursor-pointer transition-colors text-sm ${
                conectadas === opt.value
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/20 text-muted-foreground"
              }`}
            >
              <RadioGroupItem value={opt.value} />
              {opt.label}
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">¿Qué tan maduros son tecnológicamente?</Label>
        <RadioGroup
          value={madurezTech}
          onValueChange={(val) => setValue("madurezTech", val, { shouldValidate: true })}
          className="grid gap-2"
        >
          {madurezOptions.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 border rounded-sm cursor-pointer transition-colors text-sm ${
                madurezTech === opt.value
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/20 text-muted-foreground"
              }`}
            >
              <RadioGroupItem value={opt.value} className="mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">{opt.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
              </div>
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">¿Usan IA en la operación?</Label>
        <RadioGroup
          value={usaIA}
          onValueChange={(val) => setValue("usaIA", val, { shouldValidate: true })}
          className="grid grid-cols-2 gap-2"
        >
          {usaIAOptions.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-2 p-3 border rounded-sm cursor-pointer transition-colors text-sm ${
                usaIA === opt.value
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/20 text-muted-foreground"
              }`}
            >
              <RadioGroupItem value={opt.value} />
              {opt.label}
            </label>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
