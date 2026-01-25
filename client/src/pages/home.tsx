import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
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
  const { t, language, setLanguage } = useI18n();
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
    window.open("https://calendar.im3systems.com", "_blank");
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
              <button 
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                  language === 'es' ? "bg-[hsl(var(--ink))]/10 text-[hsl(var(--ink))]" : "text-muted-foreground hover:bg-gray-100"
                )}
                onClick={() => setLanguage('es')}
              >
                <span className="text-base">🇪🇸</span> ES
              </button>
              <button 
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                  language === 'en' ? "bg-[hsl(var(--ink))]/10 text-[hsl(var(--ink))]" : "text-muted-foreground hover:bg-gray-100"
                )}
                onClick={() => setLanguage('en')}
              >
                <span className="text-base">🇺🇸</span> EN
              </button>
            </div>
            <button onClick={() => scrollToSection('que')} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">{t.nav.whatWeDo}</button>
            <button onClick={() => scrollToSection('como')} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">{t.nav.howWeWork}</button>
            <button onClick={() => scrollToSection('para')} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">{t.nav.forWhom}</button>
          </nav>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-4">
            <button 
              onClick={openBooking}
              className="bg-[hsl(var(--ink))] text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:translate-y-[-2px] hover:shadow-lg transition-all duration-300 flex items-center gap-2"
            >
              {t.nav.requestDiagnosis} <ArrowRight className="w-4 h-4" />
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
            <button 
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                language === 'es' ? "bg-[hsl(var(--ink))]/10 text-[hsl(var(--ink))]" : "text-muted-foreground hover:bg-gray-100"
              )}
              onClick={() => setLanguage('es')}
            >
              <span className="text-xl">🇪🇸</span> {t.nav.spanish}
            </button>
            <button 
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                language === 'en' ? "bg-[hsl(var(--ink))]/10 text-[hsl(var(--ink))]" : "text-muted-foreground hover:bg-gray-100"
              )}
              onClick={() => setLanguage('en')}
            >
              <span className="text-xl">🇺🇸</span> {t.nav.english}
            </button>
          </div>
          <button onClick={() => scrollToSection('que')} className="text-left text-lg font-medium py-2 border-b border-border/50">{t.nav.whatWeDo}</button>
          <button onClick={() => scrollToSection('como')} className="text-left text-lg font-medium py-2 border-b border-border/50">{t.nav.howWeWork}</button>
          <button onClick={() => scrollToSection('para')} className="text-left text-lg font-medium py-2 border-b border-border/50">{t.nav.forWhom}</button>
          <button 
            onClick={openBooking}
            className="bg-[hsl(var(--ink))] text-white px-5 py-3 rounded-xl text-center font-medium mt-2"
          >
            {t.nav.requestDiagnosis}
          </button>
        </div>
      )}
    </header>
  );
};

const Hero = () => {
  const { t } = useI18n();
  
  const badges = [
    { label: t.hero.badges.internalApps, icon: Layout },
    { label: t.hero.badges.automation, icon: Zap },
    { label: t.hero.badges.integrations, icon: Link2 },
    { label: t.hero.badges.dashboards, icon: Gauge },
    { label: t.hero.badges.appliedAI, icon: Sparkles },
    { label: t.hero.badges.maintainableSystems, icon: Layers },
  ];

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
                {t.hero.badge}
              </div>
            </Reveal>
            
            <Reveal delay={100}>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-[1.15] tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-gray-400">
                {t.hero.headline}
              </h1>
            </Reveal>

            <Reveal delay={200}>
              <p className="text-base sm:text-lg text-gray-300 leading-relaxed max-w-xl font-light">
                {t.hero.subheadline}
              </p>
            </Reveal>

            <Reveal delay={300}>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button 
                  onClick={() => window.open("https://calendar.im3systems.com", "_blank")}
                  className="bg-[hsl(var(--teal))] text-white px-6 py-3.5 rounded-xl font-semibold hover:bg-[#258a8e] transition-all hover:translate-y-[-2px] shadow-[0_10px_20px_-10px_rgba(47,164,169,0.3)] hover:shadow-[0_20px_40px_-15px_rgba(47,164,169,0.5)] ring-offset-2 ring-offset-[hsl(var(--ink))] focus:ring-2 focus:ring-[hsl(var(--teal))] text-center"
                >
                  {t.hero.cta}
                </button>
                <button 
                  onClick={() => document.getElementById('que')?.scrollIntoView({ behavior: 'smooth' })}
                  className="bg-white/5 border border-white/10 text-white px-6 py-3.5 rounded-xl font-medium hover:bg-white/10 transition-all backdrop-blur-sm text-center"
                >
                  {t.hero.secondary}
                </button>
              </div>
            </Reveal>

            <Reveal delay={400}>
              <div className="flex flex-wrap gap-2 sm:gap-3 pt-4 border-t border-white/5 mt-6 sm:mt-8">
                {badges.map((badge, i) => (
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
                <h3 className="text-xl font-bold text-[hsl(var(--ink))] mb-2">{t.priorities.title}</h3>
                <p className="text-sm text-muted-foreground">{t.priorities.subtitle}</p>
              </div>
              <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <div className="w-8 h-8 rounded-full bg-[hsl(var(--paper))] flex items-center justify-center mb-3 text-[hsl(var(--teal))]">
                    <Check className="w-4 h-4" />
                  </div>
                  <h4 className="font-semibold text-sm mb-1">{t.priorities.clearExecution}</h4>
                  <p className="text-xs text-muted-foreground">{t.priorities.clearExecutionDesc}</p>
                </div>
                <div>
                  <div className="w-8 h-8 rounded-full bg-[hsl(var(--paper))] flex items-center justify-center mb-3 text-[hsl(var(--teal))]">
                    <Layout className="w-4 h-4" />
                  </div>
                  <h4 className="font-semibold text-sm mb-1">{t.priorities.structure}</h4>
                  <p className="text-xs text-muted-foreground">{t.priorities.structureDesc}</p>
                </div>
                <div>
                  <div className="w-8 h-8 rounded-full bg-[hsl(var(--paper))] flex items-center justify-center mb-3 text-[hsl(var(--teal))]">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h4 className="font-semibold text-sm mb-1">{t.priorities.maintainable}</h4>
                  <p className="text-xs text-muted-foreground">{t.priorities.maintainableDesc}</p>
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
  const { t } = useI18n();
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
        <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">{t.logoStrip.title}</p>
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
  const { t } = useI18n();
  
  const cards = [
    {
      icon: <Layout className="w-6 h-6" />,
      title: t.services.internalApps,
      text: t.services.internalAppsDesc,
      color: "bg-blue-50 text-blue-600"
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: t.services.automation,
      text: t.services.automationDesc,
      color: "bg-amber-50 text-amber-600"
    },
    {
      icon: <Activity className="w-6 h-6" />,
      title: t.services.controlSystems,
      text: t.services.controlSystemsDesc,
      color: "bg-emerald-50 text-emerald-600"
    }
  ];

  return (
    <section id="que" className="py-10 sm:py-12 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="max-w-3xl mb-8">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-4 sm:mb-6 leading-tight">{t.services.title}</h2>
            <p className="text-xl text-muted-foreground">{t.services.subtitle}</p>
          </Reveal>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {cards.map((card, i) => (
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
  const { t } = useI18n();
  
  return (
    <section id="diagnostico" className="py-12 px-4 md:px-8">
      <Reveal>
        <div className="max-w-5xl mx-auto bg-gradient-to-r from-teal-50 to-blue-50 rounded-3xl p-8 md:p-12 border border-teal-100 flex flex-col md:flex-row items-center justify-between gap-8 shadow-sm">
          <div className="md:w-2/3">
            <div className="inline-block px-3 py-1 bg-white text-[hsl(var(--teal))] text-xs font-bold rounded-full mb-4 shadow-sm">{t.leadMagnet.badge}</div>
            <h3 className="text-2xl md:text-3xl font-bold text-[hsl(var(--ink))] mb-4">{t.leadMagnet.title}</h3>
            <p className="text-[hsl(var(--coal))] opacity-80 text-lg">
              {t.leadMagnet.description}
            </p>
          </div>
          <div className="md:w-1/3 flex justify-center md:justify-end">
             <button 
                onClick={() => window.open("https://calendar.im3systems.com", "_blank")}
                className="bg-[hsl(var(--teal))] text-white px-8 py-4 rounded-xl font-semibold hover:bg-[#258a8e] transition-all hover:shadow-lg whitespace-nowrap"
             >
                {t.leadMagnet.cta}
             </button>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

const Process = () => {
  const { t } = useI18n();

  return (
    <section id="como" className="py-10 sm:py-12 px-4 md:px-8 bg-[hsl(var(--paper))]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-4 leading-tight">{t.process.title}</h2>
            <p className="text-lg text-muted-foreground">{t.process.subtitle}</p>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {t.process.steps.map((step, i) => (
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
  const { t } = useI18n();
  
  return (
    <section id="para" className="py-10 sm:py-12 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-4 leading-tight">{t.targetAudience.title}</h2>
            <p className="text-xl text-muted-foreground">{t.targetAudience.subtitle}</p>
          </Reveal>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <Reveal>
            <div className="bg-[hsl(var(--ink))] text-white p-8 md:p-12 rounded-[2rem] shadow-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(var(--teal))] opacity-20 blur-[80px] rounded-full"></div>
               <h3 className="text-2xl font-bold mb-8 flex items-center gap-3">
                 <Check className="text-[hsl(var(--teal))]" /> {t.targetAudience.fitsYouIf}
               </h3>
               <ul className="space-y-4 relative z-10">
                 {t.targetAudience.fitsItems.map((item, i) => (
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
                 <X /> {t.targetAudience.notForYou}
               </h3>
               <ul className="space-y-4">
                 {t.targetAudience.notForItems.map((item, i) => (
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
  const { t } = useI18n();

  return (
    <section className="py-12 px-4 md:px-8 bg-[hsl(var(--paper))]">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-4 leading-tight">{t.testimonials.title}</h2>
          <p className="text-muted-foreground mb-8">{t.testimonials.subtitle}</p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6">
          {t.testimonials.reviews.map((review, i) => (
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
  const { t } = useI18n();
  
  return (
    <section id="oferta" className="py-12 px-4 md:px-8">
      <div className="max-w-4xl mx-auto text-center mb-8">
         <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-4 leading-tight">{t.offer.title}</h2>
            <p className="text-lg text-muted-foreground">{t.offer.subtitle}</p>
         </Reveal>
      </div>

      <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8 mb-8">
        <Reveal delay={100}>
          <div className="bg-white p-8 rounded-2xl border border-border h-full hover:border-[hsl(var(--teal))] transition-all hover:shadow-lg flex flex-col">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-6">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[hsl(var(--ink))] mb-4">{t.offer.fullImplementation} <span className="block text-sm font-normal text-muted-foreground mt-1">{t.offer.fullImplementationTag}</span></h3>
            <p className="text-muted-foreground mb-6 flex-grow">
              {t.offer.fullImplementationDesc}
            </p>
            <div className="pt-6 border-t border-border mt-auto">
              <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--ink))]">
                <Check className="w-4 h-4 text-[hsl(var(--teal))]" />
                {t.offer.fullImplementationBenefit}
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className="bg-white p-8 rounded-2xl border border-border h-full hover:border-[hsl(var(--teal))] transition-all hover:shadow-lg flex flex-col">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 mb-6">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[hsl(var(--ink))] mb-4">{t.offer.strategicGuidance} <span className="block text-sm font-normal text-muted-foreground mt-1">{t.offer.strategicGuidanceTag}</span></h3>
            <p className="text-muted-foreground mb-6 flex-grow">
              {t.offer.strategicGuidanceDesc}
            </p>
            <div className="pt-6 border-t border-border mt-auto">
              <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--ink))]">
                <Check className="w-4 h-4 text-[hsl(var(--teal))]" />
                {t.offer.strategicGuidanceBenefit}
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal delay={300}>
        <div className="max-w-3xl mx-auto bg-[hsl(var(--paper))] rounded-2xl p-8 text-center border border-border">
          <h3 className="text-lg font-bold mb-2 text-[hsl(var(--ink))]">{t.offer.noSalesPressure}</h3>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            {t.offer.noSalesPressureDesc}
          </p>
          <button 
            onClick={() => window.open("https://calendar.im3systems.com", "_blank")}
            className="text-[hsl(var(--teal))] font-bold hover:text-[hsl(var(--ink))] transition-colors flex items-center justify-center gap-2 mx-auto"
          >
            {t.offer.scheduleConversation} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </Reveal>
    </section>
  );
};


const Contact = () => {
  const { t } = useI18n();
  
  return (
    <section id="contacto" className="py-16 px-4 md:px-8">
      <div className="max-w-3xl mx-auto text-center">
        <Reveal>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-6 leading-tight">
            {t.contact.title}
          </h2>
          <p className="text-xl text-muted-foreground mb-10">
            {t.contact.subtitle}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button 
              onClick={() => window.open("https://calendar.im3systems.com", "_blank")}
              className="bg-[hsl(var(--ink))] text-white px-8 py-4 rounded-xl font-bold hover:bg-[hsl(var(--coal))] transition-all flex items-center justify-center gap-2"
            >
              <Calendar className="w-5 h-5" /> {t.contact.scheduleCall}
            </button>
            <button 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="bg-white border border-border text-[hsl(var(--ink))] px-8 py-4 rounded-xl font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
            >
              {t.contact.backToTop} <ArrowUpRight className="w-5 h-5" />
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
