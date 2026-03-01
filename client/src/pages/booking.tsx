import { useEffect } from "react";
import { Link } from "wouter";
import { Clock, CheckCircle2, ShieldCheck, Cpu, BarChart3 } from "lucide-react";
import techGrid from "../assets/tech-grid-bg.png";

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

  return (
    <div className="min-h-screen bg-[hsl(var(--hero-bg))] md:bg-background flex flex-col md:flex-row font-sans text-foreground selection:bg-primary/20 overflow-x-hidden">

      {/* MOBILE HEADER - Visible only on mobile */}
      <div className="md:hidden bg-[hsl(var(--hero-bg))] p-6 pb-2 border-b border-white/5 relative overflow-hidden text-white">
         <div className="relative z-10">
            <Link href="/" className="mb-6 inline-block bg-white p-2.5 rounded-lg shadow-sm hover:scale-[1.02] transition-transform">
               <img src="/assets/im3-logo.png" alt="IM3 Logo" className="h-8 w-auto" />
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-white mb-2 leading-tight">
              Diagnóstico de IA <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">y Tecnología</span>
            </h1>
            <div className="flex items-center gap-2 text-slate-300 text-xs font-medium">
               <Clock className="w-3 h-3 text-primary" />
               <span>30 minutos · Evaluación técnica</span>
            </div>
         </div>
      </div>

      {/* LEFT COLUMN - Desktop: Info / Mobile: Details (at bottom) */}
      <div className="w-full md:w-5/12 lg:w-4/12 border-r border-border/10 bg-[hsl(var(--hero-bg))] z-10 relative overflow-hidden text-white shadow-2xl order-2 md:order-1 flex flex-col flex-1 md:h-screen md:sticky md:top-0">

        {/* Animated Background Layers (Only visible on desktop to save mobile performance/distraction) */}
        <div className="absolute inset-0 z-0 hidden md:block">
          <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--hero-bg))] via-[hsl(var(--hero-bg))] to-[hsl(var(--step-bg))]" />
          <div className="absolute inset-0 bg-grid-pattern opacity-30 animate-grid-flow" />
          <div
            className="absolute bottom-0 right-0 w-full h-full opacity-20 bg-no-repeat bg-cover bg-bottom mix-blend-screen"
            style={{ backgroundImage: `url(${techGrid})` }}
          />
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary rounded-full blur-[120px] opacity-[0.08] translate-x-1/2 -translate-y-1/2 animate-pulse-glow" />
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-12 lg:p-16 max-w-xl mx-auto md:mx-0 md:ml-auto min-h-full flex flex-col justify-between relative z-10">

            <div className="space-y-8 md:space-y-12">

              {/* Desktop Header - Hidden on Mobile */}
              <div className="hidden md:block space-y-12">
                <Link href="/" className="animate-in fade-in slide-in-from-top-4 duration-700 inline-block bg-white p-3.5 rounded-xl shadow-lg cursor-pointer hover:scale-[1.02] transition-transform">
                   <img src="/assets/im3-logo.png" alt="IM3 Logo" className="h-10 w-auto" />
                </Link>

              <header className="animate-in fade-in slide-in-from-left-4 duration-700 delay-100">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-6">
                   <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                   <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-300">Sesión Estratégica</span>
                </div>

                <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-white mb-6 leading-[1.1]">
                  Diagnóstico de IA <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">y Tecnología</span>
                </h1>

                <div className="flex items-center gap-3 text-slate-300 text-sm font-medium border-l-2 border-primary pl-4">
                  <Clock className="w-4 h-4 text-primary" />
                  <span>30 minutos · Evaluación técnica</span>
                </div>
              </header>
            </div>

            {/* Content Sections - Visible on both (styled for mobile in this container) */}
            <div className="space-y-6 pt-8 md:pt-0 bg-[hsl(var(--hero-bg))] md:bg-transparent -mx-6 px-6 md:mx-0 md:px-0">
              <div className="md:hidden pb-4 border-b border-white/10 mb-4">
                 <h3 className="text-lg font-medium text-white mb-1">Detalles de la sesión</h3>
                 <p className="text-sm text-slate-400">Lo que cubriremos en la llamada</p>
              </div>

              {/* Feature Cards */}
              <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
                <div className="group p-5 rounded-xl bg-white/5 border border-white/5 hover:border-primary/30 hover:bg-white/10 transition-all duration-300 cursor-default">
                  <h3 className="text-white font-medium mb-2 flex items-center gap-2 group-hover:text-primary transition-colors">
                    <Cpu className="w-4 h-4" />
                    El Objetivo
                  </h3>
                  <p className="text-sm font-light text-slate-400 leading-relaxed">
                    Identificar oportunidades concretas donde la <strong>Inteligencia Artificial</strong> y la tecnología moderna pueden optimizar tus operaciones empresariales. Sin generalidades.
                  </p>
                </div>

                <div className="group p-5 rounded-xl bg-white/5 border border-white/5 hover:border-primary/30 hover:bg-white/10 transition-all duration-300 cursor-default">
                  <h3 className="text-white font-medium mb-2 flex items-center gap-2 group-hover:text-primary transition-colors">
                    <BarChart3 className="w-4 h-4" />
                    Entregable Directo
                  </h3>
                  <p className="text-sm font-light text-slate-400 leading-relaxed">
                    Te diremos exactamente <strong>qué procesos se pueden automatizar</strong> hoy y qué tecnologías son viables para tu infraestructura actual.
                  </p>
                </div>
              </div>

              {/* Checklist */}
              <div className="pt-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
                  Enfoque de la sesión
                </p>
                <ul className="space-y-3">
                   {["Casos de uso reales de IA en tu sector", "Análisis de viabilidad técnica", "Roadmap de implementación sugerido"].map((item, i) => (
                     <li key={i} className="flex items-center gap-3 text-sm text-slate-300">
                       <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-primary" />
                       </div>
                       <span>{item}</span>
                     </li>
                   ))}
                </ul>
              </div>
            </div>
          </div>

            {/* Footer Text */}
            <div className="mt-12 pt-8 border-t border-white/5 animate-in fade-in duration-1000 delay-500 pb-8 md:pb-0">
              <div className="flex items-start gap-3 opacity-70 hover:opacity-100 transition-opacity">
                 <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                 <p className="text-xs text-slate-400 leading-relaxed">
                   Si no vemos una aplicación clara de tecnología para tu caso, te lo diremos. <br/>
                   <span className="text-slate-300">Diagnóstico técnico, no comercial.</span>
                 </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN - Calendar Embed - Mobile: Order 1 (Top) / Desktop: Order 2 (Right) */}
      <div className="w-full md:w-7/12 lg:w-8/12 bg-background min-h-[500px] relative order-1 md:order-2">
        {/* Background Pattern for Right Side */}
        <div className="absolute inset-0 bg-grid-pattern-light opacity-[0.4]" />

        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-0 md:p-8 lg:p-12">

          <div className="w-full max-w-[700px] animate-in fade-in slide-in-from-right-8 duration-1000 delay-200">

             {/* Card wrapper with Glass effect edge */}
             <div className="bg-white/80 backdrop-blur-sm shadow-none md:shadow-2xl md:shadow-border/50 rounded-none md:rounded-2xl overflow-hidden md:border border-white/60 p-0 md:p-2 md:ring-1 ring-slate-900/5 transform transition-transform duration-500 md:hover:scale-[1.005]">
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

             <div className="mt-4 mb-4 md:mt-8 flex justify-center items-center gap-3 opacity-60">
                <div className="flex -space-x-2">
                  <div className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white"></div>
                  <div className="w-6 h-6 rounded-full bg-slate-300 border-2 border-white"></div>
                  <div className="w-6 h-6 rounded-full bg-[hsl(var(--hero-bg))] border-2 border-white flex items-center justify-center text-[8px] text-white font-bold">IM3</div>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  Confirmación automática vía email.
                </p>
             </div>
          </div>
        </div>
      </div>

    </div>
  );
}
