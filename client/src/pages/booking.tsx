import { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Clock, CheckCircle2, ShieldCheck, Cpu, BarChart3 } from "lucide-react";

export default function Booking() {

  useEffect(() => {
    document.title = "Agendar Diagnóstico | IM3 Systems";

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
  }, []);

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

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-gray-200 relative overflow-hidden flex flex-col">
      {/* Background Grid */}
      <div className="fixed inset-0 technical-grid pointer-events-none -z-10" />

      {/* System Status Bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-foreground z-50" />
      <div className="w-full border-b border-border bg-background/80 backdrop-blur-sm z-40 sticky top-0">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between text-[10px] font-mono tracking-widest uppercase text-muted-foreground">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/assets/im3-logo.png" alt="IM3" className="h-5 w-auto" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span>Booking Active</span>
          </div>
          <div className="hidden sm:block">IM3.OS v2.4</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-grow">
        <div className="max-w-6xl mx-auto px-6 py-8 md:py-14">

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

            <h1 className="text-3xl md:text-5xl font-medium tracking-tight mb-6 text-primary max-w-2xl leading-[1.1]">
              Diagnóstico de IA y Tecnología
            </h1>

            <div className="flex items-center gap-3 text-muted-foreground text-sm font-medium border-l-2 border-primary pl-4">
              <Clock className="w-4 h-4 text-primary" />
              <span>30 minutos · Evaluación técnica</span>
            </div>
          </motion.header>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,580px)] gap-10 lg:gap-12">

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

                <div className="bg-white border border-border p-6 relative overflow-hidden">
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-4">Enfoque de la sesión:</p>
                  <div className="grid gap-3">
                    {["Casos de uso reales de IA en tu sector", "Análisis de viabilidad técnica", "Roadmap de implementación sugerido"].map((item, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm text-gray-700 bg-gray-50/50 p-3 border border-transparent hover:border-border transition-colors rounded-sm">
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
              <div className="bg-white border border-border overflow-hidden shadow-sm">
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
                  style={{ width: '100%', border: 'none', overflow: 'hidden', minHeight: '650px' }}
                  scrolling="no"
                  id="e1UKFLu5HkQcVg5aZdei_1769311894804"
                  className="w-full bg-white"
                />
              </div>

              <div className="mt-4 flex justify-center items-center gap-3 opacity-60">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-wide">
                    Confirmación automática vía email
                  </p>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </div>

      {/* Footer */}
      <motion.footer
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-10%" }}
        variants={sectionVariants}
        className="border-t border-border bg-gray-50 mt-10"
      >
        <div className="max-w-6xl mx-auto px-6 py-3 flex justify-between text-[10px] text-muted-foreground font-mono uppercase">
          <span>IM3 Systems</span>
          <span>Secure Connection</span>
          <span>IM3 © 2026</span>
        </div>
      </motion.footer>
    </div>
  );
}
