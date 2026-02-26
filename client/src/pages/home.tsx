import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { 
  ArrowRight, 
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight, 
  Menu, 
  X,
  XCircle, 
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
  Calendar,
  Linkedin,
  ChevronsRight
} from "lucide-react";

const InteractiveHeroWidget = lazy(() => import("@/components/InteractiveHeroWidget").then(m => ({ default: m.InteractiveHeroWidget })));

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
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-4 md:px-6",
        isScrolled ? "py-2" : "py-3"
      )}
    >
      <div className="max-w-5xl mx-auto">
        <div className={cn(
          "flex items-center justify-between rounded-xl px-4 py-2 transition-all duration-300",
          isScrolled ? "bg-white/80 backdrop-blur-md shadow-sm border border-white/20" : "bg-transparent"
        )}>
          <div className="flex items-center gap-2">
            <img src="/assets/im3-logo.jpg" alt="IM3 Systems" className="h-8 w-auto object-contain rounded-md" />
          </div>

          <nav className="hidden md:flex items-center gap-5">
            <button onClick={() => scrollToSection('que')} className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">{t.nav.whatWeDo}</button>
            <button onClick={() => scrollToSection('como')} className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">{t.nav.howWeWork}</button>
            <button onClick={() => scrollToSection('para')} className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">{t.nav.forWhom}</button>
            <div className="flex items-center gap-0.5 border border-border/50 rounded-md p-0.5 bg-white/40">
              <button 
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors",
                  language === 'es' ? "bg-[hsl(var(--ink))]/10 text-[hsl(var(--ink))]" : "text-muted-foreground hover:bg-gray-100"
                )}
                onClick={() => setLanguage('es')}
              >
                ES
              </button>
              <button 
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors",
                  language === 'en' ? "bg-[hsl(var(--ink))]/10 text-[hsl(var(--ink))]" : "text-muted-foreground hover:bg-gray-100"
                )}
                onClick={() => setLanguage('en')}
              >
                EN
              </button>
            </div>
          </nav>

          <div className="hidden md:flex items-center">
            <button 
              onClick={openBooking}
              className="bg-[hsl(var(--ink))] text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:translate-y-[-1px] hover:shadow-md transition-all duration-300 flex items-center gap-1.5"
            >
              {t.nav.requestDiagnosis} <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
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

const PrioritiesCard = () => {
  const { t } = useI18n();
  const [active, setActive] = useState<number | null>(null);

  const items = [
    { icon: Check, title: t.priorities.clearExecution, desc: t.priorities.clearExecutionDesc },
    { icon: Layout, title: t.priorities.structure, desc: t.priorities.structureDesc },
    { icon: ShieldCheck, title: t.priorities.maintainable, desc: t.priorities.maintainableDesc },
  ];

  return (
    <div className="max-w-5xl mx-auto -mt-6 md:-mt-12 relative z-20 px-4">
      <Reveal delay={600}>
        <div className="bg-white rounded-2xl shadow-lg border border-border/60 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--teal))]/[0.03] via-transparent to-blue-50/30 pointer-events-none" />
          <div className="relative p-5 sm:p-6">
            <div className="mb-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-1 h-4 rounded-full bg-[hsl(var(--teal))] shrink-0" />
                <h3 className="text-sm font-bold text-[hsl(var(--ink))] tracking-tight">{t.priorities.title}</h3>
                <span className="text-gray-300 mx-0.5">·</span>
                <div className="flex items-center gap-1.5">
                  {t.priorities.flow.map((word: string, i: number) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-[hsl(var(--teal))]">{word}</span>
                      {i < t.priorities.flow.length - 1 && (
                        <ChevronsRight className="w-3 h-3 text-[hsl(var(--teal))]/50" />
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug pl-[19px]">{t.priorities.subtitle}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {items.map((item, i) => {
                const Icon = item.icon;
                const isActive = active === i;
                return (
                  <button
                    key={i}
                    data-testid={`priority-${i}`}
                    className={cn(
                      "priority-card relative text-left rounded-lg px-3 py-2.5 transition-all duration-300 cursor-pointer border overflow-hidden",
                      isActive
                        ? "bg-[#0B1C2D] border-[hsl(var(--teal))]/40 shadow-md"
                        : "bg-[#0F2438] border-[#1a3550] hover:bg-[#122d45]"
                    )}
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onClick={() => setActive(isActive ? null : i)}
                  >
                    {!isActive && (
                      <div className="absolute inset-0 priority-shimmer pointer-events-none" />
                    )}
                    <div className="flex items-center gap-2">
                      <h4 className={cn(
                        "font-semibold text-xs transition-colors duration-300",
                        isActive ? "text-white" : "text-gray-200"
                      )}>{item.title}</h4>
                      <Icon className={cn(
                        "w-3.5 h-3.5 shrink-0 transition-all duration-300",
                        isActive ? "text-[hsl(var(--teal))]" : "text-gray-400"
                      )} />
                    </div>
                    <div className={cn(
                      "overflow-hidden transition-all duration-300 ease-out",
                      isActive ? "max-h-20 opacity-100 mt-1.5" : "max-h-0 opacity-0"
                    )}>
                      <p className="text-[11px] text-gray-400 leading-relaxed">{item.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <style>{`
              @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
              .priority-shimmer {
                background: linear-gradient(90deg, transparent 0%, rgba(47,164,169,0.12) 50%, transparent 100%);
                animation: shimmer 2.5s ease-in-out infinite;
              }
            `}</style>
          </div>
        </div>
      </Reveal>
    </div>
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
    <section className="pt-20 pb-4 px-4 md:px-8">
      <div className="max-w-7xl mx-auto bg-[hsl(var(--ink))] rounded-[32px] overflow-hidden text-white relative shadow-2xl">
        {/* Abstract Background Elements */}
        <div className="absolute inset-0 opacity-20 mix-blend-soft-light" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.7\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }}></div>
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
                  <Suspense fallback={<div className="w-full h-full bg-[#0F172A] flex items-center justify-center"><div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /></div>}>
                    <InteractiveHeroWidget />
                  </Suspense>
                </div>
             </div>
             
             {/* Decorative blurry glow behind image */}
             <div className="absolute -inset-4 bg-gradient-to-tr from-[hsl(var(--teal))] to-blue-600 rounded-3xl blur-2xl opacity-20 -z-10 animate-pulse duration-3000"></div>
          </Reveal>
        </div>
      </div>
      
      {/* "Lo que priorizamos" Card below hero */}
      <PrioritiesCard />
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
    <div className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity duration-300 mix-blend-multiply flex items-center mx-8">
      <img 
        src={logo.src} 
        alt={logo.name} 
        className={cn(
          "w-auto object-contain rounded-xl",
          logo.name === "AMJ Solutions" ? "h-32 max-w-[240px]" : "h-14 max-w-[130px]"
        )}
      />
    </div>
  );
  
  return (
    <section className="py-6 overflow-hidden bg-[hsl(var(--paper))] relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-md h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
      <div className="max-w-7xl mx-auto px-8 mb-5 text-center">
        <p className="text-sm font-display font-semibold text-[hsl(var(--ink))]/60 tracking-wide">{t.logoStrip.title}</p>
      </div>
      <div className="relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[hsl(var(--paper))] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[hsl(var(--paper))] to-transparent z-10 pointer-events-none" />
        <div className="flex w-max animate-scroll">
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
          animation: scroll 60s linear infinite;
        }
      `}</style>
    </section>
  );
};

const AnimatedCounter = ({ value, suffix = "", prefix = "", duration = 1500 }: { value: number; suffix?: string; prefix?: string; duration?: number }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          observer.disconnect();
          const start = performance.now();
          const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(eased * value));
            if (progress < 1) {
              requestAnimationFrame(animate);
            }
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, duration, hasAnimated]);

  return <span ref={ref}>{prefix}{display}{suffix}</span>;
};

const CredibilityStrip = () => {
  const { t } = useI18n();
  const stats = [
    { num: 45, suffix: "+", label: t.credibility.systemsLabel },
    { num: 6, suffix: "", label: t.credibility.industriesLabel },
    { num: 100, suffix: "%", label: t.credibility.conversionLabel },
  ];

  return (
    <section className="py-4 px-4 md:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-center gap-6 sm:gap-10 md:gap-16">
          {stats.map((stat, i) => (
            <Reveal key={i} delay={i * 150}>
              <div className="flex items-center gap-6 sm:gap-10 md:gap-16">
                <div className="text-center">
                  <div className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-[hsl(var(--teal))]">
                    <AnimatedCounter value={stat.num} suffix={stat.suffix} duration={1200 + i * 300} />
                  </div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 font-medium tracking-wide">{stat.label}</div>
                </div>
                {i < stats.length - 1 && (
                  <div className="h-8 w-px bg-border/60 hidden sm:block" />
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
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
    <section id="que" className="py-6 sm:py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-3 leading-tight">{t.services.title}</h2>
            <p className="text-base sm:text-lg text-muted-foreground">{t.services.subtitle}</p>
          </Reveal>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {cards.map((card, i) => (
            <Reveal key={i} delay={i * 100}>
              <div className="bg-white p-7 rounded-2xl border border-border hover:shadow-lg transition-all duration-300 hover:border-[hsl(var(--teal))] group h-full">
                <div className={`w-11 h-11 rounded-xl ${card.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  {card.icon}
                </div>
                <h3 className="text-lg font-bold mb-3 text-[hsl(var(--ink))]">{card.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{card.text}</p>
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
    <section id="diagnostico" className="py-6 px-4 md:px-8">
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

const ProcessStep = ({ step, index, total }: { step: { num: string; title: string; text: string }; index: number; total: number }) => {
  const [hovered, setHovered] = useState(false);
  const isLast = index === total - 1;

  return (
    <div 
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start gap-6">
        <div className="flex flex-col items-center shrink-0 relative">
          <div className={cn(
            "relative w-14 h-14 rounded-2xl flex items-center justify-center font-display font-bold text-lg transition-all duration-500 z-10 cursor-pointer",
            hovered 
              ? "bg-[hsl(var(--teal))] text-white scale-110 shadow-[0_0_30px_rgba(47,164,169,0.4)]" 
              : "bg-[#0F2438] text-white shadow-lg"
          )}>
            {step.num}
            <div className={cn(
              "absolute inset-0 rounded-2xl border-2 transition-all duration-500",
              hovered 
                ? "border-[hsl(var(--teal))]/60 scale-125 opacity-0" 
                : "border-transparent opacity-0"
            )} />
            {!hovered && (
              <div className="absolute inset-0 rounded-2xl process-pulse pointer-events-none" />
            )}
          </div>
          {!isLast && (
            <div className="relative w-0.5 flex-1 min-h-[32px] mt-3 mb-1">
              <div className={cn(
                "absolute inset-0 rounded-full transition-all duration-500",
                hovered
                  ? "bg-gradient-to-b from-[hsl(var(--teal))] to-[hsl(var(--teal))]/10"
                  : "bg-gradient-to-b from-[#0F2438]/25 via-[hsl(var(--teal))]/15 to-transparent"
              )} />
            </div>
          )}
        </div>
        <div className={cn("flex-1", isLast ? "pb-2" : "pb-6")}>
          <div className="pt-3">
            <h4 className={cn(
              "text-xl sm:text-2xl font-display font-bold transition-all duration-300",
              hovered ? "text-[hsl(var(--teal))] translate-x-1" : "text-[hsl(var(--ink))]"
            )}>{step.title}</h4>
            <div className={cn(
              "overflow-hidden transition-all duration-500 ease-out",
              hovered ? "max-h-40 opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"
            )}>
              <div className="bg-white rounded-xl p-4 border border-[hsl(var(--teal))]/15 shadow-sm">
                <p className="text-sm text-muted-foreground leading-relaxed">{step.text}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Process = () => {
  const { t } = useI18n();

  return (
    <section id="como" className="py-6 sm:py-8 px-4 md:px-8 bg-[hsl(var(--paper))]">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] leading-tight">{t.process.title}</h2>
          </Reveal>
        </div>

        <div>
          {t.process.steps.map((step: { num: string; title: string; text: string }, i: number) => (
            <Reveal key={i} delay={i * 120}>
              <ProcessStep step={step} index={i} total={t.process.steps.length} />
            </Reveal>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes processPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(47,164,169,0.3); }
          50% { box-shadow: 0 0 0 8px rgba(47,164,169,0); }
        }
        .process-pulse {
          animation: processPulse 2.5s ease-in-out infinite;
        }
      `}</style>
    </section>
  );
};

const TargetAudience = () => {
  const { t } = useI18n();
  
  return (
    <section id="para" className="py-6 sm:py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-3 leading-tight">{t.targetAudience.title}</h2>
            <p className="text-base sm:text-lg text-muted-foreground">{t.targetAudience.subtitle}</p>
          </Reveal>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <Reveal>
            <div className="bg-[hsl(var(--ink))] text-white p-8 md:p-10 rounded-[2rem] shadow-xl relative overflow-hidden h-full">
               <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(var(--teal))] opacity-20 blur-[80px] rounded-full"></div>
               <div className="flex items-center gap-3 mb-7">
                 <CheckCircle2 className="w-7 h-7 text-[hsl(var(--teal))] shrink-0" strokeWidth={2} />
                 <h3 className="text-lg sm:text-xl font-bold">{t.targetAudience.fitsYouIf}</h3>
               </div>
               <ul className="space-y-5 relative z-10">
                 {t.targetAudience.fitsItems.map((item, i) => (
                   <li key={i} className="flex gap-3 items-start">
                     <div className="w-5 h-5 rounded-full border-2 border-[hsl(var(--teal))]/60 flex items-center justify-center shrink-0 mt-0.5">
                       <Check className="w-3 h-3 text-[hsl(var(--teal))]" strokeWidth={3} />
                     </div>
                     <span className="text-gray-300 leading-relaxed text-[15px]">{item}</span>
                   </li>
                 ))}
               </ul>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-border shadow-sm h-full">
               <div className="flex items-center gap-3 mb-7">
                 <XCircle className="w-7 h-7 text-red-400/80 shrink-0" strokeWidth={2} />
                 <h3 className="text-lg sm:text-xl font-bold text-gray-400">{t.targetAudience.notForYou}</h3>
               </div>
               <ul className="space-y-5">
                 {t.targetAudience.notForItems.map((item, i) => (
                   <li key={i} className="flex gap-3 items-start">
                     <div className="w-5 h-5 rounded-full border-2 border-red-200 flex items-center justify-center shrink-0 mt-0.5">
                       <X className="w-3 h-3 text-red-300" strokeWidth={3} />
                     </div>
                     <span className="text-muted-foreground leading-relaxed text-[15px]">{item}</span>
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
    <section className="py-6 sm:py-8 px-4 md:px-8 bg-[hsl(var(--paper))]">
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
    <section id="oferta" className="py-6 sm:py-8 px-4 md:px-8">
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
    <section id="contacto" className="py-5 px-4 md:px-8">
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

const FAQ = () => {
  const { t } = useI18n();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-6 sm:py-8 px-4 md:px-8 bg-[hsl(var(--paper))]">
      <div className="max-w-3xl mx-auto">
        <Reveal>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--ink))] mb-2 leading-tight">{t.faq.title}</h2>
          <p className="text-muted-foreground mb-8">{t.faq.subtitle}</p>
        </Reveal>
        <div className="space-y-3">
          {t.faq.items.map((item, i) => (
            <Reveal key={i} delay={i * 50}>
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <button
                  data-testid={`faq-toggle-${i}`}
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-[hsl(var(--ink))] pr-4">{item.question}</span>
                  <ChevronDown className={cn("w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200", openIndex === i && "rotate-180")} />
                </button>
                <div className={cn("overflow-hidden transition-all duration-300", openIndex === i ? "max-h-60 opacity-100" : "max-h-0 opacity-0")}>
                  <p className="px-5 pb-5 text-muted-foreground leading-relaxed">{item.answer}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

const Footer = () => {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="py-5 px-4 md:px-8 border-t border-border bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-1">
            <img src="/assets/im3-logo.jpg" alt="IM3 Systems" className="h-10 w-auto object-contain rounded-lg mb-4" />
            <p className="text-sm text-muted-foreground">
              <a href="mailto:info@im3systems.com" className="hover:text-[hsl(var(--teal))] transition-colors">info@im3systems.com</a>
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-[hsl(var(--ink))] mb-3">Navegación</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><button onClick={() => scrollToSection('que')} className="hover:text-[hsl(var(--teal))] transition-colors">{t.footer.whatWeDo}</button></li>
              <li><button onClick={() => scrollToSection('como')} className="hover:text-[hsl(var(--teal))] transition-colors">{t.footer.howWeWork}</button></li>
              <li><button onClick={() => scrollToSection('para')} className="hover:text-[hsl(var(--teal))] transition-colors">{t.footer.forWhom}</button></li>
              <li><button onClick={() => scrollToSection('faq')} className="hover:text-[hsl(var(--teal))] transition-colors">{t.footer.faq}</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-[hsl(var(--ink))] mb-3">Acciones</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><button onClick={() => window.open("https://calendar.im3systems.com", "_blank")} className="hover:text-[hsl(var(--teal))] transition-colors">{t.footer.diagnosis}</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-[hsl(var(--ink))] mb-3">Social</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="https://www.linkedin.com/company/im3-systems" target="_blank" rel="noopener noreferrer" className="hover:text-[hsl(var(--teal))] transition-colors flex items-center gap-2">
                  <Linkedin className="w-4 h-4" /> LinkedIn
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="pt-6 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <span>© {year} IM3 Systems</span>
        </div>
      </div>
    </footer>
  );
};

const SectionDivider = ({ variant = "default" }: { variant?: "default" | "teal" | "dot" }) => {
  if (variant === "dot") {
    return (
      <div className="flex items-center justify-center py-2">
        <div className="h-px w-16 bg-gradient-to-r from-transparent to-border" />
        <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--teal))]/40 mx-3" />
        <div className="h-px w-16 bg-gradient-to-l from-transparent to-border" />
      </div>
    );
  }
  if (variant === "teal") {
    return (
      <div className="flex items-center justify-center py-2">
        <div className="h-px w-full max-w-xs bg-gradient-to-r from-transparent via-[hsl(var(--teal))]/20 to-transparent" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center py-2">
      <div className="h-px w-full max-w-xs bg-gradient-to-r from-transparent via-border to-transparent" />
    </div>
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
        <SectionDivider variant="dot" />
        <CredibilityStrip />
        <SectionDivider variant="teal" />
        <Services />
        <SectionDivider variant="dot" />
        <LeadMagnet />
        <SectionDivider variant="teal" />
        <Process />
        <SectionDivider variant="dot" />
        <TargetAudience />
        <SectionDivider variant="teal" />
        <Testimonials />
        <SectionDivider variant="dot" />
        <Offer />
        <SectionDivider variant="teal" />
        <FAQ />
        <SectionDivider variant="dot" />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
