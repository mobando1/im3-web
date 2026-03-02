import { UseFormReturn } from "react-hook-form";
import { FileCheck, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DiagnosticFormData } from "../schema";
import { stepMeta } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
  onGoToStep: (step: number) => void;
}

function ReviewSection({
  stepIndex,
  title,
  items,
  onEdit,
}: {
  stepIndex: number;
  title: string;
  items: { label: string; value: string | string[] }[];
  onEdit: () => void;
}) {
  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            {String(stepIndex + 1).padStart(2, "0")}
          </span>
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Pencil className="w-3 h-3 mr-1" />
          Editar
        </Button>
      </div>
      <div className="divide-y divide-border">
        {items.map((item, i) => (
          <div key={i} className="px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
            {Array.isArray(item.value) ? (
              <div className="flex flex-wrap gap-1.5">
                {item.value.map((v, j) => (
                  <span key={j} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-sm">
                    {v}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground">{item.value || "—"}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StepReview({ form, onGoToStep }: StepProps) {
  const data = form.getValues();

  const sections = [
    {
      title: stepMeta[0].title,
      items: [
        { label: "Empresa", value: data.empresa },
        { label: "Industria / Sector", value: data.industria },
        { label: "Años de operación", value: data.anosOperacion },
        { label: "Empleados", value: data.empleados },
        { label: "Ciudades / Países", value: data.ciudades },
        { label: "Participante", value: data.participante },
      ],
    },
    {
      title: stepMeta[1].title,
      items: [
        { label: "Objetivos", value: data.objetivos || [] },
        { label: "Resultado esperado", value: data.resultadoEsperado },
      ],
    },
    {
      title: stepMeta[2].title,
      items: [
        { label: "Productos / Servicios", value: data.productos },
        { label: "Volumen mensual", value: data.volumenMensual },
        { label: "Cliente principal", value: data.clientePrincipal === "Otro" ? `Otro: ${data.clientePrincipalOtro}` : data.clientePrincipal },
      ],
    },
    {
      title: stepMeta[3].title,
      items: [
        { label: "Canales de adquisición", value: data.canalesAdquisicion?.map(c => c === "Otro" ? `Otro: ${data.canalAdquisicionOtro}` : c) || [] },
        { label: "Canal principal", value: data.canalPrincipal },
      ],
    },
    {
      title: stepMeta[4].title,
      items: [
        { label: "Herramientas actuales", value: data.herramientas },
        { label: "¿Conectadas?", value: data.conectadas + (data.conectadasDetalle ? ` — ${data.conectadasDetalle}` : "") },
      ],
    },
    {
      title: stepMeta[5].title,
      items: [
        { label: "Nivel tecnológico", value: data.nivelTech },
        { label: "¿Usa IA?", value: data.usaIA + (data.usaIAParaQue ? ` — ${data.usaIAParaQue}` : "") },
        { label: "Comodidad con tech", value: data.comodidadTech },
        {
          label: "Familiaridad con conceptos",
          value: data.familiaridad
            ? Object.entries(data.familiaridad).map(([key, val]) => {
                const labels: Record<string, string> = {
                  automatizacion: "Automatización",
                  crm: "CRM",
                  ia: "IA",
                  integracion: "Integración",
                  desarrollo: "Desarrollo",
                };
                return `${labels[key] || key}: ${val}`;
              })
            : [],
        },
      ],
    },
    {
      title: stepMeta[6].title,
      items: [
        { label: "Áreas prioritarias", value: data.areaPrioridad || [] },
        { label: "Presupuesto", value: data.presupuesto },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <FileCheck className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Paso 8 de 8</p>
          <h2 className="text-lg font-medium text-foreground">Resumen del Diagnóstico</h2>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Revise sus respuestas antes de enviar. Puede editar cualquier sección haciendo clic en "Editar".
      </p>

      <div className="space-y-4">
        {sections.map((section, i) => (
          <ReviewSection
            key={i}
            stepIndex={i}
            title={section.title}
            items={section.items}
            onEdit={() => onGoToStep(i)}
          />
        ))}
      </div>
    </div>
  );
}
