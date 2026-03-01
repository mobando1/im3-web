import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { MouseEvent, useEffect } from "react";
import { Link } from "wouter";

const SystemIcon = ({ type }: { type: string }) => {
  if (type === "control") {
    return (
      <svg className="w-full h-full text-current" viewBox="0 0 100 60" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="10" y="10" width="30" height="20" rx="2" />
        <rect x="10" y="35" width="30" height="4" rx="1" opacity="0.5" />
        <path d="M45 20h15v20h25" strokeDasharray="4 4" />
        <circle cx="85" cy="40" r="3" />
      </svg>
    );
  }
  if (type === "auto") {
    return (
      <svg className="w-full h-full text-current" viewBox="0 0 100 60" fill="none" stroke="currentColor" strokeWidth="1.5">
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
      <svg className="w-full h-full text-current" viewBox="0 0 100 60" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="15" y="15" width="70" height="30" rx="2" />
        <path d="M15 25h70" opacity="0.3" />
        <path d="M30 15v30" opacity="0.3" />
        <path d="M60 15v30" opacity="0.3" />
      </svg>
    );
  }
  return (
    <svg className="w-full h-full text-current" viewBox="0 0 100 60" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="10" y="10" width="35" height="40" rx="2" />
      <rect x="55" y="10" width="35" height="18" rx="2" />
      <rect x="55" y="32" width="35" height="18" rx="2" />
      <path d="M20 20h15" opacity="0.5" />
      <path d="M20 28h15" opacity="0.5" />
    </svg>
  );
};

function TechCard({ item, index }: { item: { id: string; title: string; type: string }, index: number }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

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
              rgba(0,0,0,0.04),
              transparent 80%
            )
          `,
        }}
      />

      <div className="flex flex-col relative z-10">
        <span className="mono-tag text-[8px] opacity-40 mb-1">{item.id}</span>
        <span className="text-sm font-medium text-gray-800 leading-tight">{item.title}</span>
      </div>

      <div className="w-16 h-12 text-gray-200 group-hover:text-primary transition-colors duration-500 shrink-0">
        <SystemIcon type={item.type} />
      </div>
    </div>
  );
}

export default function Confirmed() {
  useEffect(() => {
    document.title = "Sesión Confirmada | IM3 Systems";
    return () => { document.title = "IM3 Systems | Desarrollo de software, automatización e inteligencia artificial para empresas"; };
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

  const lineVariants = {
    hidden: { height: 0 },
    visible: {
      height: "100%",
      transition: {
        duration: 0.8,
        ease: [0.42, 0, 0.58, 1] as [number, number, number, number]
      }
    }
  };

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-gray-200 relative overflow-hidden flex flex-col">
      {/* Background Grid */}
      <div className="fixed inset-0 technical-grid pointer-events-none -z-10" />

      {/* System Status Bar - Fixed Top */}
      <div className="fixed top-0 left-0 w-full h-1 bg-foreground z-50" />
      <div className="w-full border-b border-border bg-background/80 backdrop-blur-sm z-40 sticky top-0">
        <div className="max-w-4xl mx-auto px-6 h-12 flex items-center justify-between text-[10px] font-mono tracking-widest uppercase text-muted-foreground">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/assets/im3-logo.png" alt="IM3" className="h-5 w-auto" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span>Confirmed</span>
          </div>
          <div>IM3.OS v2.4</div>
        </div>
      </div>

      <div className="flex-grow">
        <div className="max-w-4xl mx-auto px-6 py-12 md:py-16">

          {/* HERO */}
          <motion.header
            initial="hidden"
            animate="visible"
            variants={sectionVariants}
            className="mb-14 relative"
          >
            {/* Visual Confirmation Status */}
            <div className="mb-10 relative w-20 h-20">
               <svg className="w-full h-full" viewBox="0 0 80 80" fill="none">
                 <motion.circle cx="40" cy="40" r="38" stroke="currentColor" strokeWidth="1" className="text-gray-100" />
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
                 className="absolute -bottom-1 -right-4 bg-white border border-border px-2 py-1 shadow-sm flex items-center gap-1.5"
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
              <p className="text-xl md:text-2xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                Una conversación técnica para entender tu operación y evaluar si tiene sentido diseñar un sistema.
              </p>
            </div>

            {/* Scroll Indicator */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="mt-12 flex items-center gap-4 group cursor-pointer w-fit"
              onClick={() => {
                const nextSection = document.getElementById('briefing-start');
                nextSection?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
               <div className="w-12 h-12 rounded-full border border-foreground/10 flex items-center justify-center group-hover:border-primary group-hover:bg-primary group-hover:text-white transition-all duration-300 relative overflow-hidden">
                  <div className="absolute inset-0 rounded-full border border-primary/20 animate-ping opacity-20" />
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
            {/* SECCIÓN 2 — QUÉ VA A PASAR */}
            <motion.section
              id="briefing-start"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-10%" }}
              variants={sectionVariants}
              className="grid md:grid-cols-[200px_1fr] gap-8"
            >
              <div className="md:text-right">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground pt-1 flex items-center justify-end gap-2">
                  01 <span className="w-8 h-px bg-border inline-block" /> La Sesión
                </h2>
              </div>

              <div className="relative pl-2">
                <div className="space-y-8 relative">
                  {/* Timeline Line */}
                  <motion.div variants={lineVariants} className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-gray-200 to-transparent -z-10" />

                  {[
                    "Entender el contexto operativo actual",
                    "Profundizar en uno o dos puntos de fricción reales",
                    "Mostrar posibles caminos técnicos",
                    "Definir el siguiente paso solo si tiene sentido"
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-4 group">
                      <div className="mt-1.5 w-3.5 h-3.5 bg-background border border-gray-400 rounded-full shrink-0 z-10 group-hover:bg-foreground group-hover:border-foreground transition-colors duration-300" />
                      <span className="text-lg text-gray-800 group-hover:text-foreground transition-colors">{item}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-10 inline-flex items-center gap-3 px-4 py-3 bg-gray-50 border border-dashed border-gray-300 rounded-sm w-full md:w-auto">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                    <span className="w-1.5 h-1.5 bg-gray-200 rounded-full" />
                  </div>
                  <span className="text-xs text-muted-foreground font-mono uppercase tracking-wide">
                    No es una demo. No es ventas.
                  </span>
                </div>
              </div>
            </motion.section>

            {/* SECCIÓN 3 — CÓMO TRABAJA IM3 */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-10%" }}
              variants={sectionVariants}
              className="grid md:grid-cols-[200px_1fr] gap-8"
            >
              <div className="md:text-right">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground pt-1 flex items-center justify-end gap-2">
                  02 <span className="w-8 h-px bg-border inline-block" /> Metodología
                </h2>
              </div>

              <div>
                <div className="grid md:grid-cols-2 gap-0 border border-border">
                  <div className="bg-white p-8 border-b md:border-b-0 md:border-r border-border hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <span className="mono-tag text-red-500/70 border border-red-200 px-1.5 rounded-[2px]">ANTI-PATRÓN</span>
                      <svg className="w-4 h-4 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </div>
                    <p className="text-gray-600 leading-relaxed text-sm">No vendemos herramientas empaquetadas ni prometemos resultados mágicos inmediatos.</p>
                  </div>
                  <div className="bg-primary/5 p-8 relative overflow-hidden group hover:bg-primary/10 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <span className="mono-tag text-primary border border-primary/20 px-1.5 rounded-[2px]">CORE VALUE</span>
                      <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <p className="text-muted-foreground leading-relaxed text-sm mb-6">Diseñamos estructuras de software a medida que reducen la fricción, los errores y la dependencia operativa.</p>

                    <div className="flex flex-wrap gap-2">
                      {["Apps a medida", "Automatizaciones"].map((tag, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-medium text-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* SECCIÓN 4 — EJEMPLOS DE TRABAJO */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-10%" }}
              variants={sectionVariants}
              className="grid md:grid-cols-[200px_1fr] gap-8"
            >
              <div className="md:text-right">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground pt-1 flex items-center justify-end gap-2">
                  03 <span className="w-8 h-px bg-border inline-block" /> Alcance
                </h2>
              </div>

              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                  {[
                    { title: "Apps a Medida", id: "SYS-05", type: "control" },
                    { title: "Control Operativo", id: "SYS-01", type: "control" },
                    { title: "Automatización", id: "SYS-02", type: "auto" },
                    { title: "Registro & Tracking", id: "SYS-03", type: "track" },
                    { title: "Dashboards", id: "SYS-04", type: "dash" }
                  ].map((item, i) => (
                    <TechCard key={i} item={item} index={i} />
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-4 border-t border-dashed border-border text-xs text-muted-foreground font-mono">
                  <span className="animate-pulse">_</span>
                  Cada sistema es distinto. El alcance se define después del diagnóstico.
                </div>
              </div>
            </motion.section>

            {/* SECCIÓN 5 — PREPARACIÓN DEL CLIENTE & INCOMING DATA */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-10%" }}
              variants={sectionVariants}
              className="grid md:grid-cols-[200px_1fr] gap-8"
            >
              <div className="md:text-right">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground pt-1 flex items-center justify-end gap-2">
                  04 <span className="w-8 h-px bg-border inline-block" /> Pre-Work
                </h2>
              </div>

              <div className="space-y-6">
                {/* Preparation Card */}
                <div className="bg-white border border-border p-6 md:p-8">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-2 text-foreground">Requerimientos de entrada</h3>
                      <p className="text-muted-foreground text-sm max-w-md">No necesitas preparar presentaciones. Solo necesitamos tu experiencia directa sobre la operación actual.</p>
                    </div>

                    <div className="grid gap-3">
                      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Checklist de discusión:</p>
                      {[
                        "Dónde sientes mayor fricción hoy",
                        "Qué tareas generan más reproceso",
                        "Qué información crítica falta"
                      ].map((item, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm text-gray-700 bg-gray-50/50 p-3 border border-transparent hover:border-border transition-colors rounded-sm">
                          <div className="w-3 h-3 border border-gray-400 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-gray-400" />
                          </div>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Incoming Data Streams (Emails) */}
                <div className="bg-tech/5 border border-tech/20 p-6 flex flex-col md:flex-row items-start md:items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white border border-tech/30 flex items-center justify-center shrink-0 text-tech">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">Incoming Transmission: Material de Estudio</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                      Recibirás una serie de correos previos a nuestra llamada. Contienen información técnica valiosa para maximizar el tiempo de nuestra sesión. Recomendamos su lectura.
                    </p>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* SECCIÓN 6 — INTELLIGENCE CHANNELS (SOCIALS) */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-10%" }}
              variants={sectionVariants}
              className="grid md:grid-cols-[200px_1fr] gap-8"
            >
              <div className="md:text-right">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground pt-1 flex items-center justify-end gap-2">
                  05 <span className="w-8 h-px bg-border inline-block" /> Intelligence
                </h2>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-4 text-foreground">Canal de Investigación</h3>
                <p className="text-sm text-muted-foreground mb-6">Accede a nuestro contenido público sobre arquitectura de sistemas y eficiencia operativa.</p>

                <div className="flex flex-wrap gap-4">
                  <a href="https://www.linkedin.com/company/im3-systems" target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 px-4 py-3 bg-white border border-border hover:border-foreground transition-all duration-300">
                    <span className="mono-tag text-muted-foreground group-hover:text-foreground">LNK</span>
                    <span className="text-sm font-medium text-gray-800">LinkedIn</span>
                    <svg className="w-3 h-3 text-muted-foreground group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
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
        className="border-t border-border bg-gray-50"
      >
        <div className="max-w-4xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div>
            <p className="text-2xl font-medium mb-2 text-primary tracking-tight">Nos vemos en la sesión.</p>
            <p className="text-sm text-muted-foreground">Diagnóstico Operativo Inicial</p>
          </div>

          <div className="text-right hidden md:block">
            <div className="text-sm font-semibold tracking-wide mb-1">IM3</div>
            <div className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">
              Sistemas de software<br/>aplicados a la operación
            </div>
          </div>
        </div>

        {/* System Footer Bar */}
        <div className="border-t border-border py-3 bg-background">
          <div className="max-w-4xl mx-auto px-6 flex justify-between text-[10px] text-muted-foreground font-mono uppercase">
            <span>Latencia: 24ms</span>
            <span>Secure Connection</span>
            <span>IM3 © 2026</span>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}
