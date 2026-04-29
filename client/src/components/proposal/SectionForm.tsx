import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, X, GripVertical } from "lucide-react";
import { AiFieldHelper } from "./AiFieldHelper";

/** Hook for HTML5 drag-and-drop reordering of any array */
function useDragReorder<T>(items: T[], onChange: (items: T[]) => void) {
  const dragIdx = useRef<number | null>(null);
  const overIdx = useRef<number | null>(null);

  const onDragStart = useCallback((i: number) => (e: React.DragEvent) => {
    dragIdx.current = i;
    e.dataTransfer.effectAllowed = "move";
    (e.target as HTMLElement).style.opacity = "0.4";
  }, []);

  const onDragOver = useCallback((i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    overIdx.current = i;
  }, []);

  const onDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = "1";
    const from = dragIdx.current;
    const to = overIdx.current;
    if (from !== null && to !== null && from !== to) {
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onChange(next);
    }
    dragIdx.current = null;
    overIdx.current = null;
  }, [items, onChange]);

  return { onDragStart, onDragOver, onDragEnd };
}

type SectionFormProps = {
  sectionKey: string;
  data: Record<string, unknown>;
  onSave: (updated: Record<string, unknown>) => void;
  onCancel: () => void;
};

/** Determina si una sección tiene formulario tipado (o cae a JSON edit) */
export function hasTypedForm(sectionKey: string): boolean {
  return [
    "meta", "hero", "problem", "pricing", "cta", "timeline",
    "operationalCosts", "summary", "solution", "tech", "roi",
    "authority", "hardware"
  ].includes(sectionKey);
}

export function SectionForm({ sectionKey, data, onSave, onCancel }: SectionFormProps) {
  const [local, setLocal] = useState<Record<string, unknown>>(structuredClone(data));

  const set = (key: string, value: unknown) => {
    setLocal(prev => ({ ...prev, [key]: value }));
  };

  const save = () => onSave(local);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Editando con formulario</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} className="gap-1.5 bg-[#2FA4A9] hover:bg-[#238b8f]">
            <Save className="w-3.5 h-3.5" /> Guardar
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
        </div>
      </div>

      {sectionKey === "meta" && <MetaForm data={local} set={set} />}
      {sectionKey === "hero" && <HeroForm data={local} set={set} />}
      {sectionKey === "summary" && <SummaryForm data={local} set={set} />}
      {sectionKey === "problem" && <ProblemForm data={local} set={set} />}
      {sectionKey === "solution" && <SolutionForm data={local} set={set} />}
      {sectionKey === "tech" && <TechForm data={local} set={set} />}
      {sectionKey === "timeline" && <TimelineForm data={local} set={set} />}
      {sectionKey === "roi" && <ROIForm data={local} set={set} />}
      {sectionKey === "authority" && <AuthorityForm data={local} set={set} />}
      {sectionKey === "pricing" && <PricingForm data={local} set={set} />}
      {sectionKey === "hardware" && <HardwareForm data={local} set={set} />}
      {sectionKey === "operationalCosts" && <OpCostsForm data={local} set={set} />}
      {sectionKey === "cta" && <CTAForm data={local} set={set} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// FIELD HELPERS
// ────────────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <Label className="text-xs font-medium text-gray-700 mb-1 block">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function StringListEditor({ items, onChange, placeholder, context }: { items: string[]; onChange: (items: string[]) => void; placeholder?: string; context?: string }) {
  const add = () => onChange([...items, ""]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const update = (i: number, val: string) => { const next = [...items]; next[i] = val; onChange(next); };
  const { onDragStart, onDragOver, onDragEnd } = useDragReorder(items, onChange);

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-start gap-2"
          draggable
          onDragStart={onDragStart(i)}
          onDragOver={onDragOver(i)}
          onDragEnd={onDragEnd}
        >
          <GripVertical className="w-3 h-3 text-gray-300 shrink-0 cursor-grab active:cursor-grabbing mt-2" />
          <div className="flex-1 min-w-0">
            <AiFieldHelper value={item} onChange={val => update(i, val)} context={context}>
              <Input value={item} onChange={e => update(i, e.target.value)} placeholder={placeholder} className="text-sm h-8" />
            </AiFieldHelper>
          </div>
          <button onClick={() => remove(i)} className="text-gray-400 hover:text-red-500 p-1 mt-1"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add} className="text-xs h-7 gap-1">
        <Plus className="w-3 h-3" /> Agregar
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SECTION: META
// ────────────────────────────────────────────────────────────────

function MetaForm({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Nombre de la empresa">
        <Input value={String(data.clientName ?? "")} onChange={e => set("clientName", e.target.value)} />
      </Field>
      <Field label="Nombre del contacto">
        <Input value={String(data.contactName ?? "")} onChange={e => set("contactName", e.target.value)} />
      </Field>
      <Field label="Fecha de propuesta">
        <Input value={String(data.proposalDate ?? "")} onChange={e => set("proposalDate", e.target.value)} />
      </Field>
      <Field label="Válida hasta">
        <Input value={String(data.validUntil ?? "")} onChange={e => set("validUntil", e.target.value)} />
      </Field>
      <Field label="Industria" hint="Se usa para seleccionar testimonios y contexto">
        <Input value={String(data.industry ?? "")} onChange={e => set("industry", e.target.value)} />
      </Field>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SECTION: HERO
// ────────────────────────────────────────────────────────────────

function HeroForm({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Headline del dolor" hint="1 frase impactante. Ej: 'APP Logistics pierde $25M COP cada mes en horas extras'">
        <AiFieldHelper value={String(data.painHeadline ?? "")} onChange={v => set("painHeadline", v)} context="Hero headline de propuesta comercial">
          <Textarea value={String(data.painHeadline ?? "")} onChange={e => set("painHeadline", e.target.value)} rows={2} />
        </AiFieldHelper>
      </Field>
      <Field label="Cifra del dolor" hint="La cifra grande que se ve en el hero. Ej: '$25M COP/mes perdidos'">
        <AiFieldHelper value={String(data.painAmount ?? "")} onChange={v => set("painAmount", v)} context="Cifra de dolor en hero">
          <Input value={String(data.painAmount ?? "")} onChange={e => set("painAmount", e.target.value)} />
        </AiFieldHelper>
      </Field>
      <Field label="Subtítulo" hint="Transición del dolor a la promesa. 2-3 líneas.">
        <AiFieldHelper value={String(data.subtitle ?? "")} onChange={v => set("subtitle", v)} context="Subtítulo del hero de propuesta">
          <Textarea value={String(data.subtitle ?? "")} onChange={e => set("subtitle", e.target.value)} rows={2} />
        </AiFieldHelper>
      </Field>
      <Field label="Referencia al diagnóstico" hint="Ej: 'Basado en el diagnóstico gratuito que realizamos para APP Logistics · 27 de marzo de 2026'">
        <AiFieldHelper value={String(data.diagnosisRef ?? "")} onChange={v => set("diagnosisRef", v)} context="Referencia al diagnóstico gratuito">
          <Input value={String(data.diagnosisRef ?? "")} onChange={e => set("diagnosisRef", e.target.value)} />
        </AiFieldHelper>
      </Field>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SECTION: PROBLEM
// ────────────────────────────────────────────────────────────────

function ProblemForm({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  const cards = (data.problemCards as Array<{ icon: string; title: string; description: string }>) ?? [];
  const updateCard = (i: number, field: string, value: string) => {
    const next = [...cards];
    next[i] = { ...next[i], [field]: value };
    set("problemCards", next);
  };
  const addCard = () => set("problemCards", [...cards, { icon: "📌", title: "", description: "" }]);
  const removeCard = (i: number) => set("problemCards", cards.filter((_, idx) => idx !== i));
  const cardDrag = useDragReorder(cards, (v) => set("problemCards", v));

  return (
    <div className="space-y-4">
      <Field label="Intro del problema" hint="2-3 líneas que abren la sección">
        <Textarea value={String(data.intro ?? "")} onChange={e => set("intro", e.target.value)} rows={2} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Pérdida mensual en COP" hint="Número entero sin separadores. Ej: 25000000">
          <Input
            type="number"
            value={String(data.monthlyLossCOP ?? "")}
            onChange={e => set("monthlyLossCOP", parseInt(e.target.value) || 0)}
            className="font-mono"
          />
          {typeof data.monthlyLossCOP === "number" && data.monthlyLossCOP > 0 && (
            <p className="text-xs text-emerald-600 mt-0.5 font-medium">
              = ${(data.monthlyLossCOP as number / 1_000_000).toFixed(0)}M COP/mes · ${((data.monthlyLossCOP as number) * 12 / 1_000_000).toFixed(0)}M COP/año
            </p>
          )}
        </Field>
        <Field label="Descripción del counter" hint="Texto debajo del número animado">
          <Input value={String(data.counterDescription ?? "")} onChange={e => set("counterDescription", e.target.value)} />
        </Field>
      </div>
      <Field label="Breakdown del cálculo" hint="OBLIGATORIO: explica de dónde sale la cifra. El cliente debe poder auditar este número.">
        <AiFieldHelper value={String(data.calculationBreakdown ?? "")} onChange={v => set("calculationBreakdown", v)} context="Breakdown del cálculo de pérdidas mensuales">
          <Textarea
            value={String(data.calculationBreakdown ?? "")}
            onChange={e => set("calculationBreakdown", e.target.value)}
            rows={4}
            className="text-sm"
            placeholder="Ej: 45 empleados que registran manualmente horas extras. Si 15% tiene sobrepago (estudios del sector: 10-20%), a $4.5M COP/emp/mes promedio, son ~$30M. Tomamos conservador: $25M."
          />
        </AiFieldHelper>
      </Field>

      <div>
        <Label className="text-xs font-medium text-gray-700 mb-2 block">Problem cards ({cards.length})</Label>
        <div className="space-y-3">
          {cards.map((card, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 relative" draggable onDragStart={cardDrag.onDragStart(i)} onDragOver={cardDrag.onDragOver(i)} onDragEnd={cardDrag.onDragEnd}>
              <button onClick={() => removeCard(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <div className="grid grid-cols-[50px_1fr] gap-2">
                <Field label="Emoji">
                  <Input value={card.icon} onChange={e => updateCard(i, "icon", e.target.value)} className="text-center" />
                </Field>
                <Field label="Título">
                  <AiFieldHelper value={card.title} onChange={v => updateCard(i, "title", v)} context="Título de problem card en propuesta">
                    <Input value={card.title} onChange={e => updateCard(i, "title", e.target.value)} />
                  </AiFieldHelper>
                </Field>
              </div>
              <Field label="Descripción">
                <AiFieldHelper value={card.description} onChange={v => updateCard(i, "description", v)} context="Descripción de problema del cliente">
                  <Textarea value={card.description} onChange={e => updateCard(i, "description", e.target.value)} rows={2} className="text-sm" />
                </AiFieldHelper>
              </Field>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addCard} className="text-xs h-7 gap-1">
            <Plus className="w-3 h-3" /> Agregar problem card
          </Button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SECTION: PRICING
// ────────────────────────────────────────────────────────────────

function PricingForm({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  const milestones = (data.milestones as Array<{ step: number; name: string; desc: string; amount: string }>) ?? [];
  const includes = (data.includes as string[]) ?? [];

  const updateMilestone = (i: number, field: string, value: unknown) => {
    const next = [...milestones];
    next[i] = { ...next[i], [field]: value };
    set("milestones", next);
  };
  const addMilestone = () => set("milestones", [...milestones, { step: milestones.length + 1, name: "", desc: "", amount: "" }]);
  const removeMilestone = (i: number) => set("milestones", milestones.filter((_, idx) => idx !== i).map((m, idx) => ({ ...m, step: idx + 1 })));
  const milestoneDrag = useDragReorder(milestones, (v) => set("milestones", v.map((m, idx) => ({ ...m, step: idx + 1 }))));

  return (
    <div className="space-y-4">
      <Field label="Label">
        <Input value={String(data.label ?? "")} onChange={e => set("label", e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Prefijo" hint="Ej: $">
          <Input value={String(data.amountPrefix ?? "$")} onChange={e => set("amountPrefix", e.target.value)} className="text-center" />
        </Field>
        <Field label="Monto total" hint="Número con formato. Ej: 24.000.000">
          <Input
            value={String(data.amount ?? "")}
            onChange={e => set("amount", e.target.value)}
            className="font-mono text-lg font-bold"
            placeholder="24.000.000"
          />
        </Field>
        <Field label="Moneda">
          <Select value={String(data.amountSuffix ?? "COP")} onValueChange={v => set("amountSuffix", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="COP">COP (Pesos colombianos)</SelectItem>
              <SelectItem value="USD">USD (Dólares)</SelectItem>
              <SelectItem value="MXN">MXN (Pesos mexicanos)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Nota de precio" hint="Ej: 'Pago único. Sin mensualidades ocultas.'">
        <AiFieldHelper value={String(data.priceFootnote ?? "")} onChange={v => set("priceFootnote", v)} context="Nota de precio en propuesta">
          <Input value={String(data.priceFootnote ?? "")} onChange={e => set("priceFootnote", e.target.value)} />
        </AiFieldHelper>
      </Field>
      <Field label="Mensaje de escasez" hint="Urgencia real, no artificial">
        <AiFieldHelper value={String(data.scarcityMessage ?? "")} onChange={v => set("scarcityMessage", v)} context="Mensaje de escasez/urgencia en propuesta">
          <Textarea value={String(data.scarcityMessage ?? "")} onChange={e => set("scarcityMessage", e.target.value)} rows={2} className="text-sm" />
        </AiFieldHelper>
      </Field>

      <div>
        <Label className="text-xs font-medium text-gray-700 mb-2 block">Milestones de pago ({milestones.length})</Label>
        <div className="space-y-2">
          {milestones.map((m, i) => (
            <div key={i} className="grid grid-cols-[40px_1fr_1fr_140px_30px] gap-2 items-end cursor-grab active:cursor-grabbing" draggable onDragStart={milestoneDrag.onDragStart(i)} onDragOver={milestoneDrag.onDragOver(i)} onDragEnd={milestoneDrag.onDragEnd}>
              <div className="text-center text-xs font-bold text-gray-400 pb-2">{m.step}</div>
              <Field label={i === 0 ? "Nombre" : ""}>
                <Input value={m.name} onChange={e => updateMilestone(i, "name", e.target.value)} placeholder="Al firmar" className="h-8 text-sm" />
              </Field>
              <Field label={i === 0 ? "Descripción" : ""}>
                <Input value={m.desc} onChange={e => updateMilestone(i, "desc", e.target.value)} placeholder="Qué se entrega" className="h-8 text-sm" />
              </Field>
              <Field label={i === 0 ? "Monto" : ""}>
                <Input value={m.amount} onChange={e => updateMilestone(i, "amount", e.target.value)} placeholder="$7.200.000 (30%)" className="h-8 text-sm font-mono" />
              </Field>
              <button onClick={() => removeMilestone(i)} className="text-gray-400 hover:text-red-500 p-1 pb-2"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addMilestone} className="text-xs h-7 gap-1">
            <Plus className="w-3 h-3" /> Agregar milestone
          </Button>
        </div>
      </div>

      <Field label={`Incluye (${includes.length} items)`}>
        <StringListEditor items={includes} onChange={v => set("includes", v)} placeholder="Ej: Portal de seguimiento en tiempo real" />
      </Field>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SECTION: CTA
// ────────────────────────────────────────────────────────────────

function CTAForm({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  const guarantees = (data.guarantees as string[]) ?? [];

  return (
    <div className="space-y-4">
      <Field label="Heading" hint="Pregunta que cierra con el dolor. Ej: '¿Listo para dejar de perder $25M al mes?'">
        <Input value={String(data.heading ?? "")} onChange={e => set("heading", e.target.value)} />
      </Field>
      <Field label="Highlight del dolor" hint="Refuerzo de urgencia bajo el heading">
        <Input value={String(data.painHighlight ?? "")} onChange={e => set("painHighlight", e.target.value)} />
      </Field>
      <Field label="Descripción" hint="2-3 líneas de cierre + partnership teaser">
        <Textarea value={String(data.description ?? "")} onChange={e => set("description", e.target.value)} rows={3} className="text-sm" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Botón principal">
          <Input value={String(data.acceptLabel ?? "")} onChange={e => set("acceptLabel", e.target.value)} />
        </Field>
        <Field label="Botón secundario">
          <Input value={String(data.fallbackCtaLabel ?? "")} onChange={e => set("fallbackCtaLabel", e.target.value)} />
        </Field>
      </div>
      <Field label="Mensaje de deadline">
        <Input value={String(data.deadlineMessage ?? "")} onChange={e => set("deadlineMessage", e.target.value)} />
      </Field>
      <Field label={`Garantías (${guarantees.length})`}>
        <StringListEditor items={guarantees} onChange={v => set("guarantees", v)} placeholder="Ej: Si no entregamos en tiempo, 20% devuelto" />
      </Field>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SECTION: TIMELINE (fases)
// ────────────────────────────────────────────────────────────────

function TimelineForm({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  const phases = (data.phases as Array<{ number: number; title: string; durationWeeks: number; items: string[]; outcome: string }>) ?? [];

  const updatePhase = (i: number, field: string, value: unknown) => {
    const next = [...phases];
    next[i] = { ...next[i], [field]: value };
    set("phases", next);
  };
  const addPhase = () => set("phases", [...phases, { number: phases.length + 1, title: "", durationWeeks: 2, items: [], outcome: "" }]);
  const removePhase = (i: number) => set("phases", phases.filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, number: idx + 1 })));
  const phaseDrag = useDragReorder(phases, (v) => set("phases", v.map((p, idx) => ({ ...p, number: idx + 1 }))));

  const totalWeeks = phases.reduce((sum, p) => sum + (p.durationWeeks || 0), 0);

  return (
    <div className="space-y-4">
      <Field label="Heading del timeline">
        <Input value={String(data.heading ?? "")} onChange={e => set("heading", e.target.value)} />
      </Field>
      <p className="text-xs text-emerald-600 font-medium">Total: {totalWeeks} semanas ({phases.length} fases)</p>

      <div className="space-y-3">
        {phases.map((phase, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-3 relative cursor-grab active:cursor-grabbing" draggable onDragStart={phaseDrag.onDragStart(i)} onDragOver={phaseDrag.onDragOver(i)} onDragEnd={phaseDrag.onDragEnd}>
            <button onClick={() => removePhase(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 p-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-[#2FA4A9] bg-[#2FA4A9]/10 rounded-full w-6 h-6 flex items-center justify-center">{phase.number}</span>
              <span className="text-sm font-medium text-gray-700">Fase {phase.number}</span>
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <Field label="Título">
                <Input value={phase.title} onChange={e => updatePhase(i, "title", e.target.value)} className="h-8 text-sm" placeholder="Control de Asistencia" />
              </Field>
              <Field label="Semanas">
                <Input type="number" value={phase.durationWeeks} onChange={e => updatePhase(i, "durationWeeks", parseInt(e.target.value) || 0)} className="h-8 text-sm font-mono text-center" />
              </Field>
            </div>
            <Field label="Entregables">
              <StringListEditor
                items={phase.items}
                onChange={v => updatePhase(i, "items", v)}
                placeholder="Ej: App móvil con geolocalización"
              />
            </Field>
            <Field label="Outcome" hint="Al finalizar: [lo que el cliente puede hacer]">
              <AiFieldHelper value={phase.outcome} onChange={v => updatePhase(i, "outcome", v)} context="Outcome de fase del cronograma">
                <Input value={phase.outcome} onChange={e => updatePhase(i, "outcome", e.target.value)} className="h-8 text-sm" placeholder="Al finalizar: horas extras controladas automáticamente" />
              </AiFieldHelper>
            </Field>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={addPhase} className="text-xs h-7 gap-1">
          <Plus className="w-3 h-3" /> Agregar fase
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SECTION: OPERATIONAL COSTS
// ────────────────────────────────────────────────────────────────

function OpCostsForm({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  const categories = (data.categories as Array<{ name: string; items: Array<{ service: string; cost: string; note?: string }> }>) ?? [];

  const updateCategory = (ci: number, field: string, value: unknown) => {
    const next = [...categories];
    next[ci] = { ...next[ci], [field]: value };
    set("categories", next);
  };
  const updateItem = (ci: number, ii: number, field: string, value: string) => {
    const next = [...categories];
    const items = [...next[ci].items];
    items[ii] = { ...items[ii], [field]: value };
    next[ci] = { ...next[ci], items };
    set("categories", next);
  };
  const addItem = (ci: number) => {
    const next = [...categories];
    next[ci] = { ...next[ci], items: [...next[ci].items, { service: "", cost: "", note: "" }] };
    set("categories", next);
  };
  const removeItem = (ci: number, ii: number) => {
    const next = [...categories];
    next[ci] = { ...next[ci], items: next[ci].items.filter((_, idx) => idx !== ii) };
    set("categories", next);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Heading">
          <Input value={String(data.heading ?? "")} onChange={e => set("heading", e.target.value)} />
        </Field>
        <Field label="Rango bajo mensual">
          <Input value={String(data.monthlyRangeLow ?? "")} onChange={e => set("monthlyRangeLow", e.target.value)} className="font-mono" placeholder="$65 USD/mes" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rango alto mensual">
          <Input value={String(data.monthlyRangeHigh ?? "")} onChange={e => set("monthlyRangeHigh", e.target.value)} className="font-mono" placeholder="$190 USD/mes" />
        </Field>
        <Field label="Estimado anual">
          <Input value={String(data.annualEstimate ?? "")} onChange={e => set("annualEstimate", e.target.value)} className="font-mono" placeholder="$1.500 USD/año" />
        </Field>
      </div>
      <Field label="Intro">
        <Textarea value={String(data.intro ?? "")} onChange={e => set("intro", e.target.value)} rows={2} className="text-sm" />
      </Field>

      {categories.map((cat, ci) => (
        <div key={ci} className="border border-gray-200 rounded-lg p-3 space-y-2">
          <Field label={`Categoría ${ci + 1}`}>
            <Input value={cat.name} onChange={e => updateCategory(ci, "name", e.target.value)} className="h-8 text-sm font-semibold" />
          </Field>
          {cat.items.map((item, ii) => (
            <div key={ii} className="grid grid-cols-[1fr_120px_1fr_30px] gap-2 items-end">
              <Field label={ii === 0 ? "Servicio" : ""}>
                <Input value={item.service} onChange={e => updateItem(ci, ii, "service", e.target.value)} className="h-8 text-sm" />
              </Field>
              <Field label={ii === 0 ? "Costo" : ""}>
                <Input value={item.cost} onChange={e => updateItem(ci, ii, "cost", e.target.value)} className="h-8 text-sm font-mono" />
              </Field>
              <Field label={ii === 0 ? "Nota" : ""}>
                <Input value={item.note ?? ""} onChange={e => updateItem(ci, ii, "note", e.target.value)} className="h-8 text-sm" />
              </Field>
              <button onClick={() => removeItem(ci, ii)} className="text-gray-400 hover:text-red-500 p-1 pb-2"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => addItem(ci)} className="text-xs h-6 gap-1">
            <Plus className="w-3 h-3" /> Item
          </Button>
        </div>
      ))}

      <Field label="Upsell managed services">
        <Textarea value={String(data.managedServicesUpsell ?? "")} onChange={e => set("managedServicesUpsell", e.target.value)} rows={2} className="text-sm" />
      </Field>
      <Field label="Disclaimer">
        <Input value={String(data.disclaimer ?? "")} onChange={e => set("disclaimer", e.target.value)} />
      </Field>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SECTION: SUMMARY (Resumen Ejecutivo)
// ────────────────────────────────────────────────────────────────

function SummaryForm({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  const paragraphs = (data.paragraphs as string[]) ?? [];
  const stats = (data.stats as Array<{ label: string; value: string }>) ?? [];

  const updateStat = (i: number, field: string, value: string) => {
    const next = [...stats]; next[i] = { ...next[i], [field]: value }; set("stats", next);
  };
  const addStat = () => set("stats", [...stats, { label: "", value: "" }]);
  const removeStat = (i: number) => set("stats", stats.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4">
      <Field label="Commitment quote" hint="Frase fuerte y memorable que define a IM3. No usar tópicos.">
        <Textarea value={String(data.commitmentQuote ?? "")} onChange={e => set("commitmentQuote", e.target.value)} rows={2} />
      </Field>
      <Field label={`Párrafos (${paragraphs.length})`} hint="Contexto del cliente, propuesta de IM3, transformación esperada">
        <StringListEditor
          items={paragraphs}
          onChange={v => set("paragraphs", v)}
          placeholder="Párrafo del resumen ejecutivo"
        />
      </Field>
      <div>
        <Label className="text-xs font-medium text-gray-700 mb-2 block">Stats ({stats.length})</Label>
        <div className="space-y-2">
          {stats.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_30px] gap-2 items-end">
              <Field label={i === 0 ? "Label" : ""}>
                <Input value={s.label} onChange={e => updateStat(i, "label", e.target.value)} className="h-8 text-sm" placeholder="Tiempo de desarrollo" />
              </Field>
              <Field label={i === 0 ? "Valor" : ""}>
                <Input value={s.value} onChange={e => updateStat(i, "value", e.target.value)} className="h-8 text-sm font-mono font-semibold" placeholder="16 semanas" />
              </Field>
              <button onClick={() => removeStat(i)} className="text-gray-400 hover:text-red-500 p-1 pb-2"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addStat} className="text-xs h-7 gap-1">
            <Plus className="w-3 h-3" /> Agregar stat
          </Button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SECTION: SOLUTION (Nuestra Solución)
// ────────────────────────────────────────────────────────────────

function SolutionForm({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  const modules = (data.modules as Array<{ number: number; title: string; description: string; solves: string }>) ?? [];

  const updateModule = (i: number, field: string, value: unknown) => {
    const next = [...modules]; next[i] = { ...next[i], [field]: value }; set("modules", next);
  };
  const addModule = () => set("modules", [...modules, { number: modules.length + 1, title: "", description: "", solves: "" }]);
  const removeModule = (i: number) => set("modules", modules.filter((_, idx) => idx !== i).map((m, idx) => ({ ...m, number: idx + 1 })));
  const moduleDrag = useDragReorder(modules, (v) => set("modules", v.map((m, idx) => ({ ...m, number: idx + 1 }))));

  return (
    <div className="space-y-4">
      <Field label="Heading" hint="Ej: 'Plataforma Integral de RRHH y Operaciones'">
        <Input value={String(data.heading ?? "")} onChange={e => set("heading", e.target.value)} />
      </Field>
      <Field label="Intro" hint="2-3 líneas explicando la filosofía de la solución">
        <Textarea value={String(data.intro ?? "")} onChange={e => set("intro", e.target.value)} rows={2} className="text-sm" />
      </Field>
      <div>
        <Label className="text-xs font-medium text-gray-700 mb-2 block">Módulos ({modules.length})</Label>
        <div className="space-y-3">
          {modules.map((m, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-3 relative cursor-grab active:cursor-grabbing" draggable onDragStart={moduleDrag.onDragStart(i)} onDragOver={moduleDrag.onDragOver(i)} onDragEnd={moduleDrag.onDragEnd}>
              <button onClick={() => removeModule(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-[#2FA4A9] bg-[#2FA4A9]/10 rounded-full w-6 h-6 flex items-center justify-center">{m.number}</span>
                <span className="text-sm font-medium text-gray-700">Módulo {m.number}</span>
              </div>
              <Field label="Título">
                <AiFieldHelper value={m.title} onChange={v => updateModule(i, "title", v)} context="Título de módulo de solución">
                  <Input value={m.title} onChange={e => updateModule(i, "title", e.target.value)} className="h-8 text-sm" placeholder="Control Inteligente de Asistencia" />
                </AiFieldHelper>
              </Field>
              <Field label="Descripción" hint="Qué hace este módulo">
                <AiFieldHelper value={m.description} onChange={v => updateModule(i, "description", v)} context="Descripción de módulo de solución">
                  <Textarea value={m.description} onChange={e => updateModule(i, "description", e.target.value)} rows={2} className="text-sm" />
                </AiFieldHelper>
              </Field>
              <Field label="Resuelve" hint="Conecta con un problema card: 'Ataca directamente los $25M en horas extras'">
                <AiFieldHelper value={m.solves} onChange={v => updateModule(i, "solves", v)} context="Qué problema resuelve este módulo">
                  <Input value={m.solves} onChange={e => updateModule(i, "solves", e.target.value)} className="h-8 text-sm text-[#2FA4A9]" />
                </AiFieldHelper>
              </Field>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addModule} className="text-xs h-7 gap-1">
            <Plus className="w-3 h-3" /> Agregar módulo
          </Button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SECTION: TECH (Cómo Funciona)
// ────────────────────────────────────────────────────────────────

function TechForm({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  const features = (data.features as string[]) ?? [];

  return (
    <div className="space-y-4">
      <Field label="Heading" hint="Ej: 'Construido para durar, diseñado para usarse'">
        <Input value={String(data.heading ?? "")} onChange={e => set("heading", e.target.value)} />
      </Field>
      <Field label="Intro" hint="Lenguaje de negocio, NO técnico. 2-3 líneas.">
        <Textarea value={String(data.intro ?? "")} onChange={e => set("intro", e.target.value)} rows={2} className="text-sm" />
      </Field>
      <Field label={`Features (${features.length})`} hint="Ej: 'Funciona en celular, tablet y PC', 'Sin instalación', 'Modo offline'">
        <StringListEditor items={features} onChange={v => set("features", v)} placeholder="Feature en lenguaje de negocio" />
      </Field>
      <Field label="Stack técnico" hint="Solo para técnicos que quieran verificar. Se muestra pequeño.">
        <Input value={String(data.stack ?? "")} onChange={e => set("stack", e.target.value)} className="font-mono text-xs" placeholder="React · Node.js · PostgreSQL · Claude AI" />
      </Field>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SECTION: ROI (Retorno de Inversión)
// ────────────────────────────────────────────────────────────────

function ROIForm({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  const recoveries = (data.recoveries as Array<{ amount: string; currency: string; label: string }>) ?? [];
  const comparison = (data.comparison as Record<string, unknown>) ?? {};

  const updateRecovery = (i: number, field: string, value: string) => {
    const next = [...recoveries]; next[i] = { ...next[i], [field]: value }; set("recoveries", next);
  };
  const addRecovery = () => set("recoveries", [...recoveries, { amount: "", currency: "COP", label: "" }]);
  const removeRecovery = (i: number) => set("recoveries", recoveries.filter((_, idx) => idx !== i));
  const recoveryDrag = useDragReorder(recoveries, (v) => set("recoveries", v));

  const setComp = (key: string, value: unknown) => set("comparison", { ...comparison, [key]: value });

  return (
    <div className="space-y-4">
      <Field label="Heading">
        <Input value={String(data.heading ?? "")} onChange={e => set("heading", e.target.value)} />
      </Field>

      <div>
        <Label className="text-xs font-medium text-gray-700 mb-2 block">Recoveries ({recoveries.length})</Label>
        <div className="space-y-2">
          {recoveries.map((r, i) => (
            <div key={i} className="grid grid-cols-[100px_80px_1fr_30px] gap-2 items-end cursor-grab" draggable onDragStart={recoveryDrag.onDragStart(i)} onDragOver={recoveryDrag.onDragOver(i)} onDragEnd={recoveryDrag.onDragEnd}>
              <Field label={i === 0 ? "Monto" : ""}>
                <Input value={r.amount} onChange={e => updateRecovery(i, "amount", e.target.value)} className="h-8 text-sm font-mono font-bold" placeholder="$120M" />
              </Field>
              <Field label={i === 0 ? "Moneda" : ""}>
                <Input value={r.currency} onChange={e => updateRecovery(i, "currency", e.target.value)} className="h-8 text-sm" placeholder="COP" />
              </Field>
              <Field label={i === 0 ? "Concepto" : ""}>
                <Input value={r.label} onChange={e => updateRecovery(i, "label", e.target.value)} className="h-8 text-sm" placeholder="Ahorro anual en horas extras" />
              </Field>
              <button onClick={() => removeRecovery(i)} className="text-gray-400 hover:text-red-500 p-1 pb-2"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addRecovery} className="text-xs h-7 gap-1"><Plus className="w-3 h-3" /> Agregar</Button>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-3 space-y-3">
        <p className="text-xs font-medium text-gray-600">Comparación (barra visual)</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sin IM3 — label">
            <Input value={String(comparison.withoutLabel ?? "")} onChange={e => setComp("withoutLabel", e.target.value)} className="h-8 text-sm" />
          </Field>
          <Field label="Sin IM3 — monto">
            <Input value={String(comparison.withoutAmount ?? "")} onChange={e => setComp("withoutAmount", e.target.value)} className="h-8 text-sm font-mono text-red-600" />
          </Field>
          <Field label="Con IM3 — label">
            <Input value={String(comparison.investmentLabel ?? "")} onChange={e => setComp("investmentLabel", e.target.value)} className="h-8 text-sm" />
          </Field>
          <Field label="Con IM3 — monto">
            <Input value={String(comparison.investmentAmount ?? "")} onChange={e => setComp("investmentAmount", e.target.value)} className="h-8 text-sm font-mono text-emerald-600" />
          </Field>
        </div>
        <Field label="Caption">
          <Input value={String(comparison.caption ?? "")} onChange={e => setComp("caption", e.target.value)} className="h-8 text-sm" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Título hero ROI" hint="Ej: 'Se paga en 2.4 meses'">
          <Input value={String(data.heroTitle ?? "")} onChange={e => set("heroTitle", e.target.value)} className="font-bold" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ROI %">
            <Input value={String(data.roiPercent ?? "")} onChange={e => set("roiPercent", e.target.value)} className="h-8 text-sm font-mono font-bold text-emerald-600" placeholder="400%" />
          </Field>
          <Field label="Payback">
            <Input value={String(data.paybackMonths ?? "")} onChange={e => set("paybackMonths", e.target.value)} className="h-8 text-sm font-mono" placeholder="2.4 meses" />
          </Field>
        </div>
      </div>
      <Field label="Descripción del ROI" hint="2-3 líneas explicando la matemática del payback">
        <Textarea value={String(data.heroDescription ?? "")} onChange={e => set("heroDescription", e.target.value)} rows={3} className="text-sm" />
      </Field>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SECTION: AUTHORITY (Sobre IM3 Systems)
// ────────────────────────────────────────────────────────────────

function AuthorityForm({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  const stats = (data.stats as Array<{ num: string; label: string }>) ?? [];
  const differentiators = (data.differentiators as Array<{ icon: string; title: string; description: string }>) ?? [];

  const updateStat = (i: number, field: string, value: string) => { const next = [...stats]; next[i] = { ...next[i], [field]: value }; set("stats", next); };
  const addStat = () => set("stats", [...stats, { num: "", label: "" }]);
  const removeStat = (i: number) => set("stats", stats.filter((_, idx) => idx !== i));

  const updateDiff = (i: number, field: string, value: string) => { const next = [...differentiators]; next[i] = { ...next[i], [field]: value }; set("differentiators", next); };
  const addDiff = () => set("differentiators", [...differentiators, { icon: "🎯", title: "", description: "" }]);
  const removeDiff = (i: number) => set("differentiators", differentiators.filter((_, idx) => idx !== i));
  const diffDrag = useDragReorder(differentiators, (v) => set("differentiators", v));

  return (
    <div className="space-y-4">
      <Field label="Heading" hint="Ej: 'El equipo que lo construye' (no 'Por qué confiar en nosotros')">
        <Input value={String(data.heading ?? "")} onChange={e => set("heading", e.target.value)} />
      </Field>
      <Field label="Intro">
        <Textarea value={String(data.intro ?? "")} onChange={e => set("intro", e.target.value)} rows={2} className="text-sm" />
      </Field>

      <div>
        <Label className="text-xs font-medium text-gray-700 mb-2 block">Stats ({stats.length})</Label>
        <div className="space-y-2">
          {stats.map((s, i) => (
            <div key={i} className="grid grid-cols-[80px_1fr_30px] gap-2 items-end">
              <Field label={i === 0 ? "Número" : ""}>
                <Input value={s.num} onChange={e => updateStat(i, "num", e.target.value)} className="h-8 text-sm font-mono font-bold text-center" placeholder="15+" />
              </Field>
              <Field label={i === 0 ? "Label" : ""}>
                <Input value={s.label} onChange={e => updateStat(i, "label", e.target.value)} className="h-8 text-sm" placeholder="Proyectos entregados" />
              </Field>
              <button onClick={() => removeStat(i)} className="text-gray-400 hover:text-red-500 p-1 pb-2"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addStat} className="text-xs h-7 gap-1"><Plus className="w-3 h-3" /> Stat</Button>
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium text-gray-700 mb-2 block">Diferenciadores ({differentiators.length})</Label>
        <div className="space-y-3">
          {differentiators.map((d, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 relative cursor-grab active:cursor-grabbing" draggable onDragStart={diffDrag.onDragStart(i)} onDragOver={diffDrag.onDragOver(i)} onDragEnd={diffDrag.onDragEnd}>
              <button onClick={() => removeDiff(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              <div className="grid grid-cols-[50px_1fr] gap-2">
                <Field label="Emoji"><Input value={d.icon} onChange={e => updateDiff(i, "icon", e.target.value)} className="text-center" /></Field>
                <Field label="Título"><Input value={d.title} onChange={e => updateDiff(i, "title", e.target.value)} /></Field>
              </div>
              <Field label="Descripción">
                <Textarea value={d.description} onChange={e => updateDiff(i, "description", e.target.value)} rows={2} className="text-sm" />
              </Field>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addDiff} className="text-xs h-7 gap-1"><Plus className="w-3 h-3" /> Diferenciador</Button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SECTION: HARDWARE (Equipos físicos)
// ────────────────────────────────────────────────────────────────

function HardwareForm({ data, set }: { data: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  const items = (data.items as Array<{ name: string; description: string; quantity: number; unitPriceUSD: string; totalPriceUSD: string; notes?: string; paidBy: string }>) ?? [];

  const updateItem = (i: number, field: string, value: unknown) => {
    const next = [...items]; next[i] = { ...next[i], [field]: value }; set("items", next);
  };
  const addItem = () => set("items", [...items, { name: "", description: "", quantity: 1, unitPriceUSD: "", totalPriceUSD: "", notes: "", paidBy: "cliente-compra" }]);
  const removeItem = (i: number) => set("items", items.filter((_, idx) => idx !== i));
  const hwDrag = useDragReorder(items, (v) => set("items", v));

  return (
    <div className="space-y-4">
      <Field label="Heading">
        <Input value={String(data.heading ?? "")} onChange={e => set("heading", e.target.value)} />
      </Field>
      <Field label="Intro">
        <Textarea value={String(data.intro ?? "")} onChange={e => set("intro", e.target.value)} rows={2} className="text-sm" />
      </Field>

      <div>
        <Label className="text-xs font-medium text-gray-700 mb-2 block">Equipos ({items.length})</Label>
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 relative cursor-grab active:cursor-grabbing" draggable onDragStart={hwDrag.onDragStart(i)} onDragOver={hwDrag.onDragOver(i)} onDragEnd={hwDrag.onDragEnd}>
              <button onClick={() => removeItem(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              <Field label="Nombre del equipo" hint="Marca + modelo específico. Ej: 'ZKTeco ZK4500 USB'">
                <Input value={item.name} onChange={e => updateItem(i, "name", e.target.value)} />
              </Field>
              <Field label="Descripción">
                <Textarea value={item.description} onChange={e => updateItem(i, "description", e.target.value)} rows={2} className="text-sm" />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Cantidad">
                  <Input type="number" value={item.quantity} onChange={e => updateItem(i, "quantity", parseInt(e.target.value) || 1)} className="h-8 text-sm font-mono text-center" />
                </Field>
                <Field label="Precio unitario">
                  <Input value={item.unitPriceUSD} onChange={e => updateItem(i, "unitPriceUSD", e.target.value)} className="h-8 text-sm font-mono" placeholder="$60 USD" />
                </Field>
                <Field label="Total">
                  <Input value={item.totalPriceUSD} onChange={e => updateItem(i, "totalPriceUSD", e.target.value)} className="h-8 text-sm font-mono font-bold" placeholder="$120 USD" />
                </Field>
              </div>
              <Field label="Notas" hint="Marcas recomendadas, dónde comprar, por qué esta cantidad">
                <Input value={item.notes ?? ""} onChange={e => updateItem(i, "notes", e.target.value)} className="text-sm" />
              </Field>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addItem} className="text-xs h-7 gap-1"><Plus className="w-3 h-3" /> Agregar equipo</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Subtotal hardware">
          <Input value={String(data.subtotalUSD ?? "")} onChange={e => set("subtotalUSD", e.target.value)} className="font-mono font-bold" placeholder="$120 USD" />
        </Field>
      </div>
      <Field label="Nota de acompañamiento" hint="Cómo IM3 apoya la compra">
        <Textarea value={String(data.recommendationNote ?? "")} onChange={e => set("recommendationNote", e.target.value)} rows={2} className="text-sm" />
      </Field>
      <Field label="Disclaimer">
        <Input value={String(data.disclaimer ?? "")} onChange={e => set("disclaimer", e.target.value)} />
      </Field>
    </div>
  );
}
