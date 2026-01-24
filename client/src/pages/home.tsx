import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { 
  ArrowRight, 
  Check, 
  ChevronRight, 
  Menu, 
  X, 
  Activity, 
  Cpu, 
  ShieldCheck, 
  BarChart3, 
  Clock, 
  Layout, 
  Users, 
  Zap, 
  FileText, 
  ArrowUpRight,
  Layers,
  Sparkles,
  Gauge,
  Link2,
  Calendar
} from "lucide-react";
import { InteractiveHeroWidget } from "@/components/InteractiveHeroWidget";

// --- Components ---

const Reveal = ({ children, className, delay = 0 }: { children: React.ReactNode, className?: string, delay?: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-1000 ease-out transform",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12",
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const openBooking = () => {
    window.open("https://api.leadconnectorhq.com/widget/booking/e1UKFLu5HkQcVg5aZdei", "_blank");
  };

  return (
    <header 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-4 md:px-8",
        isScrolled ? "py-3" : "py-5"
      )}
    >
      <div className="max-w-7xl mx-auto">
        <div className={cn(
          "flex items-center justify-between rounded-2xl px-6 py-3 transition-all duration-300",
          isScrolled ? "bg-white/80 backdrop-blur-md shadow-sm border border-white/20" : "bg-transparent"
        )}>
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img src="/assets/im3-logo.jpg" alt="IM3 Systems" className="h-10 w-auto object-contain" />
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-white/50">
              <button className="flex items-center gap-1 px-2 py-1 rounded bg-[hsl(var(--ink))]/10 text-[hsl(var(--ink))] text-xs font-medium">
                <span className="text-base">🇪🇸</span> ES
              </button>
              <button 
                className="flex items-center gap-1 px-2 py-1 rounded text-muted-foreground hover:bg-gray-100 text-xs font-medium transition-colors"
                onClick={() => alert('English version coming soon!')}
              >
                <span className="text-base">🇺🇸</span> EN
              </button>
            </div>
            <button onClick={() => scrollToSection('que')} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Qué hacemos</button>
            <button onClick={() => scrollToSection('como')} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Cómo trabajamos</button>
            <button onClick={() => scrollToSection('para')} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Para quién</button>
          </nav>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-4">
            <button 
              onClick={openBooking}
              className="bg-[hsl(var(--ink))] text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:translate-y-[-2px] hover:shadow-lg transition-all duration-300 flex items-center gap-2"
            >
              Solicitar diagnóstico <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile Toggle */}
          <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="absolute top-full left-4 right-4 mt-2 p-6 bg-white rounded-2xl shadow-xl border border-border md:hidden flex flex-col gap-4 animate-in slide-in-from-top-4 fade-in duration-200">
          <div className="flex items-center justify-center gap-2 pb-4 border-b border-border/50">
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--ink))]/10 text-[hsl(var(--ink))] font-medium">
              <span className="text-xl">🇪🇸</span> Español
            </button>
            <button 
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:bg-gray-100 font-medium transition-colors"
              onClick={() => alert('English version coming soon!')}
            >
              <span className="text-xl">🇺🇸</span> English
            </button>
          </div>
          <button onClick={() => scrollToSection('que')} className="text-left text-lg font-medium py-2 border-b border-border/50">Qué hacemos</button>
          <button onClick={() => scrollToSection('como')} className="text-left text-lg font-medium py-2 border-b border-border/50">Cómo trabajamos</button>
          <button onClick={() => scrollToSection('para')} className="text-left text-lg font-medium py-2 border-b border-border/50">Para quién</button>
          <button 
            onClick={openBooking}
            className="bg-[hsl(var(--ink))] text-white px-5 py-3 rounded-xl text-center font-medium mt-2"
          >
            Solicitar diagnóstico
          </button>
        </div>
      )}
    </header>
  );
};

const Hero = () => {
  return (
    <section className="pt-32 pb-12 px-4 md:px-8">
      <div className="max-w-7xl mx-auto bg-[hsl(var(--ink))] rounded-[32px] overflow-hidden text-white relative shadow-2xl">
        {/* Abstract Background Elements */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-soft-light"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[hsl(var(--teal))] opacity-10 blur-[120px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/4"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-600 opacity-10 blur-[100px] rounded-full pointer-events-none translate-y-1/4 -translate-x-1/4"></div>

        <div className="grid md:grid-cols-2 gap-8 md:gap-12 p-6 sm:p-8 md:p-16 relative z-10 items-center">
          <div className="space-y-8">
            <Reveal>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-medium tracking-wide text-[hsl(var(--teal))] shadow-lg shadow-teal-900/20 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-[hsl(var(--teal))] animate-pulse"></span>
                IM3 · SISTEMAS OPERATIVOS
              </div>
            </Reveal>
            
            <Reveal delay={100}>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-[1.15] tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-gray-400">
                Sistemas confiables para operar sin fricción
              </h1>
            </Reveal>

            <Reveal delay={200}>
              <p className="text-base sm:text-lg text-gray-300 leading-relaxed max-w-xl font-light">
                Construimos aplicaciones internas y automatizaciones conectadas que ordenan la operación diaria de una empresa.
              </p>
            </Reveal>

            <Reveal delay={300}>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button 
                  onClick={() => window.open("https://api.leadconnectorhq.com/widget/booking/e1UKFLu5HkQcVg5aZdei", "_blank")}
                  className="bg-[hsl(var(--teal))] text-white px-6 py-3.5 rounded-xl font-semibold hover:bg-[#258a8e] transition-all hover:translate-y-[-2px] shadow-[0_10px_20px_-10px_rgba(47,164,169,0.3)] hover:shadow-[0_20px_40px_-15px_rgba(47,164,169,0.5)] ring-offset-2 ring-offset-[hsl(var(--ink))] focus:ring-2 focus:ring-[hsl(var(--teal))] text-center"
                >
                  Agendar conversación
                </button>
                <button 
                  onClick={() => document.getElementById('que')?.scrollIntoView({ behavior: 'smooth' })}
                  className="bg-white/5 border border-white/10 text-white px-6 py-3.5 rounded-xl font-medium hover:bg-white/10 transition-all backdrop-blur-sm text-center"
                >
                  Ver qué hacemos
                </button>
              </div>
            </Reveal>

            <Reveal delay={400}>
              <div className="flex flex-wrap gap-2 sm:gap-3 pt-4 border-t border-white/5 mt-6 sm:mt-8">
                {[
                  { label: "Apps internas", icon: Layout },
                  { label: "Automatización", icon: Zap },
                  { label: "Integraciones", icon: Link2 },
                  { label: "Dashboards", icon: Gauge },
                  { label: "IA aplicada", icon: Sparkles },
                  { label: "Sistemas mantenibles", icon: Layers },
                ].map((badge, i) => (
                  <span 
                    key={i} 
                    className="group px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-400 font-mono hover:bg-[hsl(var(--teal))]/10 hover:border-[hsl(var(--teal))]/30 hover:text-[hsl(var(--teal))] transition-all duration-300 cursor-default flex items-center gap-2"
                  >
                    <badge.icon className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                    {badge.label}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={200} className="relative hidden md:block">
             <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#0F2438] transform rotate-1 hover:rotate-0 transition-transform duration-700 ease-out group perspective-1000 h-[380px]">
                {/* Interactive Widget Container */}
                <div className="absolute inset-0 bg-[#0F172A]">
                  <InteractiveHeroWidget />
                </div>
             </div>
             
             {/* Decorative blurry glow behind image */}
             <div className="absolute -inset-4 bg-gradient-to-tr from-[hsl(var(--teal))] to-blue-600 rounded-3xl blur-2xl opacity-20 -z-10 animate-pulse duration-3000"></div>
          </Reveal>
        </div>
      </div>
      
      {/* "Lo que priorizamos" Card below hero */}
      <div className="max-w-4xl mx-auto -mt-6 md:-mt-12 relative z-20 px-4">
        <Reveal delay={600}>
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-xl border border-border/50">
            <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
              <div className="md:w-1/3 border-b md:border-b-0 md:border-r border-border pb-6 md:pb-0 md:pr-8">
                <h3 className="text-xl font-bold text-[hsl(var(--ink))] mb-2">Lo que priorizamos</h3>
                <p className="text-sm text-muted-foreground">Orden → claridad → ejecución. Tecnología al servicio de la operación, no al revés.</p>
              </div>
              <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <div className="w-8 h-8 rounded-full bg-[hsl(var(--paper))] flex items-center justify-center mb-3 text-[hsl(var(--teal))]">
                    <Check className="w-4 h-4" />
                  </div>
                  <h4 className="font-semibold text-sm mb-1">Ejecución clara</h4>
                  <p className="text-xs text-muted-foreground">Alcance, entregables y criterios definidos.</p>
                </div>
                <div>
                  <div className="w-8 h-8 rounded-full bg-[hsl(var(--paper))] flex items-center justify-center mb-3 text-[hsl(var(--teal))]">
                    <Layout className="w-4 h-4" />
                  </div>
                  <h4 className="font-semibold text-sm mb-1">Estructura</h4>
                  <p className="text-xs text-muted-foreground">Diseño del sistema antes del código.</p>
                </div>
                <div>
                  <div className="w-8 h-8 rounded-full bg-[hsl(var(--paper))] flex items-center justify-center mb-3 text-[hsl(var(--teal))]">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h4 className="font-semibold text-sm mb-1">Mantenible</h4>
                  <p className="text-xs text-muted-foreground">Documentación y handoff para operar.</p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

const LogoStrip = () => {
  const logos = [
    { name: "La Glorieta", src: "/assets/logos/la-glorieta.jpg" },
    { name: "Xtremcol", src: "/assets/logos/xtremcol.png" },
    { name: "Passport Fluency", src: "/assets/logos/passport-fluency.png" },
    { name: "Salomé Momentos", src: "/assets/logos/salome.jpg" },
    { name: "AMJ Solutions", src: "/assets/logos/amj-solutions.png" },
  ];

  const LogoItem = ({ logo }: { logo: { name: string; src: string } }) => (
    <div className="flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity duration-300 mix-blend-multiply flex items-center mx-8">
      <img 
        src={logo.src} 
        alt={logo.name} 
        className={cn(
          "w-auto object-contain rounded-xl",
          logo.name === "AMJ Solutions" ? "h-40 max-w-[280px]" : "h-16 max-w-[150px]"
        )}
      />
    </div>
  );
  
  return (
    <section className="py-8 overflow-hidden bg-[hsl(var(--paper))]">
      <div className="max-w-7xl mx-auto px-8 mb-8 text-center">
        <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Empresas que confían en sistemas IM3</p>
      </div>
      <div className="relative overflow-hidden">
        <div className="flex w-max animate-scroll">
          {/* Triple the logos for seamless infinite scroll */}
          {[...logos, ...logos, ...logos, ...logos].map((logo, i) => (
            <LogoItem key={i} logo={logo} />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
      `}</style>
    </section>
  );
};

const Services = () => {
  return (
    <section id="que" className="py-10 sm:py-12 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="max-w-3xl mb-8">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-4 sm:mb-6 leading-tight">Sistemas internos que ordenan la operación</h2>
            <p className="text-xl text-muted-foreground">Construimos soluciones a medida para reducir fricción, centralizar información y ejecutar mejor.</p>
          </Reveal>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: <Layout className="w-6 h-6" />,
              title: "Aplicaciones internas",
              text: "Herramientas a medida para control operativo, reportes, checklists, registros y flujos internos.",
              color: "bg-blue-50 text-blue-600"
            },
            {
              icon: <Zap className="w-6 h-6" />,
              title: "Automatización",
              text: "Conectamos tus apps y datos para eliminar tareas repetitivas y reducir errores en el día a día.",
              color: "bg-amber-50 text-amber-600"
            },
            {
              icon: <Activity className="w-6 h-6" />,
              title: "Sistemas de control",
              text: "Dashboards, conciliaciones, alertas y auditoría: visibilidad real para decisiones mejores.",
              color: "bg-emerald-50 text-emerald-600"
            }
          ].map((card, i) => (
            <Reveal key={i} delay={i * 100}>
              <div className="bg-white p-8 rounded-2xl border border-border hover:shadow-lg transition-all duration-300 hover:border-[hsl(var(--teal))] group h-full">
                <div className={`w-12 h-12 rounded-xl ${card.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                  {card.icon}
                </div>
                <h3 className="text-xl font-bold mb-4 text-[hsl(var(--ink))]">{card.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{card.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

const LeadMagnet = () => {
  return (
    <section id="diagnostico" className="py-12 px-4 md:px-8">
      <Reveal>
        <div className="max-w-5xl mx-auto bg-gradient-to-r from-teal-50 to-blue-50 rounded-3xl p-8 md:p-12 border border-teal-100 flex flex-col md:flex-row items-center justify-between gap-8 shadow-sm">
          <div className="md:w-2/3">
            <div className="inline-block px-3 py-1 bg-white text-[hsl(var(--teal))] text-xs font-bold rounded-full mb-4 shadow-sm">SIN COSTO</div>
            <h3 className="text-2xl md:text-3xl font-bold text-[hsl(var(--ink))] mb-4">Diagnóstico operativo inicial</h3>
            <p className="text-[hsl(var(--coal))] opacity-80 text-lg">
              Analizamos tu operación, detectamos cuellos de botella y te entregamos un mapa claro de qué sistema implementar, por qué y en qué orden.
            </p>
          </div>
          <div className="md:w-1/3 flex justify-center md:justify-end">
             <button 
                onClick={() => window.open("https://api.leadconnectorhq.com/widget/booking/e1UKFLu5HkQcVg5aZdei", "_blank")}
                className="bg-[hsl(var(--teal))] text-white px-8 py-4 rounded-xl font-semibold hover:bg-[#258a8e] transition-all hover:shadow-lg whitespace-nowrap"
             >
                Solicitar diagnóstico
             </button>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

const Process = () => {
  const steps = [
    { num: "01", title: "Diagnóstico", text: "Entendemos tu operación y dónde se pierde tiempo o dinero." },
    { num: "02", title: "Diseño", text: "Definimos estructura de datos, flujo, roles y métricas." },
    { num: "03", title: "Construcción", text: "Desarrollamos un MVP funcional con foco en uso real." },
    { num: "04", title: "Automatización", text: "Conectamos lo necesario para eliminar tareas repetitivas." },
    { num: "05", title: "Transferencia", text: "Documentación + handoff para que el sistema se mantenga." },
  ];

  return (
    <section id="como" className="py-10 sm:py-12 px-4 md:px-8 bg-[hsl(var(--paper))]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-4 leading-tight">Estructura antes de velocidad</h2>
            <p className="text-lg text-muted-foreground">Un método simple para construir rápido sin romper la operación (y dejarlo mantenible).</p>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {steps.map((step, i) => (
            <Reveal key={i} delay={i * 100}>
              <div className="bg-white p-6 rounded-2xl border border-border h-full relative overflow-hidden group hover:shadow-md transition-all">
                <div className="text-6xl font-display font-bold text-gray-100 absolute -right-4 -top-4 group-hover:text-teal-50 transition-colors">{step.num}</div>
                <div className="relative z-10">
                  <div className="w-8 h-8 rounded-full bg-[hsl(var(--ink))] text-white flex items-center justify-center text-xs font-bold mb-4">
                    {i + 1}
                  </div>
                  <h4 className="font-bold text-[hsl(var(--ink))] mb-2">{step.title}</h4>
                  <p className="text-sm text-muted-foreground">{step.text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

const TargetAudience = () => {
  return (
    <section id="para" className="py-10 sm:py-12 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-4 leading-tight">PYMEs con operación real</h2>
            <p className="text-xl text-muted-foreground">Especialmente equipos que necesitan orden y control, no más herramientas sueltas.</p>
          </Reveal>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <Reveal>
            <div className="bg-[hsl(var(--ink))] text-white p-8 md:p-12 rounded-[2rem] shadow-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(var(--teal))] opacity-20 blur-[80px] rounded-full"></div>
               <h3 className="text-2xl font-bold mb-8 flex items-center gap-3">
                 <Check className="text-[hsl(var(--teal))]" /> Encaja contigo si...
               </h3>
               <ul className="space-y-4 relative z-10">
                 {[
                   "Tu operación depende de personas y WhatsApp, pero necesitas estructura.",
                   "Hay reportes manuales, cierres, conciliaciones o auditorías que toman horas.",
                   "Tienes varias apps, pero no están conectadas (Sheets, POS, CRM, etc.).",
                   "Quieres un sistema mantenible, no un proyecto eterno."
                 ].map((item, i) => (
                   <li key={i} className="flex gap-3 items-start">
                     <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--teal))] mt-2.5"></span>
                     <span className="text-gray-300 leading-relaxed">{item}</span>
                   </li>
                 ))}
               </ul>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="bg-white p-8 md:p-12 rounded-[2rem] border border-border shadow-sm h-full">
               <h3 className="text-2xl font-bold mb-8 text-gray-400 flex items-center gap-3">
                 <X /> No somos para...
               </h3>
               <ul className="space-y-4">
                 {[
                   "Empresas que buscan una solución genérica sin entender su operación.",
                   "Proyectos sin dueño interno o sin intención de usar el sistema.",
                   "Implementaciones genéricas tipo “copia y pega”.",
                   "Soluciones que se rompen por no documentar procesos."
                 ].map((item, i) => (
                   <li key={i} className="flex gap-3 items-start">
                     <span className="w-1.5 h-1.5 rounded-full bg-red-200 mt-2.5"></span>
                     <span className="text-muted-foreground leading-relaxed">{item}</span>
                   </li>
                 ))}
               </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
};

const Testimonials = () => {
  const reviews = [
    { quote: "Logramos reducir el tiempo de cierre de 4 días a 4 horas.", author: "Laura Méndez", role: "Operaciones · Bodega 72" },
    { quote: "Por fin tenemos visibilidad real del inventario en tiempo real.", author: "Carlos Rojas", role: "Admin · CasaMesa" },
    { quote: "La implementación fue ordenada y el equipo adoptó la herramienta rápido.", author: "Paula Andrade", role: "Dirección · Quanta" }
  ];

  return (
    <section className="py-12 px-4 md:px-8 bg-[hsl(var(--paper))]">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-4 leading-tight">Resultados que hablan por sí solos</h2>
          <p className="text-muted-foreground mb-8">Casos reales de impacto operativo.</p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6">
          {reviews.map((review, i) => (
            <Reveal key={i} delay={i * 100}>
              <div className="bg-white p-8 rounded-2xl border border-border shadow-sm h-full flex flex-col justify-between">
                <p className="text-lg text-[hsl(var(--coal))] mb-8 font-medium">"{review.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 text-sm">
                    {review.author.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[hsl(var(--ink))]">{review.author}</div>
                    <div className="text-xs text-muted-foreground">{review.role}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

const Offer = () => {
  return (
    <section id="oferta" className="py-12 px-4 md:px-8">
      <div className="max-w-4xl mx-auto text-center mb-8">
         <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-4 leading-tight">Modelos de Trabajo</h2>
            <p className="text-lg text-muted-foreground">Después del diagnóstico, definimos juntos la mejor forma de avanzar.</p>
         </Reveal>
      </div>

      <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8 mb-8">
        <Reveal delay={100}>
          <div className="bg-white p-8 rounded-2xl border border-border h-full hover:border-[hsl(var(--teal))] transition-all hover:shadow-lg flex flex-col">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-6">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[hsl(var(--ink))] mb-4">Implementación completa <span className="block text-sm font-normal text-muted-foreground mt-1">(Done For You)</span></h3>
            <p className="text-muted-foreground mb-6 flex-grow">
              Nos encargamos de todo. Diseñamos, construimos y te entregamos el sistema funcionando, llave en mano. Tu equipo solo se preocupa de usarlo.
            </p>
            <div className="pt-6 border-t border-border mt-auto">
              <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--ink))]">
                <Check className="w-4 h-4 text-[hsl(var(--teal))]" />
                Ideal si buscas velocidad y garantía de ejecución.
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className="bg-white p-8 rounded-2xl border border-border h-full hover:border-[hsl(var(--teal))] transition-all hover:shadow-lg flex flex-col">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 mb-6">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[hsl(var(--ink))] mb-4">Acompañamiento estratégico <span className="block text-sm font-normal text-muted-foreground mt-1">(Consultoría + Diseño)</span></h3>
            <p className="text-muted-foreground mb-6 flex-grow">
              Diseñamos la arquitectura y guiamos a tu equipo técnico (o externo) para que ellos construyan con nuestro mapa y supervisión de calidad.
            </p>
            <div className="pt-6 border-t border-border mt-auto">
              <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--ink))]">
                <Check className="w-4 h-4 text-[hsl(var(--teal))]" />
                Ideal si ya tienes capacidad técnica pero te falta dirección.
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal delay={300}>
        <div className="max-w-3xl mx-auto bg-[hsl(var(--paper))] rounded-2xl p-8 text-center border border-border">
          <h3 className="text-lg font-bold mb-2 text-[hsl(var(--ink))]">Sin presión de venta</h3>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            El objetivo del diagnóstico es entender tu operación. Si podemos ayudar, te presentaremos estas opciones. Si no, te daremos una recomendación honesta.
          </p>
          <button 
            onClick={() => window.open("https://api.leadconnectorhq.com/widget/booking/e1UKFLu5HkQcVg5aZdei", "_blank")}
            className="text-[hsl(var(--teal))] font-bold hover:text-[hsl(var(--ink))] transition-colors flex items-center justify-center gap-2 mx-auto"
          >
            Agendar conversación <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </Reveal>
    </section>
  );
};


const Contact = () => {
  return (
    <section id="contacto" className="py-16 px-4 md:px-8">
      <div className="max-w-3xl mx-auto text-center">
        <Reveal>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-6 leading-tight">
            ¿Dónde se está perdiendo tiempo o control en tu operación?
          </h2>
          <p className="text-xl text-muted-foreground mb-10">
            Una conversación corta para entender tu caso y proponer el siguiente paso.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button 
              onClick={() => window.open("https://api.leadconnectorhq.com/widget/booking/e1UKFLu5HkQcVg5aZdei", "_blank")}
              className="bg-[hsl(var(--ink))] text-white px-8 py-4 rounded-xl font-bold hover:bg-[hsl(var(--coal))] transition-all flex items-center justify-center gap-2"
            >
              <Calendar className="w-5 h-5" /> Agendar una llamada
            </button>
            <button 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="bg-white border border-border text-[hsl(var(--ink))] px-8 py-4 rounded-xl font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
            >
              Volver arriba <ArrowUpRight className="w-5 h-5" />
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

const Footer = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="py-12 px-4 md:px-8 border-t border-border bg-white">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-3">
          <img src="/assets/im3-logo.jpg" alt="IM3 Systems" className="h-8 w-auto object-contain" />
        </div>
        <div className="flex flex-col md:flex-row items-center gap-4 text-sm text-muted-foreground">
          <a href="mailto:info@im3systems.com" className="hover:text-[hsl(var(--teal))] transition-colors">info@im3systems.com</a>
          <span className="hidden md:inline">•</span>
          <span>© {year} IM3 Systems</span>
        </div>
      </div>
    </footer>
  );
};

// --- Main Page Component ---

export default function Home() {
  return (
    <div className="min-h-screen font-sans bg-[hsl(var(--paper))] selection:bg-[hsl(var(--teal))] selection:text-white">
      <Header />
      <main>
        <Hero />
        <LogoStrip />
        <Services />
        <LeadMagnet />
        <Process />
        <TargetAudience />
        <Testimonials />
        <Offer />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
