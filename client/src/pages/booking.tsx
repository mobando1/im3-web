import { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Clock, ShieldCheck } from "lucide-react";
import DiagnosticForm from "@/components/diagnostic-form/DiagnosticForm";

export default function Booking() {
  useEffect(() => {
    document.title = "Diagnóstico Empresarial | IM3 Systems";
    return () => {
      document.title = "IM3 Systems | Desarrollo de software, automatización e inteligencia artificial para empresas";
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
            <span>Diagnóstico</span>
          </div>
          <div className="hidden sm:block">IM3.OS v2.4</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-grow">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-14">
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

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight mb-4 text-primary max-w-2xl leading-[1.1]">
              Diagnóstico de IA y Tecnología
            </h1>

            <p className="text-sm text-muted-foreground max-w-xl leading-relaxed mb-4">
              Agende su sesión y complete el formulario de diagnóstico para que podamos preparar un análisis personalizado de su operación.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
              <div className="flex items-center gap-3 text-muted-foreground text-sm font-medium border-l-2 border-primary pl-4">
                <Clock className="w-4 h-4 text-primary" />
                <span>30 minutos · Evaluación técnica</span>
              </div>

              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-tech shrink-0 mt-0.5" />
                <span>Información tratada con absoluta confidencialidad</span>
              </div>
            </div>
          </motion.header>

          {/* Diagnostic Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <DiagnosticForm />
          </motion.div>
        </div>
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
