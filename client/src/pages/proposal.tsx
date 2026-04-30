import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { ProposalTemplate } from "@shared/proposal-template";
import type { ProposalData } from "@shared/proposal-template/types";
import {
  CheckCircle2, Download, Calendar, ChevronDown, ChevronRight,
  AlertTriangle, Quote, ArrowDown, TrendingUp, Shield, Clock, Zap,
  Star, Users, Target, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { cn } from "@/lib/utils";

// ─── Labels & Order ────────────────────────────────────────
const SECTION_LABELS: Record<string, string> = {
  resumen: "Resumen Ejecutivo",
  problema: "El Problema",
  costo_inaccion: "El Costo de No Actuar",
  solucion: "Nuestra Solución",
  alcance: "Alcance del Proyecto",
  tecnologia: "Tecnología",
  casos_exito: "Proyectos Anteriores",
  inversion: "Tu Inversión",
  roi: "Retorno de Inversión",
  equipo: "Sobre IM3 Systems",
  siguientes_pasos: "Próximos Pasos",
};

const SECTION_ORDER = [
  "resumen", "problema", "costo_inaccion", "solucion", "alcance",
  "tecnologia", "casos_exito", "inversion", "roi", "equipo", "siguientes_pasos",
];

// ─── Section visual config ────────────────────────────────
const SECTION_ICONS: Record<string, React.ReactNode> = {
  resumen: <Target className="w-5 h-5" />,
  problema: <AlertTriangle className="w-5 h-5" />,
  costo_inaccion: <DollarSign className="w-5 h-5" />,
  solucion: <Zap className="w-5 h-5" />,
  alcance: <ChevronRight className="w-5 h-5" />,
  tecnologia: <Shield className="w-5 h-5" />,
  casos_exito: <Star className="w-5 h-5" />,
  roi: <TrendingUp className="w-5 h-5" />,
  equipo: <Users className="w-5 h-5" />,
  siguientes_pasos: <Clock className="w-5 h-5" />,
};

type SectionStyle = {
  wrapper: string;
  header: string;
  prose: string;
  iconBg: string;
};

const SECTION_STYLES: Record<string, SectionStyle> = {
  resumen: {
    wrapper: "bg-white border-l-4 border-[#2FA4A9] rounded-2xl border-r border-t border-b border-r-gray-200 border-t-gray-200 border-b-gray-200 shadow-sm",
    header: "text-gray-900",
    prose: "prose-lg text-gray-600",
    iconBg: "bg-[#2FA4A9]/10 text-[#2FA4A9]",
  },
  problema: {
    wrapper: "bg-gradient-to-br from-[#0F172A] to-[#1E293B] rounded-2xl shadow-lg",
    header: "text-white",
    prose: "prose-invert text-gray-300",
    iconBg: "bg-red-500/15 text-red-400",
  },
  costo_inaccion: {
    wrapper: "bg-gradient-to-br from-red-950/90 to-[#1E293B] rounded-2xl shadow-lg",
    header: "text-white",
    prose: "prose-invert text-gray-300",
    iconBg: "bg-red-500/15 text-red-400",
  },
  solucion: {
    wrapper: "bg-gradient-to-br from-[#2FA4A9]/5 to-[#2FA4A9]/10 rounded-2xl border border-[#2FA4A9]/20 shadow-sm",
    header: "text-gray-900",
    prose: "text-gray-600",
    iconBg: "bg-[#2FA4A9]/10 text-[#2FA4A9]",
  },
  tecnologia: {
    wrapper: "bg-white rounded-2xl border border-gray-200 shadow-sm",
    header: "text-gray-900",
    prose: "text-gray-600",
    iconBg: "bg-blue-100 text-blue-600",
  },
  equipo: {
    wrapper: "bg-white rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden",
    header: "text-gray-900",
    prose: "text-gray-600",
    iconBg: "bg-[#2FA4A9]/10 text-[#2FA4A9]",
  },
  siguientes_pasos: {
    wrapper: "bg-white rounded-2xl border border-gray-200 shadow-sm",
    header: "text-gray-900",
    prose: "text-gray-600",
    iconBg: "bg-emerald-100 text-emerald-600",
  },
};

const defaultStyle: SectionStyle = {
  wrapper: "bg-white rounded-2xl border border-gray-200 shadow-sm",
  header: "text-gray-900",
  prose: "text-gray-600",
  iconBg: "bg-gray-100 text-gray-600",
};

// ─── Utility: Reveal ──────────────────────────────────────
const Reveal = ({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { threshold: 0.1 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("transition-all duration-700 ease-out", isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8", className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

// ─── Utility: useScrollProgress ───────────────────────────
function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(h > 0 ? Math.round((window.scrollY / h) * 100) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return progress;
}

// ─── Utility: useCountUp ─────────────────────────────────
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setStarted(true); obs.disconnect(); } }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [started, target, duration]);

  return { value, ref };
}

// ─── Utility: active section tracker ──────────────────────
function useActiveSection(sectionRefs: React.MutableRefObject<Record<string, HTMLElement | null>>) {
  const [active, setActive] = useState("");
  useEffect(() => {
    const onScroll = () => {
      const entries = Object.entries(sectionRefs.current);
      for (const [key, el] of entries) {
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight / 2 && rect.bottom > 100) {
          setActive(key);
          return;
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [sectionRefs]);
  return active;
}

// ─── CountUpPrice (inline) ────────────────────────────────
function CountUpPrice({ value: target, className }: { value: number; className?: string }) {
  const { value, ref } = useCountUp(target);
  return <span ref={ref} className={className}>${value.toLocaleString()}</span>;
}

// ─── Cost of Inaction Chart ───────────────────────────────
function CostInactionChart({ annualCost }: { annualCost: number }) {
  const monthly = annualCost / 12;
  const data = Array.from({ length: 12 }, (_, i) => ({
    month: `M${i + 1}`,
    costo: Math.round(monthly * (i + 1)),
  }));
  return (
    <div className="mt-6 print:hidden">
      <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wider">Costo acumulado de no actuar (12 meses)</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <XAxis dataKey="month" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            formatter={(v: number) => [`$${v.toLocaleString()}`, "Costo acumulado"]}
            contentStyle={{ backgroundColor: "#1E293B", border: "none", borderRadius: "8px", color: "#fff", fontSize: 12 }}
          />
          <Bar dataKey="costo" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={`rgba(239,68,68,${0.3 + (i / 12) * 0.7})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── ROI Comparison Chart ─────────────────────────────────
function ROIChart({ projectCost }: { projectCost: number }) {
  const costWithout = Math.round(projectCost * 4);
  const data = [
    { name: "Sin automatizar\n(12 meses)", value: costWithout, fill: "#6B7280" },
    { name: "Inversión\ncon IM3", value: projectCost, fill: "#2FA4A9" },
  ];
  const savings = costWithout - projectCost;
  return (
    <div className="mt-6 print:hidden">
      <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wider">Comparativa de costos (estimada)</p>
      <div className="bg-gray-50 rounded-xl p-5">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} layout="vertical" barSize={36}>
            <XAxis type="number" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#374151", fontSize: 12 }} axisLine={false} tickLine={false} width={110} />
            <Tooltip
              formatter={(v: number) => [`$${v.toLocaleString()}`, ""]}
              contentStyle={{ backgroundColor: "#fff", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: 12 }}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-center gap-2 mt-3">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-emerald-700">Ahorro estimado: ${savings.toLocaleString()} USD</span>
        </div>
      </div>
    </div>
  );
}

// ─── Gantt Timeline ───────────────────────────────────────
function GanttTimeline({ phases, totalWeeks }: { phases: Array<{ name: string; weeks: number; deliverables?: string[] }>; totalWeeks: number }) {
  const colors = ["#2FA4A9", "#3B82F6", "#8B5CF6", "#F59E0B", "#10B981", "#EC4899"];
  return (
    <div className="space-y-3">
      {/* Desktop: horizontal bars */}
      <div className="hidden sm:block space-y-2">
        {phases.map((phase, idx) => {
          const pct = Math.max((phase.weeks / totalWeeks) * 100, 20);
          return (
            <div key={idx}>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs text-gray-500 w-6 text-right font-medium">{idx + 1}</span>
                <div className="flex-1">
                  <div
                    className="rounded-lg px-3 py-2 text-white text-sm font-medium flex items-center justify-between transition-all hover:brightness-110"
                    style={{ width: `${pct}%`, minWidth: "180px", backgroundColor: colors[idx % colors.length] }}
                  >
                    <span className="truncate">{phase.name}</span>
                    <span className="text-xs opacity-80 shrink-0 ml-2">{phase.weeks} sem.</span>
                  </div>
                </div>
              </div>
              {phase.deliverables && phase.deliverables.length > 0 && (
                <div className="ml-9 flex flex-wrap gap-1 mb-1">
                  {phase.deliverables.map((d, i) => (
                    <span key={i} className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{d}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical stepper */}
      <div className="sm:hidden space-y-0">
        {phases.map((phase, idx) => (
          <div key={idx} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: colors[idx % colors.length] }}
              >
                {idx + 1}
              </div>
              {idx < phases.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900 text-sm">{phase.name}</h4>
                <Badge variant="secondary" className="text-[10px]">{phase.weeks} sem.</Badge>
              </div>
              {phase.deliverables && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {phase.deliverables.map((d, i) => (
                    <span key={i} className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{d}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dot Navigation (desktop) ─────────────────────────────
function DotNav({ sections, active, sectionLabels }: { sections: string[]; active: string; sectionLabels: Record<string, string> }) {
  return (
    <nav className="hidden lg:flex fixed right-5 top-1/2 -translate-y-1/2 z-20 flex-col gap-2 print:hidden">
      {sections.map((key) => (
        <button
          key={key}
          onClick={() => document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: "smooth" })}
          className="group relative flex items-center justify-end"
          title={sectionLabels[key]}
        >
          <span className="absolute right-5 bg-gray-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            {sectionLabels[key]}
          </span>
          <span className={cn(
            "w-2.5 h-2.5 rounded-full transition-all duration-300",
            active === key ? "bg-[#2FA4A9] scale-125" : "bg-gray-300 hover:bg-gray-400",
          )} />
        </button>
      ))}
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function ProposalView() {
  const { token } = useParams<{ token: string }>();
  const [selectedOption, setSelectedOption] = useState<string>("standard");
  const [acceptName, setAcceptName] = useState("");
  const [showAccept, setShowAccept] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [showMobileCta, setShowMobileCta] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const heroRef = useRef<HTMLDivElement>(null);

  const isPdfMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pdf") === "true";
  const scrollProgress = useScrollProgress();
  const activeSection = useActiveSection(sectionRefs);

  const { data: proposal, isLoading, error } = useQuery<any>({
    queryKey: [`/api/proposal/${token}`],
  });

  // Download PDF: usamos el render nativo del navegador (window.print → "Guardar como PDF").
  // Es más fiable que html2pdf/html2canvas con CSS moderno (gradientes, web fonts, position:fixed)
  // y aprovecha el print.css ya armado en shared/proposal-template/styles/print.css.
  const handleDownloadPdf = () => {
    window.print();
  };

  // Auto-print en modo ?pdf=true (para envíos automáticos)
  useEffect(() => {
    if (isPdfMode && proposal && !isLoading) {
      const t = setTimeout(() => window.print(), 800);
      return () => clearTimeout(t);
    }
  }, [isPdfMode, proposal, isLoading]);

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

  // Mobile sticky CTA: show after scrolling past hero
  useEffect(() => {
    if (!heroRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowMobileCta(!entry.isIntersecting),
      { threshold: 0 },
    );
    obs.observe(heroRef.current);
    return () => obs.disconnect();
  }, [proposal]);

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

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#2FA4A9] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Error ──
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

  // ── Nuevo formato ProposalData (con template premium) ──
  // Detecta formato por presencia de `sections.meta` y `sections.hero`.
  // Propuestas viejas no tienen estas keys → cae al render legacy de abajo.
  // En modo `?pdf=true` el template se renderiza igual; el useEffect dispara window.print().
  const rawSections = proposal.sections || {};
  const isNewFormat = rawSections.meta && rawSections.hero && rawSections.summary;
  if (isNewFormat) {
    return (
      <ProposalTemplate
        data={rawSections as ProposalData}
        interactive
        onAccept={() => setShowAccept(true)}
        onFallback={() => {
          // Scroll al CTA existente sin cerrar
        }}
      />
    );
  }

  const sections = rawSections;
  const pricing = proposal.pricing;
  const timeline = proposal.timelineData;

  // ── Accepted state ──
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

  // Visible sections for dot nav
  const visibleSections = SECTION_ORDER.filter(k => sections[k]);

  // Pricing calcs
  const priorityTotal = pricing?.total ? Math.round(pricing.total * 1.5) : 0;
  const activeTotal = selectedOption === "priority" ? priorityTotal : (pricing?.total || 0);
  const m1 = Math.round(activeTotal * 0.4);
  const m2 = Math.round(activeTotal * 0.3);
  const m3 = activeTotal - m1 - m2;

  // Casos de exito split
  const casosHtml = sections.casos_exito || "";
  const casosParts = casosHtml.split(/<h3/i).filter((p: string) => p.trim());
  const hasCasosCards = casosParts.length > 1;

  // ── Render section content ──
  const renderSection = (key: string) => {
    if (!sections[key]) return null;
    // Skip sections that get custom rendering
    if (key === "casos_exito" || key === "inversion") return null;

    const style = SECTION_STYLES[key] || defaultStyle;
    const icon = SECTION_ICONS[key];

    return (
      <Reveal key={key} delay={50}>
        <section
          id={`section-${key}`}
          ref={el => { sectionRefs.current[key] = el; }}
          className={cn(style.wrapper, "p-6 sm:p-8")}
        >
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/10">
            {icon && (
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", style.iconBg)}>
                {icon}
              </div>
            )}
            <h2 className={cn("text-xl font-bold", style.header)}>
              {SECTION_LABELS[key]}
            </h2>
          </div>
          <div
            className={cn("prose prose-sm max-w-none leading-relaxed", style.prose)}
            dangerouslySetInnerHTML={{ __html: sections[key] }}
          />
          {/* Costo de inacción chart */}
          {key === "costo_inaccion" && pricing?.total && (
            <CostInactionChart annualCost={pricing.total * 3} />
          )}
          {/* ROI chart */}
          {key === "roi" && pricing?.total && (
            <ROIChart projectCost={pricing.total} />
          )}
        </section>
      </Reveal>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Scroll Progress Bar ── */}
      <div className="fixed top-0 left-0 right-0 z-30 print:hidden">
        <div className="h-1 bg-gray-200/50">
          <div
            className="h-full bg-[#2FA4A9] transition-[width] duration-150"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
      </div>

      {/* ── Dot Navigation ── */}
      <DotNav sections={visibleSections} active={activeSection} sectionLabels={SECTION_LABELS} />

      {/* ── Header ── */}
      <header className="sticky top-1 z-20 bg-white/95 backdrop-blur border-b border-gray-200 print:static print:bg-white print:border-none">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-[#0F172A] to-[#1E293B] rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">IM3</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900">Propuesta Comercial</h1>
              <p className="text-xs text-gray-400">{proposal.contactEmpresa}</p>
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button
              size="sm"
              className="gap-1.5 text-xs bg-[#2FA4A9] hover:bg-[#238b8f] text-white cta-glow"
              onClick={() => document.getElementById("pricing-section")?.scrollIntoView({ behavior: "smooth" })}
            >
              Ver inversión <ChevronDown className="w-3 h-3" />
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleDownloadPdf}>
              <Download className="w-3 h-3" /> PDF
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <div ref={heroRef} className="relative bg-gradient-to-br from-[#0F172A] via-[#162033] to-[#1E293B] text-white min-h-[55vh] sm:min-h-[50vh] flex items-center justify-center px-4 overflow-hidden">
        {/* Grid pattern bg */}
        <div className="absolute inset-0 bg-grid-pattern opacity-30" />
        {/* Radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#2FA4A9]/8 blur-[100px]" />

        <div className="relative max-w-4xl mx-auto text-center space-y-5 py-16">
          <Reveal>
            <p className="text-[#2FA4A9] text-sm font-medium uppercase tracking-widest">Propuesta comercial</p>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">{proposal.title}</h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-gray-400 text-sm sm:text-base">
              Preparada para <strong className="text-white">{proposal.contactName}</strong>
              {proposal.contactEmpresa && <> · <strong className="text-white">{proposal.contactEmpresa}</strong></>}
              {" "}· {new Date(proposal.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Badge variant="outline" className="border-white/20 text-gray-300 text-xs gap-1.5 py-1">
                <Shield className="w-3 h-3" /> Propuesta personalizada
              </Badge>
              <Badge variant="outline" className="border-white/20 text-gray-300 text-xs gap-1.5 py-1">
                <Clock className="w-3 h-3" /> Precio garantizado 30 días
              </Badge>
              <Badge variant="outline" className="border-white/20 text-gray-300 text-xs gap-1.5 py-1">
                <CheckCircle2 className="w-3 h-3" /> Sin compromisos
              </Badge>
            </div>
          </Reveal>

          {/* Bounce arrow */}
          <div className="pt-8 animate-bounce print:hidden">
            <ArrowDown className="w-5 h-5 text-gray-500 mx-auto" />
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-10">
        {/* Render content sections in order */}
        {SECTION_ORDER.map(key => renderSection(key))}

        {/* ── Alcance Detallado (Accordion) ── */}
        {sections._alcanceDetallado && (() => {
          let alcance: Array<{ fase: string; areas: Array<{ nombre: string; tareas: string[] }> }> = [];
          try { alcance = JSON.parse(sections._alcanceDetallado); } catch {}
          if (alcance.length === 0) return null;
          return (
            <Reveal>
              <section
                id="section-alcance-detallado"
                ref={el => { sectionRefs.current["alcance_detallado"] = el; }}
                className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
                  <div className="w-10 h-10 rounded-xl bg-[#2FA4A9]/10 text-[#2FA4A9] flex items-center justify-center">
                    <Target className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Alcance Detallado</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Expande cada fase para ver áreas y tareas específicas</p>
                  </div>
                </div>

                <Accordion type="multiple" className="space-y-2">
                  {alcance.map((fase, fi) => (
                    <AccordionItem key={fi} value={`fase-${fi}`} className="border border-gray-200 rounded-xl overflow-hidden px-0">
                      <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-8 h-8 rounded-full bg-[#2FA4A9] text-white flex items-center justify-center text-sm font-bold shrink-0">
                            {fi + 1}
                          </div>
                          <span className="font-semibold text-gray-900 text-sm text-left">{fase.fase}</span>
                          <Badge variant="secondary" className="ml-auto mr-2 text-[10px]">
                            {fase.areas.reduce((sum, a) => sum + a.tareas.length, 0)} tareas
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-5 pb-4 pt-0">
                        <Accordion type="multiple" className="space-y-1">
                          {fase.areas.map((area, ai) => (
                            <AccordionItem key={ai} value={`area-${fi}-${ai}`} className="border-0 border-b border-gray-50 last:border-0">
                              <AccordionTrigger className="py-2.5 hover:no-underline text-sm text-gray-700 hover:text-[#2FA4A9]">
                                <div className="flex items-center gap-2 flex-1">
                                  <span className="font-medium text-left">{area.nombre}</span>
                                  <Badge variant="outline" className="ml-auto mr-2 text-[10px] text-gray-400">
                                    {area.tareas.length}
                                  </Badge>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent>
                                <ul className="space-y-1.5 pl-1">
                                  {area.tareas.map((tarea, ti) => (
                                    <li key={ti} className="text-xs text-gray-500 flex items-start gap-2 py-0.5">
                                      <span className="w-1.5 h-1.5 bg-[#2FA4A9] rounded-full shrink-0 mt-1" />
                                      {tarea}
                                    </li>
                                  ))}
                                </ul>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
            </Reveal>
          );
        })()}

        {/* ── Casos de Éxito — Dark section ── */}
        {sections.casos_exito && (
          <Reveal>
            <section
              id="section-casos_exito"
              ref={el => { sectionRefs.current["casos_exito"] = el; }}
              className="bg-gradient-to-br from-[#0F172A] to-[#1E293B] rounded-2xl p-6 sm:p-8 shadow-lg relative overflow-hidden"
            >
              {/* Decorative quote */}
              <Quote className="absolute top-6 right-6 w-16 h-16 text-white/5" />

              <div className="flex items-center gap-3 mb-6 pb-3 border-b border-white/10">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                  <Star className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-white">{SECTION_LABELS.casos_exito}</h2>
              </div>

              {hasCasosCards ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {casosParts.map((part: string, i: number) => {
                    const html = i === 0 ? part : `<h3${part}`;
                    return (
                      <div key={i} className="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10 hover:border-white/20 transition-colors">
                        <div
                          className="prose prose-sm max-w-none prose-invert text-gray-300 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: html }}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  className="prose prose-sm max-w-none prose-invert text-gray-300 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: casosHtml }}
                />
              )}
            </section>
          </Reveal>
        )}

        {/* ── Pricing Section — Tabs ── */}
        {pricing?.total && (
          <Reveal>
            <section
              id="pricing-section"
              ref={el => { sectionRefs.current["inversion"] = el; }}
              className="bg-white rounded-2xl border-2 border-[#2FA4A9]/20 p-6 sm:p-8 shadow-md"
            >
              <div className="flex items-center gap-3 mb-6 pb-3 border-b border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-[#2FA4A9]/10 text-[#2FA4A9] flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Tu Inversión</h2>
              </div>

              {/* Tabs: Standard vs Priority */}
              <Tabs value={selectedOption} onValueChange={setSelectedOption} className="mb-6">
                <TabsList className="grid w-full grid-cols-2 h-11">
                  <TabsTrigger value="standard" className="text-sm gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Estándar
                  </TabsTrigger>
                  <TabsTrigger value="priority" className="text-sm gap-1.5">
                    <Zap className="w-3.5 h-3.5" /> Prioritario
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="standard" className="mt-4">
                  <div className="text-center py-4">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Entrega estándar · {timeline?.totalWeeks || "6-8"} semanas</p>
                    <div className="text-4xl sm:text-5xl font-bold text-gray-900">
                      <CountUpPrice value={pricing.total} />
                      <span className="text-base text-gray-400 font-normal ml-2">{pricing.currency}</span>
                    </div>
                    {priorityTotal > 0 && (
                      <Badge className="mt-3 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        Ahorras ${(priorityTotal - pricing.total).toLocaleString()} vs. prioritario
                      </Badge>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="priority" className="mt-4">
                  <div className="text-center py-4">
                    <div className="inline-block mb-3">
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">PRIORITARIO · Equipo dedicado</Badge>
                    </div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">
                      Entrega en {Math.max(Math.round((timeline?.totalWeeks || 8) / 2), 2)}-{Math.max(Math.round((timeline?.totalWeeks || 8) / 2) + 1, 3)} semanas
                    </p>
                    <div className="text-4xl sm:text-5xl font-bold text-gray-900">
                      <CountUpPrice value={priorityTotal} />
                      <span className="text-base text-gray-400 font-normal ml-2">{pricing.currency}</span>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Segmented milestone progress bar */}
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-900 mb-3">Hitos de pago</p>
                <div className="flex rounded-full overflow-hidden h-3 mb-4">
                  <div className="bg-[#2FA4A9] h-full" style={{ width: "40%" }} />
                  <div className="bg-[#3B82F6] h-full" style={{ width: "30%" }} />
                  <div className="bg-[#10B981] h-full" style={{ width: "30%" }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { n: 1, label: "Al iniciar", amount: m1, pct: "40%", desc: "Kickoff + Discovery", color: "#2FA4A9" },
                    { n: 2, label: "Prototipo funcional", amount: m2, pct: "30%", desc: "Primera versión visible", color: "#3B82F6" },
                    { n: 3, label: "Entrega final", amount: m3, pct: "30%", desc: "Proyecto completado", color: "#10B981" },
                  ].map((ms) => (
                    <div key={ms.n} className="bg-gray-50 rounded-xl p-4 text-center hover:shadow-md transition-shadow">
                      <div
                        className="w-8 h-8 rounded-full text-white flex items-center justify-center text-sm font-bold mx-auto mb-2"
                        style={{ backgroundColor: ms.color }}
                      >
                        {ms.n}
                      </div>
                      <p className="text-xs text-gray-500">{ms.label}</p>
                      <p className="text-lg font-bold text-gray-900">${ms.amount.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{ms.pct} — {ms.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Includes — pill grid */}
              {pricing.includes && (
                <div className="bg-[#2FA4A9]/5 rounded-xl p-5">
                  <p className="text-sm font-semibold text-gray-900 mb-3">Tu inversión incluye:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {pricing.includes.map((item: string, i: number) => (
                      <div key={i} className="flex items-center gap-2.5 bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                        <CheckCircle2 className="w-4 h-4 text-[#2FA4A9] shrink-0" />
                        <span className="text-sm text-gray-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </Reveal>
        )}

        {/* ── Timeline — Gantt ── */}
        {timeline?.phases && (
          <Reveal>
            <section
              id="section-timeline"
              ref={el => { sectionRefs.current["timeline"] = el; }}
              className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-6 pb-3 border-b border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Timeline del Proyecto</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Duración estimada: <strong className="text-gray-600">{timeline.totalWeeks} semanas</strong></p>
                </div>
              </div>
              <GanttTimeline phases={timeline.phases} totalWeeks={timeline.totalWeeks} />
            </section>
          </Reveal>
        )}

        {/* ── Accept CTA ── */}
        <Reveal>
          <section className="relative bg-gradient-to-br from-[#0F172A] to-[#1E293B] rounded-2xl p-8 sm:p-12 text-center text-white overflow-hidden print:hidden">
            {/* Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[#2FA4A9]/10 blur-[80px]" />

            <div className="relative space-y-5">
              <h2 className="text-2xl sm:text-3xl font-bold">¿Listo para empezar?</h2>
              <p className="text-gray-400 max-w-lg mx-auto">Acepta la propuesta y agendaremos la reunión de inicio para arrancar tu proyecto.</p>

              {/* Trust badges */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Badge variant="outline" className="border-white/15 text-gray-400 text-[11px] gap-1">
                  <Shield className="w-3 h-3" /> Garantía de satisfacción
                </Badge>
                <Badge variant="outline" className="border-white/15 text-gray-400 text-[11px] gap-1">
                  <Clock className="w-3 h-3" /> Inicio inmediato
                </Badge>
              </div>

              {!showAccept ? (
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-3">
                  <Button
                    size="lg"
                    onClick={() => setShowAccept(true)}
                    className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white gap-2 cta-glow text-base px-8"
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
                  {/* Selection summary */}
                  <div className="bg-white/5 rounded-lg px-4 py-2.5 text-sm text-gray-300">
                    {selectedOption === "priority" ? "Entrega prioritaria" : "Entrega estándar"} · <strong className="text-white">${activeTotal.toLocaleString()} {pricing?.currency}</strong>
                  </div>
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
            </div>
          </section>
        </Reveal>

        {/* ── Footer ── */}
        <footer className="text-center py-10 space-y-2">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-6 h-6 bg-gradient-to-br from-[#0F172A] to-[#1E293B] rounded-md flex items-center justify-center">
              <span className="text-white text-[8px] font-bold">IM3</span>
            </div>
            <span className="text-sm font-semibold text-gray-500">IM3 Systems</span>
          </div>
          <p className="text-xs text-gray-400">IA, automatización y desarrollo de software para empresas</p>
        </footer>
      </main>

      {/* ── Mobile Sticky CTA ── */}
      {showMobileCta && pricing?.total && (
        <div className="fixed bottom-0 left-0 right-0 z-20 md:hidden bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 print:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-gray-400">Inversión</p>
              <p className="text-lg font-bold text-gray-900">${activeTotal.toLocaleString()} <span className="text-xs text-gray-400 font-normal">{pricing.currency}</span></p>
            </div>
            <Button
              size="sm"
              className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white gap-1.5 shrink-0"
              onClick={() => {
                const el = document.querySelector(".print\\:hidden > .relative > .space-y-5");
                if (el) el.scrollIntoView({ behavior: "smooth" });
                else document.getElementById("pricing-section")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <CheckCircle2 className="w-4 h-4" /> Aceptar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
