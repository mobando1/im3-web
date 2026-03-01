import { motion, useMotionTemplate, useMotionValue, useReducedMotion } from "framer-motion";
import { MouseEvent, memo, useCallback, useEffect } from "react";
import { Link } from "wouter";

const SystemIcon = ({ type }: { type: string }) => {
  if (type === "control") {
    return (
      <svg className="w-full h-full text-current" viewBox="0 0 100 60" fill="none" stroke="currentColor" strokeWidth="1.5" role="img" aria-label="Control system">
        <rect x="10" y="10" width="30" height="20" rx="2" />
        <rect x="10" y="35" width="30" height="4" rx="1" opacity="0.5" />
        <path d="M45 20h15v20h25" strokeDasharray="4 4" />
        <circle cx="85" cy="40" r="3" />
      </svg>
    );
  }
  if (type === "auto") {
    return (
      <svg className="w-full h-full text-current" viewBox="0 0 100 60" fill="none" stroke="currentColor" strokeWidth="1.5" role="img" aria-label="Automation system">
        <circle cx="20" cy="30" r="8" />
        <path d="M28 30h14" />
        <rect x="42" y="20" width="16" height="20" rx="2" />
        <path d="M58 30h14" />
        <circle cx="80" cy="30" r="8" strokeDasharray="2 2" />
      </svg>
    );
  }
  if (type === "track") {
    return (
      <svg className="w-full h-full text-current" viewBox="0 0 100 60" fill="none" stroke="currentColor" strokeWidth="1.5" role="img" aria-label="Tracking system">
        <rect x="15" y="15" width="70" height="30" rx="2" />
        <path d="M15 25h70" opacity="0.3" />
        <path d="M30 15v30" opacity="0.3" />
        <path d="M60 15v30" opacity="0.3" />
      </svg>
    );
  }
  return (
    <svg className="w-full h-full text-current" viewBox="0 0 100 60" fill="none" stroke="currentColor" strokeWidth="1.5" role="img" aria-label="Dashboard system">
      <rect x="10" y="10" width="35" height="40" rx="2" />
      <rect x="55" y="10" width="35" height="18" rx="2" />
      <rect x="55" y="32" width="35" height="18" rx="2" />
      <path d="M20 20h15" opacity="0.5" />
      <path d="M20 28h15" opacity="0.5" />
    </svg>
  );
};

interface TechItem {
  id: string;
  title: string;
  type: string;
}

const TechCard = memo(function TechCard({ item }: { item: TechItem }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = useCallback(({ currentTarget, clientX, clientY }: MouseEvent) => {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }, [mouseX, mouseY]);

  return (
    <div
      className="tech-card group flex items-center justify-between hover:border-foreground/30 hover:shadow-sm gap-4"
      onMouseMove={handleMouseMove}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              250px circle at ${mouseX}px ${mouseY}px,
              hsl(var(--foreground) / 0.04),
              transparent 80%
            )
          `,
        }}
      />

      <div className="flex flex-col relative z-10">
        <span className="mono-tag text-[8px] opacity-50 mb-1">{item.id}</span>
        <span className="text-sm font-medium text-foreground leading-tight">{item.title}</span>
      </div>

      <div className="w-16 h-12 text-muted-foreground/30 group-hover:text-primary transition-colors duration-500 shrink-0">
        <SystemIcon type={item.type} />
      </div>
    </div>
  );
});

export default function Confirmed() {
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    document.title = "Sesión Confirmada | IM3 Systems";
    return () => { document.title = "IM3 Systems | Desarrollo de software, automatización e inteligencia artificial para empresas"; };
  }, []);

  const dur = (d: number) => shouldReduceMotion ? 0 : d;
  const ease = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];
  const easeMid = [0.42, 0, 0.58, 1] as [number, number, number, number];

  const sectionVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: dur(0.5), ease }
    }
  };

  const lineVariants = {
    hidden: { height: 0 },
    visible: {
      height: "100%",
      transition: { duration: dur(0.8), ease: easeMid }
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.08,
        delayChildren: shouldReduceMotion ? 0 : 0.15,
        ease
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: dur(0.4), ease }
    }
  };

  const cardItemVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 6 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: dur(0.35), ease }
    }
  };

  const techGridVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.06,
        delayChildren: shouldReduceMotion ? 0 : 0.1
      }
    }
  };

  const headingVariants = {
    hidden: { opacity: 0, x: shouldReduceMotion ? 0 : 10 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: dur(0.4), ease }
    }
  };

  const dividerLineVariants = {
    hidden: { scaleX: 0 },
    visible: {
      scaleX: 1,
      transition: { duration: dur(0.5), delay: shouldReduceMotion ? 0 : 0.1, ease: easeMid }
    }
  };

  const footerTextVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.12,
        delayChildren: shouldReduceMotion ? 0 : 0.2
      }
    }
  };

  const wordVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 6, filter: shouldReduceMotion ? "blur(0px)" : "blur(4px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: dur(0.4), ease }
    }
  };

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-primary/20 relative overflow-hidden flex flex-col">
      {/* Background Grid */}
      <div className="fixed inset-0 technical-grid pointer-events-none -z-10" />

      {/* Ambient Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none -z-5 overflow-hidden" aria-hidden="true">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          transition={{ delay: 1.5, duration: dur(1.5) }}
          className="absolute top-[20%] right-[10%] text-foreground/10 font-mono text-xs animate-float"
          style={{ animationDelay: '0s' }}
        >
          +
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.1 }}
          transition={{ delay: 2, duration: dur(1.5) }}
          className="absolute top-[55%] left-[5%] text-foreground/10 font-mono text-xs animate-float"
          style={{ animationDelay: '2s' }}
        >
          //
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.08 }}
          transition={{ delay: 2.5, duration: dur(1.5) }}
          className="absolute top-[75%] right-[15%] w-1 h-1 bg-primary/20 rounded-full animate-pulse-glow"
        />
      </div>

      {/* System Status Bar - Fixed Top */}
      <div className="fixed top-0 left-0 w-full h-1 bg-foreground z-50" />
      <div className="w-full border-b border-border bg-background/80 backdrop-blur-sm z-40 sticky top-0">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between text-[10px] font-mono tracking-widest uppercase text-muted-foreground">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/assets/im3-logo.png" alt="IM3 Systems - Ir al inicio" className="h-5 w-auto" />
          </Link>
          <div className="flex items-center gap-2" aria-label="Estado: confirmado">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span>Confirmed</span>
          </div>
          <div className="hidden sm:block">IM3.OS v2.4</div>
        </div>
      </div>

      <div className="flex-grow">
        <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">

          {/* HERO */}
          <motion.header
            initial="hidden"
            animate="visible"
            variants={sectionVariants}
            className="mb-14 relative"
          >
            {/* Visual Confirmation Status */}
            <div className="mb-10 relative w-20 h-20" aria-label="Sesión confirmada">
               <svg className="w-full h-full" viewBox="0 0 80 80" fill="none" role="img" aria-label="Confirmación verificada">
                 <motion.circle cx="40" cy="40" r="38" stroke="currentColor" strokeWidth="1" className="text-border" />
                 <motion.circle
                   cx="40" cy="40" r="38"
                   stroke="currentColor"
                   strokeWidth="1.5"
                   className="text-foreground/20"
                   initial={{ pathLength: 0, rotate: -90 }}
                   animate={{ pathLength: 1, rotate: -90 }}
                   transition={{ duration: 1.5, ease: "easeInOut" }}
                 />
                 <motion.path
                   d="M28 41 L 36 49 L 52 33"
                   stroke="currentColor"
                   strokeWidth="3"
                   fill="none"
                   className="text-foreground"
                   initial={{ pathLength: 0, opacity: 0 }}
                   animate={{ pathLength: 1, opacity: 1 }}
                   transition={{ duration: 0.5, delay: 0.6, ease: "easeOut" }}
                   strokeLinecap="square"
                   strokeLinejoin="round"
                 />
               </svg>
               <motion.div
                 initial={{ scale: 0, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 transition={{ delay: 1, type: "spring" }}
                 className="absolute -bottom-1 -right-4 bg-card border border-border px-2 py-1 shadow-sm flex items-center gap-1.5"
               >
                 <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                 <span className="text-[9px] font-mono font-medium tracking-widest text-muted-foreground uppercase">Verified</span>
               </motion.div>
            </div>

            <div className="mono-tag mb-6 text-tech border border-tech/20 inline-block px-2 py-1 rounded-[2px] bg-tech/5">
              CONFIRMACIÓN #2401-OP
            </div>

            <h1 className="text-2xl sm:text-4xl md:text-5xl font-medium tracking-tight mb-8 text-primary max-w-2xl leading-[1.1]">
              Tu diagnóstico operativo está confirmado.
            </h1>

            <div className="flex flex-col md:flex-row md:items-start gap-8 border-l border-primary/20 pl-6 md:pl-8">
              <div>
                <p className="text-lg font-medium text-foreground mb-3">Qué sucederá en esta sesión</p>
                <p className="text-base md:text-lg text-muted-foreground font-light leading-relaxed max-w-2xl">
                  Analizaremos cómo funciona realmente tu operación para detectar fricciones, trabajo manual innecesario y oportunidades donde un mejor sistema puede simplificar y fortalecer la forma en que tu empresa opera.
                </p>
              </div>
            </div>

            {/* Scroll Indicator */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="mt-12 flex items-center gap-4 group cursor-pointer w-fit"
              role="button"
              tabIndex={0}
              aria-label="Desplazar al contenido"
              onClick={() => {
                const nextSection = document.getElementById('briefing-start');
                nextSection?.scrollIntoView({ behavior: 'smooth' });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  const nextSection = document.getElementById('briefing-start');
                  nextSection?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
            >
               <div className="w-12 h-12 rounded-full border border-foreground/10 flex items-center justify-center group-hover:border-primary group-hover:bg-primary group-hover:text-white transition-all duration-300 relative overflow-hidden">
                  <motion.svg
                    className="w-5 h-5 relative z-10"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    animate={{ y: [0, 4, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
                  </motion.svg>
               </div>
               <div className="flex flex-col">
                 <span className="text-xs font-mono uppercase tracking-widest text-primary font-medium group-hover:translate-x-1 transition-transform duration-300">
                   Iniciar Briefing
                 </span>
                 <span className="text-[10px] text-muted-foreground font-mono group-hover:translate-x-1 transition-transform duration-300 delay-75">
                   Leer protocolo de sesión
                 </span>
               </div>
            </motion.div>
          </motion.header>

          <div className="space-y-16">
            {/* SECCIÓN 01 — AUDITORÍA OPERATIVA */}
            <motion.section
              id="briefing-start"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-10%" }}
              variants={sectionVariants}
              className="grid md:grid-cols-[200px_1fr] gap-8"
            >
              <div className="md:text-right">
                <motion.h2 variants={headingVariants} className="text-xs font-semibold uppercase tracking-widest text-muted-foreground pt-1 flex items-center justify-end gap-2">
                  01 <motion.span variants={dividerLineVariants} className="w-8 h-px bg-border inline-block origin-left" /> Auditoría Operativa
                </motion.h2>
              </div>

              <div className="relative pl-2">
                <motion.p variants={itemVariants} className="text-base sm:text-lg text-foreground mb-6">Revisaremos cómo funciona tu empresa hoy para entender:</motion.p>
                <motion.div variants={containerVariants} className="space-y-8 relative">
                  {/* Timeline Line */}
                  <motion.div variants={lineVariants} className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-border to-transparent -z-10" />

                  {[
                    "Qué procesos están consumiendo más tiempo del necesario",
                    "Qué tareas podrían automatizarse o simplificarse",
                    "Qué herramientas utilizas y si están bien integradas",
                    "Dónde se generan errores, reprocesos o pérdida de información",
                    "Qué parte de la operación depende demasiado de trabajo manual"
                  ].map((item, i) => (
                    <motion.div key={i} variants={itemVariants} className="flex items-start gap-4 group">
                      <div className="mt-1.5 w-3.5 h-3.5 bg-background border border-muted-foreground/40 rounded-full shrink-0 z-10 group-hover:bg-foreground group-hover:border-foreground transition-colors duration-300" />
                      <span className="text-base sm:text-lg text-foreground/80 group-hover:text-foreground transition-colors">{item}</span>
                    </motion.div>
                  ))}
                </motion.div>

                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 6, scale: shouldReduceMotion ? 1 : 0.98 },
                    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: dur(0.4), delay: shouldReduceMotion ? 0 : 0.5, ease } }
                  }}
                  className="mt-10 inline-flex items-center gap-3 px-4 py-3 bg-muted/50 animated-dashed-border rounded-sm w-full md:w-auto"
                >
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground/20 rounded-full" />
                  </div>
                  <span className="text-xs text-muted-foreground font-mono uppercase tracking-wide">
                    No es una demo. No es ventas.
                  </span>
                </motion.div>
              </div>
            </motion.section>

            {/* SECCIÓN 02 — ENTREGABLE */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-10%" }}
              variants={sectionVariants}
              className="grid md:grid-cols-[200px_1fr] gap-8"
            >
              <div className="md:text-right">
                <motion.h2 variants={headingVariants} className="text-xs font-semibold uppercase tracking-widest text-muted-foreground pt-1 flex items-center justify-end gap-2">
                  02 <motion.span variants={dividerLineVariants} className="w-8 h-px bg-border inline-block origin-left" /> Entregable
                </motion.h2>
              </div>

              <div>
                <div className="bg-card border border-border p-6 md:p-8">
                  <h3 className="text-lg font-medium mb-2 text-foreground">Qué recibirás después de la auditoría</h3>
                  <p className="text-sm text-muted-foreground mb-6">Tras la sesión elaboramos un diagnóstico inicial, donde podrás ver:</p>

                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-5%" }}
                    className="grid gap-3 mb-6"
                  >
                    {[
                      "Principales puntos de fricción operativa",
                      "Procesos que podrían automatizarse",
                      "Oportunidades para reducir carga administrativa",
                      "Posibles sistemas o herramientas que podrían implementarse"
                    ].map((item, i) => (
                      <motion.div key={i} variants={cardItemVariants} className="flex items-center gap-3 text-sm text-foreground/80 bg-muted/30 p-3 border border-transparent hover:border-border transition-colors rounded-sm">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                        {item}
                      </motion.div>
                    ))}
                  </motion.div>

                  <motion.p variants={itemVariants} className="text-sm text-muted-foreground border-t border-border pt-4">
                    Esto permite determinar si tiene sentido trabajar juntos y qué tipo de solución sería la adecuada.
                  </motion.p>
                </div>
              </div>
            </motion.section>

            {/* SECCIÓN 03 — ALCANCE */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-10%" }}
              variants={sectionVariants}
              className="grid md:grid-cols-[200px_1fr] gap-8"
            >
              <div className="md:text-right">
                <motion.h2 variants={headingVariants} className="text-xs font-semibold uppercase tracking-widest text-muted-foreground pt-1 flex items-center justify-end gap-2">
                  03 <motion.span variants={dividerLineVariants} className="w-8 h-px bg-border inline-block origin-left" /> Alcance
                </motion.h2>
              </div>

              <div>
                <motion.div
                  variants={techGridVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-5%" }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6"
                >
                  {[
                    { title: "Apps a Medida", id: "SYS-01", type: "control" },
                    { title: "Control Operativo", id: "SYS-02", type: "control" },
                    { title: "Automatización", id: "SYS-03", type: "auto" },
                    { title: "Registro & Tracking", id: "SYS-04", type: "track" },
                    { title: "Dashboards", id: "SYS-05", type: "dash" },
                    { title: "Educación Tecnológica", id: "SYS-06", type: "track" },
                    { title: "Acompañamiento Estratégico", id: "SYS-07", type: "auto" }
                  ].map((item) => (
                    <motion.div key={item.id} variants={cardItemVariants}>
                      <TechCard item={item} />
                    </motion.div>
                  ))}
                </motion.div>
                <motion.div
                  variants={{
                    hidden: { scaleX: 0 },
                    visible: { scaleX: 1, transition: { duration: dur(0.6), delay: shouldReduceMotion ? 0 : 0.3, ease: easeMid } }
                  }}
                  className="origin-left"
                >
                  <div className="flex items-center gap-2 pt-4 border-t border-dashed border-border text-xs text-muted-foreground font-mono">
                    <span className="animate-pulse">_</span>
                    Más que un proveedor de software — somos tu partner de crecimiento tecnológico y escalamiento de procesos a través de IA y tecnología.
                  </div>
                </motion.div>
              </div>
            </motion.section>

            {/* SECCIÓN 04 — PRE-WORK */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-10%" }}
              variants={sectionVariants}
              className="grid md:grid-cols-[200px_1fr] gap-8"
            >
              <div className="md:text-right">
                <motion.h2 variants={headingVariants} className="text-xs font-semibold uppercase tracking-widest text-muted-foreground pt-1 flex items-center justify-end gap-2">
                  04 <motion.span variants={dividerLineVariants} className="w-8 h-px bg-border inline-block origin-left" /> Pre-Work
                </motion.h2>
              </div>

              <motion.div variants={containerVariants} className="space-y-6">
                {/* Preparation Card */}
                <motion.div variants={itemVariants} className="bg-card border border-border p-6 md:p-8">
                  <h3 className="text-lg font-medium mb-2 text-foreground">Requerimientos de entrada</h3>
                  <p className="text-muted-foreground text-sm max-w-md">No necesitas preparar presentaciones. Solo necesitamos tu experiencia directa sobre la operación actual.</p>
                </motion.div>

                {/* Incoming Data Streams (Emails) */}
                <motion.div variants={itemVariants} className="bg-tech/5 border border-tech/20 p-6 flex flex-col md:flex-row items-start md:items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-card border border-tech/30 flex items-center justify-center shrink-0 text-tech">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">Incoming Transmission: Material de Ayuda</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                      Recibirás una serie de correos con tips, trucos y lo último en tecnología, IA y automatización aplicada a operaciones reales. Material práctico para que llegues con contexto a la sesión.
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            </motion.section>

            {/* SECCIÓN 05 — SÍGUENOS */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-10%" }}
              variants={sectionVariants}
              className="grid md:grid-cols-[200px_1fr] gap-8"
            >
              <div className="md:text-right">
                <motion.h2 variants={headingVariants} className="text-xs font-semibold uppercase tracking-widest text-muted-foreground pt-1 flex items-center justify-end gap-2">
                  05 <motion.span variants={dividerLineVariants} className="w-8 h-px bg-border inline-block origin-left" /> Síguenos
                </motion.h2>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-4 text-foreground">Dónde encontrarnos</h3>
                <p className="text-sm text-muted-foreground mb-6">Síguenos para contenido sobre tecnología, IA aplicada y mejores prácticas operativas para empresas.</p>

                <div className="flex flex-wrap gap-4">
                  <a href="https://www.linkedin.com/company/im3-systems" target="_blank" rel="noopener noreferrer" className="group relative flex items-center gap-3 px-4 py-3 bg-card border border-border hover:border-foreground transition-all duration-300 overflow-hidden">
                    <span className="mono-tag text-muted-foreground group-hover:text-foreground">LNK</span>
                    <span className="text-sm font-medium text-foreground">LinkedIn</span>
                    <svg className="w-3 h-3 text-muted-foreground group-hover:translate-x-2 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                    <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-primary group-hover:w-full transition-all duration-300" />
                  </a>
                </div>
              </div>
            </motion.section>
          </div>
        </div>
      </div>

      {/* CIERRE */}
      <motion.footer
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-10%" }}
        variants={sectionVariants}
        className="border-t border-border bg-muted/50"
      >
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div>
            <motion.p
              variants={footerTextVariants}
              className="text-xl sm:text-2xl font-medium mb-2 text-primary tracking-tight"
            >
              {"Nos vemos en la sesión.".split(" ").map((word, i) => (
                <motion.span key={i} variants={wordVariants} className="inline-block mr-[0.3em]">
                  {word}
                </motion.span>
              ))}
            </motion.p>
            <p className="text-sm text-muted-foreground">Diagnóstico Operativo Inicial</p>
          </div>

          <div className="md:text-right">
            <div className="text-sm font-semibold tracking-wide mb-1">IM3</div>
            <div className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">
              Sistemas de software<br/>aplicados a la operación
            </div>
          </div>
        </div>

        {/* System Footer Bar */}
        <div className="border-t border-border py-3 bg-background">
          <div className="max-w-6xl mx-auto px-6 flex justify-between text-[10px] text-muted-foreground font-mono uppercase">
            <span>IM3 Systems</span>
            <span>Secure Connection</span>
            <span>IM3 © 2026</span>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}
