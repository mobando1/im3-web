import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { CheckCircle2, Download, Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SECTION_LABELS: Record<string, string> = {
  resumen: "Resumen Ejecutivo",
  problema: "El Problema",
  solucion: "Nuestra Solución",
  alcance: "Alcance y Fases",
  tecnologia: "Stack Técnico",
  inversion: "Inversión",
  roi: "ROI Estimado",
  equipo: "Sobre IM3 Systems",
  siguientes_pasos: "Próximos Pasos",
};

const SECTION_ORDER = ["resumen", "problema", "solucion", "alcance", "tecnologia", "inversion", "roi", "equipo", "siguientes_pasos"];

export default function ProposalView() {
  const { token } = useParams<{ token: string }>();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [acceptName, setAcceptName] = useState("");
  const [showAccept, setShowAccept] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const { data: proposal, isLoading, error } = useQuery<any>({
    queryKey: [`/api/proposal/${token}`],
  });

  // Track views
  useEffect(() => {
    if (!proposal) return;
    const interval = setInterval(() => {
      const active = Object.entries(sectionRefs.current).find(([_, el]) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight / 2 && rect.bottom > 0;
      });
      if (active) {
        fetch(`/api/proposal/${token}/track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: active[0], timeSpent: 30, device: window.innerWidth < 768 ? "mobile" : "desktop" }),
        }).catch(() => {});
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [proposal, token]);

  const acceptMut = useMutation({
    mutationFn: async () => {
      await fetch(`/api/proposal/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: acceptName, selectedOption }),
      });
    },
    onSuccess: () => setAccepted(true),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#2FA4A9] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-gray-500 font-medium">Propuesta no encontrada</p>
          <p className="text-gray-400 text-sm">El link puede haber expirado o ser incorrecto.</p>
        </div>
      </div>
    );
  }

  const sections = proposal.sections || {};
  const pricing = proposal.pricing;
  const timeline = proposal.timelineData;

  if (accepted || proposal.status === "accepted") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Propuesta aceptada</h1>
          <p className="text-gray-500">Gracias por confiar en IM3 Systems. Nos pondremos en contacto contigo pronto para dar inicio al proyecto.</p>
          <a href="https://www.im3systems.com/booking" className="inline-flex items-center gap-2 bg-[#2FA4A9] text-white px-6 py-3 rounded-xl font-medium hover:bg-[#238b8f] transition-colors">
            <Calendar className="w-4 h-4" /> Agendar reunión de inicio
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-[#0F172A] to-[#1E293B] rounded-lg flex items-center justify-center">
                <span className="text-white text-xs font-bold">IM3</span>
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900">Propuesta Comercial</h1>
                <p className="text-xs text-gray-400">{proposal.contactEmpresa}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => {
              const el = document.getElementById("pricing-section");
              el?.scrollIntoView({ behavior: "smooth" });
            }}>
              Ver inversión <ChevronDown className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-br from-[#0F172A] to-[#1E293B] text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-3">
          <p className="text-[#2FA4A9] text-sm font-medium uppercase tracking-wider">Propuesta comercial</p>
          <h1 className="text-3xl sm:text-4xl font-bold">{proposal.title}</h1>
          <p className="text-gray-400 text-sm">
            Preparada para <strong className="text-white">{proposal.contactName}</strong> · {new Date(proposal.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Sections */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {SECTION_ORDER.map(key => {
          if (!sections[key]) return null;
          return (
            <section
              key={key}
              ref={el => { sectionRefs.current[key] = el; }}
              className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100">
                {SECTION_LABELS[key]}
              </h2>
              <div
                className="prose prose-sm max-w-none text-gray-600 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sections[key] }}
              />
            </section>
          );
        })}

        {/* Pricing section */}
        {pricing?.options && (
          <section id="pricing-section" className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-100">Inversión</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {pricing.options.map((opt: any, idx: number) => (
                <div
                  key={idx}
                  onClick={() => setSelectedOption(opt.name)}
                  className={`rounded-xl border-2 p-5 cursor-pointer transition-all ${
                    selectedOption === opt.name
                      ? "border-[#2FA4A9] bg-[#2FA4A9]/5 shadow-md"
                      : opt.recommended
                        ? "border-[#2FA4A9]/30 bg-[#2FA4A9]/5"
                        : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">{opt.name}</h3>
                    {opt.recommended && <span className="text-[10px] bg-[#2FA4A9] text-white px-2 py-0.5 rounded-full font-medium">Recomendado</span>}
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mb-4">
                    ${opt.price?.toLocaleString()} <span className="text-sm text-gray-400 font-normal">{pricing.currency}</span>
                  </p>
                  <ul className="space-y-2">
                    {opt.features?.map((f: string, i: number) => (
                      <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  {selectedOption === opt.name && (
                    <div className="mt-4 pt-3 border-t border-[#2FA4A9]/20 text-center">
                      <span className="text-sm text-[#2FA4A9] font-medium">Seleccionado ✓</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {pricing.paymentOptions && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 font-medium mb-2">Opciones de pago disponibles:</p>
                <div className="flex flex-wrap gap-2">
                  {pricing.paymentOptions.map((po: string, i: number) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full">{po}</span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Timeline */}
        {timeline?.phases && (
          <section className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-100">Timeline del Proyecto</h2>
            <p className="text-sm text-gray-500 mb-4">Duración estimada: <strong>{timeline.totalWeeks} semanas</strong></p>
            <div className="space-y-3">
              {timeline.phases.map((phase: any, idx: number) => (
                <div key={idx} className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#2FA4A9]/10 text-[#2FA4A9] flex items-center justify-center text-sm font-bold shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 pb-3 border-b border-gray-50">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900 text-sm">{phase.name}</h3>
                      <span className="text-xs text-gray-400">{phase.weeks} sem.</span>
                    </div>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {phase.deliverables?.map((d: string, i: number) => (
                        <li key={i} className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{d}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Accept CTA */}
        <section className="bg-gradient-to-br from-[#0F172A] to-[#1E293B] rounded-2xl p-8 text-center text-white space-y-4">
          <h2 className="text-2xl font-bold">¿Listo para empezar?</h2>
          <p className="text-gray-400 max-w-md mx-auto">Acepta la propuesta y agendaremos la reunión de inicio para arrancar tu proyecto.</p>

          {!showAccept ? (
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button
                size="lg"
                onClick={() => setShowAccept(true)}
                className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white gap-2"
              >
                <CheckCircle2 className="w-5 h-5" /> Aceptar propuesta
              </Button>
              <a href="https://www.im3systems.com/booking" target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 gap-2 w-full">
                  <Calendar className="w-5 h-5" /> Agendar llamada
                </Button>
              </a>
            </div>
          ) : (
            <div className="max-w-sm mx-auto space-y-3 pt-2">
              {!selectedOption && pricing?.options?.length > 0 && (
                <p className="text-amber-400 text-sm">Selecciona una opción de precio arriba antes de aceptar.</p>
              )}
              <Input
                value={acceptName}
                onChange={e => setAcceptName(e.target.value)}
                placeholder="Tu nombre completo"
                className="bg-white/10 border-white/20 text-white placeholder:text-gray-500"
              />
              <label className="flex items-start gap-2 text-left text-sm text-gray-400">
                <input type="checkbox" id="terms" className="mt-0.5 rounded border-gray-600" />
                Acepto los términos de esta propuesta comercial
              </label>
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"
                disabled={!acceptName || acceptMut.isPending}
                onClick={() => acceptMut.mutate()}
              >
                <CheckCircle2 className="w-4 h-4" />
                {acceptMut.isPending ? "Procesando..." : "Confirmar aceptación"}
              </Button>
              <button onClick={() => setShowAccept(false)} className="text-xs text-gray-500 hover:text-gray-300">Cancelar</button>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="text-center py-8 space-y-2">
          <p className="text-xs text-gray-400">Propuesta preparada por IM3 Systems</p>
          <p className="text-xs text-gray-300">IA, automatización y desarrollo de software para empresas</p>
        </footer>
      </main>
    </div>
  );
}
