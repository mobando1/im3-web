import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, CheckCircle2, ShieldCheck, Cpu, BarChart3, ArrowRight, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import DiagnosticForm from "@/components/diagnostic-form/DiagnosticForm";

type Phase = "calendar" | "form";

export default function Booking() {
  const [phase, setPhase] = useState<Phase>("calendar");

  useEffect(() => {
    document.title = phase === "calendar"
      ? "Agendar Diagnóstico | IM3 Systems"
      : "Formulario de Diagnóstico | IM3 Systems";

    const script = document.createElement("script");
    script.src = "https://link.msgsndr.com/js/form_embed.js";
    script.type = "text/javascript";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.title = "IM3 Systems | Desarrollo de software, automatización e inteligencia artificial para empresas";
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [phase]);

  const sectionVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number]
      }
    }
  };

  const handleContinueToForm = () => {
    setPhase("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-primary/20 relative overflow-hidden flex flex-col">
      {/* Background Grid */}
      <div className="fixed inset-0 technical-grid pointer-events-none -z-10" />

      {/* System Status Bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-foreground z-50" />
      <div className="w-full border-b border-border bg-background/80 backdrop-blur-sm z-40 sticky top-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between text-[10px] font-mono tracking-widest uppercase text-muted-foreground">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/assets/im3-logo.png" alt="IM3" className="h-5 w-auto" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span>{phase === "calendar" ? "Booking Active" : "Diagnóstico"}</span>
          </div>
          <div className="hidden sm:block">IM3.OS v2.4</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-grow">
        <AnimatePresence mode="wait">
          {phase === "calendar" ? (
            <motion.div
              key="calendar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-14"
            >
              {/* Page Header */}
              <motion.header
                initial="hidden"
                animate="visible"
                variants={sectionVariants}
                className="mb-10"
              >
                <div className="mono-tag mb-6 text-tech border border-tech/20 inline-block px-2 py-1 rounded-[2px] bg-tech/5">
                  SESIÓN ESTRATÉGICA
                </div>

                <h1 className="text-2xl sm:text-3xl md:text-5xl font-medium tracking-tight mb-6 text-primary max-w-2xl leading-[1.1]">
                  Diagnóstico de IA y Tecnología
                </h1>

                <div className="flex items-center gap-3 text-muted-foreground text-sm font-medium border-l-2 border-primary pl-4">
                  <Clock className="w-4 h-4 text-primary" />
                  <span>30 minutos · Evaluación técnica</span>
                </div>
              </motion.header>

              {/* Two Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,580px)] gap-6 sm:gap-8 lg:gap-12">

                {/* LEFT: Info Content */}
                <div className="space-y-10 order-2 lg:order-1">

                  {/* Section 01 — El Objetivo */}
                  <motion.section
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-10%" }}
                    variants={sectionVariants}
                  >
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
                      01 <span className="w-8 h-px bg-border inline-block" /> El Objetivo
                    </h2>

                    <div className="tech-card group p-6 hover:border-foreground/30 hover:shadow-sm">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                          <Cpu className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-foreground mb-2">Diagnóstico Técnico</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            Identificar oportunidades concretas donde la <strong className="text-foreground font-medium">Inteligencia Artificial</strong> y la tecnología moderna pueden optimizar tus operaciones empresariales. Sin generalidades.
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.section>

                  {/* Section 02 — Entregable */}
                  <motion.section
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-10%" }}
                    variants={sectionVariants}
                  >
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
                      02 <span className="w-8 h-px bg-border inline-block" /> Entregable
                    </h2>

                    <div className="tech-card group p-6 hover:border-foreground/30 hover:shadow-sm">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                          <BarChart3 className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-foreground mb-2">Entregable Directo</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            Te diremos exactamente <strong className="text-foreground font-medium">qué procesos se pueden automatizar</strong> hoy y qué tecnologías son viables para tu infraestructura actual.
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.section>

                  {/* Section 03 — Enfoque */}
                  <motion.section
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-10%" }}
                    variants={sectionVariants}
                  >
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
                      03 <span className="w-8 h-px bg-border inline-block" /> Enfoque
                    </h2>

                    <div className="bg-card border border-border p-6 relative overflow-hidden">
                      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-4">Enfoque de la sesión:</p>
                      <div className="grid gap-3">
                        {["Casos de uso reales de IA en tu sector", "Análisis de viabilidad técnica", "Roadmap de implementación sugerido"].map((item, i) => (
                          <div key={i} className="flex items-center gap-3 text-sm text-foreground/80 bg-muted/30 p-3 border border-transparent hover:border-border transition-colors rounded-sm">
                            <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <CheckCircle2 className="w-3 h-3 text-primary" />
                            </div>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.section>

                  {/* Disclaimer */}
                  <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-10%" }}
                    variants={sectionVariants}
                    className="flex items-start gap-3 px-4 py-3 bg-tech/5 border border-tech/20"
                  >
                    <ShieldCheck className="w-5 h-5 text-tech shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Si no vemos una aplicación clara de tecnología para tu caso, te lo diremos.{" "}
                      <span className="text-foreground font-medium">Diagnóstico técnico, no comercial.</span>
                    </p>
                  </motion.div>
                </div>

                {/* RIGHT: Calendar Embed */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="order-1 lg:order-2 lg:sticky lg:top-20 lg:self-start"
                >
                  <div className="bg-card border border-border overflow-hidden shadow-sm">
                    {/* Calendar header bar */}
                    <div className="border-b border-border px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                        <span className="mono-tag text-muted-foreground">Seleccionar horario</span>
                      </div>
                      <span className="mono-tag text-muted-foreground">CAL-IM3</span>
                    </div>

                    <iframe
                      src="https://api.leadconnectorhq.com/widget/booking/e1UKFLu5HkQcVg5aZdei"
                      title="Calendario de reservas IM3 Systems"
                      loading="lazy"
                      style={{ width: '100%', border: 'none', overflow: 'hidden', minHeight: '550px' }}
                      scrolling="no"
                      id="e1UKFLu5HkQcVg5aZdei_1769311894804"
                      className="w-full bg-card"
                    />
                  </div>

                  {/* CTA to continue to form */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.8 }}
                    className="mt-6 space-y-3"
                  >
                    <Button
                      onClick={handleContinueToForm}
                      className="w-full gap-2 h-12 text-sm"
                      size="lg"
                    >
                      <ClipboardList className="w-4 h-4" />
                      Ya agendé — Continuar al diagnóstico
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                    <p className="text-[10px] text-center text-muted-foreground font-mono uppercase tracking-wide">
                      Formulario de preparación para la sesión
                    </p>
                  </motion.div>
                </motion.div>

              </div>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-14"
            >
              {/* Form Header */}
              <motion.header
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="mb-10"
              >
                <div className="mono-tag mb-6 text-tech border border-tech/20 inline-block px-2 py-1 rounded-[2px] bg-tech/5">
                  PRE-FORMULARIO
                </div>

                <h1 className="text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight mb-4 text-primary max-w-2xl leading-[1.1]">
                  Diagnóstico Empresarial
                </h1>

                <p className="text-sm text-muted-foreground max-w-xl leading-relaxed mb-4">
                  Este diagnóstico nos permite comprender cómo funciona su operación, identificar oportunidades de mejora y diseñar una hoja de ruta tecnológica personalizada.
                </p>

                <div className="flex items-start gap-3 px-4 py-3 bg-tech/5 border border-tech/20 max-w-xl">
                  <ShieldCheck className="w-4 h-4 text-tech shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Todas las respuestas son tratadas con <span className="text-foreground font-medium">absoluta confidencialidad</span> y se utilizan exclusivamente para su informe personalizado.
                  </p>
                </div>
              </motion.header>

              <DiagnosticForm />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <motion.footer
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-10%" }}
        variants={sectionVariants}
        className="border-t border-border bg-muted/50 mt-10"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col items-center gap-1 sm:flex-row sm:justify-between text-[10px] text-muted-foreground font-mono uppercase">
          <span>IM3 Systems</span>
          <span>Secure Connection</span>
          <span>IM3 © 2026</span>
        </div>
      </motion.footer>
    </div>
  );
}
