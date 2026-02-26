import { useEffect, useRef, useState, useCallback, lazy, Suspense } from "react";
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
  ChevronsRight,
  Sun,
  Moon
} from "lucide-react";
import { useDarkMode } from "@/hooks/useDarkMode";
import im3Logo from "@assets/Mesa_de_trabajo_13_1772070483914.png"
import headshotSebastian from "@assets/stock_images/headshot_sebastian.png"
import headshotNicolas from "@assets/stock_images/headshot_nicolas.png"
import headshotAndres from "@assets/stock_images/headshot_andres.png"
import headshotCamila from "@assets/stock_images/headshot_camila.png"
import headshotDiego from "@assets/stock_images/headshot_diego.png"
import headshotValentina from "@assets/stock_images/headshot_valentina.png";

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

const DarkModeToggle = ({ isDark, toggle }: { isDark: boolean; toggle: () => void }) => (
  <button
    data-testid="dark-mode-toggle"
    onClick={toggle}
    className={cn(
      "relative w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300",
      isDark 
        ? "bg-[hsl(var(--teal))]/15 text-[hsl(var(--teal))] hover:bg-[hsl(var(--teal))]/25" 
        : "bg-[hsl(var(--ink))]/5 text-[hsl(var(--ink))]/70 hover:bg-[hsl(var(--ink))]/10"
    )}
    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
  >
    <Sun className={cn("w-4 h-4 absolute transition-all duration-300", isDark ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100")} />
    <Moon className={cn("w-4 h-4 absolute transition-all duration-300", isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-0")} />
  </button>
);

const Header = () => {
  const { t, language, setLanguage } = useI18n();
  const { isDark, toggle: toggleDark } = useDarkMode();
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
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-3 sm:px-4 md:px-6",
        isScrolled ? "py-1.5 sm:py-2" : "py-2 sm:py-3"
      )}
    >
      <div className="max-w-5xl mx-auto">
        <div className={cn(
          "flex items-center justify-between rounded-xl px-3 sm:px-4 py-2 transition-all duration-300 backdrop-blur-md",
          isDark 
            ? "bg-[hsl(220,25%,12%)]/80 border border-white/10 shadow-sm" 
            : "bg-white/80 border border-black/5 shadow-sm"
        )}>
          <div className="flex items-center gap-2">
            <img 
              src={im3Logo} 
              alt="IM3 Systems" 
              className="h-7 sm:h-8 w-auto object-contain transition-all duration-300"
              style={isDark ? { filter: "brightness(0) invert(1)" } : undefined}
            />
          </div>

          <nav className="hidden md:flex items-center gap-5">
            <button onClick={() => scrollToSection('que')} className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">{t.nav.whatWeDo}</button>
            <button onClick={() => scrollToSection('como')} className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">{t.nav.howWeWork}</button>
            <button onClick={() => scrollToSection('para')} className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">{t.nav.forWhom}</button>
            <div className="flex items-center gap-0.5 border border-[hsl(var(--divider))] rounded-md p-0.5 bg-[hsl(var(--surface))]/40">
              <button 
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors",
                  language === 'es' ? "bg-[hsl(var(--text-primary))]/10 text-[hsl(var(--text-primary))]" : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-hover))]"
                )}
                onClick={() => setLanguage('es')}
              >
                ES
              </button>
              <button 
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors",
                  language === 'en' ? "bg-[hsl(var(--text-primary))]/10 text-[hsl(var(--text-primary))]" : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-hover))]"
                )}
                onClick={() => setLanguage('en')}
              >
                EN
              </button>
            </div>
            <DarkModeToggle isDark={isDark} toggle={toggleDark} />
          </nav>

          <div className="hidden md:flex items-center">
            <button 
              onClick={openBooking}
              className="group relative bg-[hsl(var(--teal))] text-white px-7 py-3 rounded-xl text-sm font-bold hover:translate-y-[-2px] hover:shadow-[0_10px_25px_-6px_rgba(47,164,169,0.6)] transition-all duration-300 flex items-center gap-2.5 overflow-hidden header-cta-glow"
            >
              <span className="relative z-10 flex items-center gap-2">
                {t.nav.requestDiagnosis} <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-2" />
              </span>
              <span className="absolute inset-0 cta-shimmer pointer-events-none" />
            </button>
          </div>

          <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="absolute top-full left-3 right-3 sm:left-4 sm:right-4 mt-2 p-5 sm:p-6 bg-[hsl(var(--surface))] rounded-2xl shadow-xl border border-[hsl(var(--divider))] md:hidden flex flex-col gap-3 sm:gap-4 animate-in slide-in-from-top-4 fade-in duration-200">
          <div className="flex items-center justify-center gap-2 pb-4 border-b border-[hsl(var(--divider))]">
            <button 
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                language === 'es' ? "bg-[hsl(var(--text-primary))]/10 text-[hsl(var(--text-primary))]" : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-hover))]"
              )}
              onClick={() => setLanguage('es')}
            >
              <span className="text-xl">🇪🇸</span> {t.nav.spanish}
            </button>
            <button 
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                language === 'en' ? "bg-[hsl(var(--text-primary))]/10 text-[hsl(var(--text-primary))]" : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-hover))]"
              )}
              onClick={() => setLanguage('en')}
            >
              <span className="text-xl">🇺🇸</span> {t.nav.english}
            </button>
            <DarkModeToggle isDark={isDark} toggle={toggleDark} />
          </div>
          <button onClick={() => scrollToSection('que')} className="text-left text-lg font-medium py-2 border-b border-[hsl(var(--divider))] text-[hsl(var(--text-primary))]">{t.nav.whatWeDo}</button>
          <button onClick={() => scrollToSection('como')} className="text-left text-lg font-medium py-2 border-b border-[hsl(var(--divider))] text-[hsl(var(--text-primary))]">{t.nav.howWeWork}</button>
          <button onClick={() => scrollToSection('para')} className="text-left text-lg font-medium py-2 border-b border-[hsl(var(--divider))] text-[hsl(var(--text-primary))]">{t.nav.forWhom}</button>
          <button 
            onClick={openBooking}
            className="group relative bg-[hsl(var(--teal))] text-white px-5 py-3 rounded-xl text-center font-medium mt-2 overflow-hidden cta-glow"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {t.nav.requestDiagnosis} <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5" />
            </span>
            <span className="absolute inset-0 cta-shimmer pointer-events-none" />
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
    <div className="max-w-5xl mx-auto -mt-4 sm:-mt-6 md:-mt-12 relative z-20 px-3 sm:px-4">
      <Reveal delay={600}>
        <div className="bg-[hsl(var(--surface))] rounded-2xl shadow-lg border border-[hsl(var(--divider))]/60 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--teal))]/[0.03] via-transparent to-[hsl(var(--teal))]/[0.02] pointer-events-none" />
          <div className="relative p-4 sm:p-5 md:p-6">
            <div className="mb-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-1 h-4 rounded-full bg-[hsl(var(--teal))] shrink-0" />
                <h3 className="text-sm font-bold text-[hsl(var(--text-primary))] tracking-tight">{t.priorities.title}</h3>
                <span className="text-[hsl(var(--text-tertiary))] mx-0.5">·</span>
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
    <section className="pt-16 sm:pt-20 pb-4 px-3 sm:px-4 md:px-8">
      <div className="max-w-7xl mx-auto bg-[hsl(var(--hero-bg))] rounded-2xl sm:rounded-[32px] overflow-hidden text-white relative shadow-2xl">
        <div className="absolute inset-0 opacity-20 mix-blend-soft-light" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.7\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }}></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[hsl(var(--teal))] opacity-10 blur-[120px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/4"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-600 opacity-10 blur-[100px] rounded-full pointer-events-none translate-y-1/4 -translate-x-1/4"></div>

        <div className="grid md:grid-cols-2 gap-6 sm:gap-8 md:gap-12 p-5 sm:p-8 md:p-16 relative z-10 items-center">
          <div className="space-y-8">
            <Reveal>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-medium tracking-wide text-[hsl(var(--teal))] shadow-lg shadow-teal-900/20 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-[hsl(var(--teal))] animate-pulse"></span>
                {t.hero.badge}
              </div>
            </Reveal>
            
            <Reveal delay={100}>
              <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-[1.15] tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-gray-400">
                {t.hero.headline}
              </h1>
            </Reveal>

            <Reveal delay={200}>
              <p className="text-sm sm:text-base md:text-lg text-gray-300 leading-relaxed max-w-xl font-light">
                {t.hero.subheadline}
              </p>
            </Reveal>

            <Reveal delay={300}>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button 
                  onClick={() => window.open("https://calendar.im3systems.com", "_blank")}
                  className="group relative bg-[hsl(var(--teal))] text-white px-6 py-3.5 rounded-xl font-semibold hover:bg-[#258a8e] transition-all hover:translate-y-[-2px] shadow-[0_10px_20px_-10px_rgba(47,164,169,0.3)] hover:shadow-[0_20px_40px_-15px_rgba(47,164,169,0.5)] ring-offset-2 ring-offset-[hsl(var(--hero-bg))] focus:ring-2 focus:ring-[hsl(var(--teal))] text-center overflow-hidden cta-glow"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {t.hero.cta} <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5" />
                  </span>
                  <span className="absolute inset-0 cta-shimmer pointer-events-none" />
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
              <div className="flex flex-wrap gap-1.5 sm:gap-2 md:gap-3 pt-4 border-t border-white/5 mt-4 sm:mt-8">
                {badges.map((badge, i) => (
                  <span 
                    key={i} 
                    className="group px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] sm:text-xs text-gray-400 font-mono hover:bg-[hsl(var(--teal))]/10 hover:border-[hsl(var(--teal))]/30 hover:text-[hsl(var(--teal))] transition-all duration-300 cursor-default flex items-center gap-1.5 sm:gap-2"
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
                <div className="absolute inset-0 bg-[#0F172A]">
                  <Suspense fallback={<div className="w-full h-full bg-[#0F172A] flex items-center justify-center"><div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /></div>}>
                    <InteractiveHeroWidget />
                  </Suspense>
                </div>
             </div>
             
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
    <div className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity duration-300 flex items-center mx-4 sm:mx-8">
      <img 
        src={logo.src} 
        alt={logo.name} 
        className={cn(
          "w-auto object-contain rounded-xl",
          logo.name === "AMJ Solutions" ? "h-20 sm:h-32 max-w-[160px] sm:max-w-[240px]" : "h-10 sm:h-14 max-w-[90px] sm:max-w-[130px]"
        )}
      />
    </div>
  );
  
  return (
    <section className="py-4 sm:py-6 overflow-hidden bg-background relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-md h-px bg-gradient-to-r from-transparent via-[hsl(var(--divider))]/60 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mb-4 sm:mb-5 text-center">
        <p className="text-sm font-display font-semibold text-[hsl(var(--text-secondary))] tracking-wide">{t.logoStrip.title}</p>
      </div>
      <div className="relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
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
    <section className="py-4 px-3 sm:px-4 md:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-center gap-4 sm:gap-10 md:gap-16">
          {stats.map((stat, i) => (
            <Reveal key={i} delay={i * 150}>
              <div className="flex items-center gap-4 sm:gap-10 md:gap-16">
                <div className="text-center">
                  <div className="text-2xl sm:text-4xl md:text-5xl font-display font-bold text-[hsl(var(--teal))]">
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
      color: "bg-[hsl(var(--icon-bg-blue))] text-[hsl(var(--icon-fg-blue))]"
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: t.services.automation,
      text: t.services.automationDesc,
      color: "bg-[hsl(var(--icon-bg-amber))] text-[hsl(var(--icon-fg-amber))]"
    },
    {
      icon: <Activity className="w-6 h-6" />,
      title: t.services.controlSystems,
      text: t.services.controlSystemsDesc,
      color: "bg-[hsl(var(--icon-bg-emerald))] text-[hsl(var(--icon-fg-emerald))]"
    }
  ];

  return (
    <section id="que" className="py-6 sm:py-8 px-3 sm:px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--text-primary))] mb-3 leading-tight">{t.services.title}</h2>
            <p className="text-base sm:text-lg text-muted-foreground">{t.services.subtitle}</p>
          </Reveal>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {cards.map((card, i) => (
            <Reveal key={i} delay={i * 100}>
              <div className="bg-[hsl(var(--surface))] p-5 sm:p-7 rounded-2xl border border-[hsl(var(--divider))] hover:shadow-lg transition-all duration-300 hover:border-[hsl(var(--teal))] group h-full">
                <div className={`w-11 h-11 rounded-xl ${card.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  {card.icon}
                </div>
                <h3 className="text-lg font-bold mb-3 text-[hsl(var(--text-primary))]">{card.title}</h3>
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
    <section id="diagnostico" className="py-6 px-3 sm:px-4 md:px-8">
      <Reveal>
        <div className="max-w-5xl mx-auto bg-gradient-to-r from-[hsl(var(--lead-from))] to-[hsl(var(--lead-to))] rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-12 border border-[hsl(var(--lead-border))] flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-8 shadow-sm">
          <div className="md:w-2/3">
            <div className="inline-block px-3 py-1 bg-[hsl(var(--surface))] text-[hsl(var(--teal))] text-xs font-bold rounded-full mb-4 shadow-sm">{t.leadMagnet.badge}</div>
            <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-[hsl(var(--text-primary))] mb-3 sm:mb-4">{t.leadMagnet.title}</h3>
            <p className="text-[hsl(var(--text-secondary))] text-base sm:text-lg">
              {t.leadMagnet.description}
            </p>
          </div>
          <div className="w-full md:w-1/3 flex justify-center md:justify-end">
             <button 
                onClick={() => window.open("https://calendar.im3systems.com", "_blank")}
                className="group relative bg-[hsl(var(--teal))] text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl font-semibold hover:bg-[#258a8e] transition-all hover:shadow-lg hover:translate-y-[-2px] w-full md:w-auto overflow-hidden cta-glow"
             >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {t.leadMagnet.cta} <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5" />
                </span>
                <span className="absolute inset-0 cta-shimmer pointer-events-none" />
             </button>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

const Process = () => {
  const { t } = useI18n();
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  const steps = t.process.steps as { num: string; title: string; text: string }[];
  const total = steps.length;

  return (
    <section id="como" className="py-6 sm:py-8 px-3 sm:px-4 md:px-8 bg-background">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--text-primary))] leading-tight">{t.process.title}</h2>
          </Reveal>
        </div>

        <div className="relative">
          {steps.map((step, i) => {
            const isActive = hoveredStep === i;
            const isPast = hoveredStep !== null && hoveredStep > i;
            const isLast = i === total - 1;

            return (
              <Reveal key={i} delay={i * 120}>
                <div
                  className="relative cursor-pointer"
                  onMouseEnter={() => setHoveredStep(i)}
                  onMouseLeave={() => setHoveredStep(null)}
                  onClick={() => setHoveredStep(hoveredStep === i ? null : i)}
                >
                  <div className="flex items-start gap-4 sm:gap-6">
                    <div className="flex flex-col items-center shrink-0 relative">
                      <div className={cn(
                        "relative w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center font-display font-bold text-base sm:text-lg z-10 transition-all duration-500",
                        isActive
                          ? "bg-[hsl(var(--teal))] text-white scale-105 shadow-[0_0_20px_rgba(47,164,169,0.3)]"
                          : isPast
                            ? "bg-[hsl(var(--teal))]/50 text-white shadow-md"
                            : "bg-[hsl(var(--step-bg))] text-white shadow-lg"
                      )}>
                        {step.num}
                      </div>
                      {!isLast && (
                        <div className="relative w-0.5 flex-1 min-h-[32px] mt-3 mb-1">
                          <div className="absolute inset-0 rounded-full bg-[hsl(var(--step-line))]/15" />
                          <div
                            className="absolute top-0 left-0 right-0 rounded-full bg-[hsl(var(--teal))] transition-all duration-500 ease-out"
                            style={{ height: isPast || isActive ? "100%" : "0%" }}
                          />
                        </div>
                      )}
                    </div>
                    <div className={cn("flex-1", isLast ? "pb-2" : "pb-6")}>
                      <div className="pt-3">
                        <h4 className={cn(
                          "text-xl sm:text-2xl font-display font-bold transition-all duration-300",
                          isActive ? "text-[hsl(var(--teal))]" : "text-[hsl(var(--text-primary))]"
                        )}>{step.title}</h4>
                        <div className={cn(
                          "overflow-hidden transition-all duration-400 ease-out",
                          isActive ? "max-h-40 opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"
                        )}>
                          <div className="bg-[hsl(var(--surface))] rounded-xl p-4 border border-[hsl(var(--teal))]/15 shadow-sm">
                            <p className="text-sm text-muted-foreground leading-relaxed">{step.text}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}

          <Reveal delay={total * 120}>
            <div className={cn(
              "flex items-center gap-3 pt-4 pl-[22px] transition-all duration-500",
              hoveredStep === total - 1 ? "opacity-100" : "opacity-30"
            )}>
              <div className="flex items-center gap-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[hsl(var(--teal))]">
                  <path d="M12 20C12 20 4 14 4 8C4 5 7 3 12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray={hoveredStep === total - 1 ? "0" : "4 4"} className="transition-all duration-500" />
                  <path d="M9 5L12 3L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs font-medium text-[hsl(var(--teal))]/70">{t.process.cycleLabel || "Ciclo continuo"}</span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
};

const TargetAudience = () => {
  const { t } = useI18n();
  
  return (
    <section id="para" className="py-6 sm:py-8 px-3 sm:px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--text-primary))] mb-3 leading-tight">{t.targetAudience.title}</h2>
            <p className="text-base sm:text-lg text-muted-foreground">{t.targetAudience.subtitle}</p>
          </Reveal>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <Reveal>
            <div className="bg-[hsl(var(--hero-bg))] text-white p-6 sm:p-8 md:p-10 rounded-2xl sm:rounded-[2rem] shadow-xl relative overflow-hidden h-full">
               <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(var(--teal))] opacity-20 blur-[80px] rounded-full"></div>
               <div className="flex items-center gap-3 mb-7">
                 <CheckCircle2 className="w-7 h-7 text-[hsl(var(--teal))] shrink-0" strokeWidth={2} />
                 <h3 className="text-lg sm:text-xl font-bold text-white relative z-10">{t.targetAudience.fitsYouIf}</h3>
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
            <div className="bg-[hsl(var(--surface))] p-6 sm:p-8 md:p-10 rounded-2xl sm:rounded-[2rem] border border-[hsl(var(--divider))] shadow-sm h-full">
               <div className="flex items-center gap-3 mb-7">
                 <XCircle className="w-7 h-7 text-[hsl(var(--icon-fg-red))]/80 shrink-0" strokeWidth={2} />
                 <h3 className="text-lg sm:text-xl font-bold text-[hsl(var(--text-tertiary))]">{t.targetAudience.notForYou}</h3>
               </div>
               <ul className="space-y-5">
                 {t.targetAudience.notForItems.map((item, i) => (
                   <li key={i} className="flex gap-3 items-start">
                     <div className="w-5 h-5 rounded-full border-2 border-[hsl(var(--icon-fg-red))]/30 flex items-center justify-center shrink-0 mt-0.5">
                       <X className="w-3 h-3 text-[hsl(var(--icon-fg-red))]/60" strokeWidth={3} />
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

const avatarMap: Record<string, string> = {
  "Sebastián Garzón": headshotSebastian,
  "Nicolás Hernández": headshotNicolas,
  "Andrés Villamizar": headshotAndres,
  "Camila Restrepo": headshotCamila,
  "Diego Morales": headshotDiego,
  "Valentina Ospina": headshotValentina,
};

const TestimonialCard = ({ review, isFeatured, featuredLabel }: { review: { quote: string; author: string; role: string; featured?: boolean }; isFeatured?: boolean; featuredLabel?: string }) => (
  <div className={cn(
    "p-6 sm:p-8 rounded-2xl border shadow-sm h-full flex flex-col justify-between shrink-0 transition-all duration-300",
    isFeatured
      ? "bg-[hsl(var(--surface))] border-[hsl(var(--teal))]/20 ring-1 ring-[hsl(var(--teal))]/10"
      : "bg-[hsl(var(--surface))] border-[hsl(var(--divider))]"
  )}>
    <div>
      {isFeatured && (
        <div className="inline-block px-2 py-0.5 bg-[hsl(var(--teal))]/10 text-[hsl(var(--teal))] text-[10px] font-bold rounded-full mb-3 uppercase tracking-wider">
          {featuredLabel || "Featured client"}
        </div>
      )}
      <p className="text-base sm:text-lg text-[hsl(var(--text-primary))] mb-6 font-medium leading-relaxed">"{review.quote}"</p>
    </div>
    <div className="flex items-center gap-3">
      {avatarMap[review.author] ? (
        <img
          src={avatarMap[review.author]}
          alt={review.author}
          className={cn(
            "w-11 h-11 rounded-full object-cover",
            isFeatured ? "ring-2 ring-[hsl(var(--teal))]/30" : ""
          )}
        />
      ) : (
        <div className={cn(
          "w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm",
          isFeatured
            ? "bg-[hsl(var(--teal))]/15 text-[hsl(var(--teal))]"
            : "bg-[hsl(var(--avatar-bg))] text-[hsl(var(--avatar-fg))]"
        )}>
          {review.author.split(' ').map((n: string) => n[0]).join('')}
        </div>
      )}
      <div>
        <div className="font-bold text-sm text-[hsl(var(--text-primary))]">{review.author}</div>
        <div className="text-xs text-muted-foreground">{review.role}</div>
      </div>
    </div>
  </div>
);

const Testimonials = () => {
  const { t } = useI18n();
  const reviews = t.testimonials.reviews as { quote: string; author: string; role: string; featured?: boolean }[];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const touchStartX = useRef(0);

  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    const updateVisible = () => setVisibleCount(window.innerWidth >= 768 ? 2 : 1);
    updateVisible();
    window.addEventListener('resize', updateVisible);
    return () => window.removeEventListener('resize', updateVisible);
  }, []);

  const loopedReviews = [...reviews, ...reviews, ...reviews];
  const realCount = reviews.length;
  const startOffset = realCount;

  useEffect(() => {
    setCurrentIndex(startOffset);
    setIsTransitioning(false);
    requestAnimationFrame(() => setIsTransitioning(true));
  }, []);

  const normalizeIndex = useCallback((idx: number) => {
    return ((idx % realCount) + realCount) % realCount;
  }, [realCount]);

  const snapToReal = useCallback((idx: number) => {
    if (idx < realCount || idx >= realCount * 2) {
      const mapped = startOffset + normalizeIndex(idx);
      setIsTransitioning(false);
      setCurrentIndex(mapped);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsTransitioning(true));
      });
    }
  }, [realCount, startOffset, normalizeIndex]);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => prev + 1);
    }, 4000);
    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  useEffect(() => {
    if (!isTransitioning) return;
    const timeout = setTimeout(() => snapToReal(currentIndex), 550);
    return () => clearTimeout(timeout);
  }, [currentIndex, isTransitioning, snapToReal]);

  const goTo = (idx: number) => {
    setIsTransitioning(true);
    setCurrentIndex(idx);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 8000);
  };

  const goNext = () => goTo(currentIndex + 1);
  const goPrev = () => goTo(currentIndex - 1);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
  };

  const activeDot = normalizeIndex(currentIndex);

  return (
    <section className="py-6 sm:py-8 px-3 sm:px-4 md:px-8 bg-background">
      <div className="max-w-5xl mx-auto">
        <Reveal>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--text-primary))] mb-4 leading-tight">{t.testimonials.title}</h2>
          <p className="text-muted-foreground mb-8">{t.testimonials.subtitle}</p>
        </Reveal>

        <div className="relative">
          <div
            className="overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className={cn("flex", isTransitioning && "transition-transform duration-500 ease-out")}
              style={{
                gap: '1.5rem',
                transform: `translateX(calc(-${currentIndex} * (${100 / visibleCount}% + ${1.5 / visibleCount}rem)))`
              }}
            >
              {loopedReviews.map((review, i) => (
                <div
                  key={i}
                  data-testid={`testimonial-card-${i % realCount}`}
                  className="shrink-0"
                  style={{ width: `calc(${100 / visibleCount}% - ${(visibleCount - 1) * 1.5 / visibleCount}rem)` }}
                >
                  <TestimonialCard review={review} isFeatured={review.featured} featuredLabel={t.testimonials.featuredLabel} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              data-testid="testimonial-prev"
              onClick={goPrev}
              className="w-8 h-8 rounded-full border border-[hsl(var(--teal))]/30 text-[hsl(var(--teal))] hover:bg-[hsl(var(--teal))]/10 flex items-center justify-center transition-all"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>

            <div className="flex gap-1.5">
              {reviews.map((_, i) => (
                <button
                  key={i}
                  data-testid={`testimonial-dot-${i}`}
                  onClick={() => goTo(startOffset + i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    activeDot === i
                      ? "bg-[hsl(var(--teal))] w-5"
                      : "bg-[hsl(var(--divider))] w-1.5 hover:bg-[hsl(var(--teal))]/40"
                  )}
                />
              ))}
            </div>

            <button
              data-testid="testimonial-next"
              onClick={goNext}
              className="w-8 h-8 rounded-full border border-[hsl(var(--teal))]/30 text-[hsl(var(--teal))] hover:bg-[hsl(var(--teal))]/10 flex items-center justify-center transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

const Offer = () => {
  const { t } = useI18n();
  
  return (
    <section id="oferta" className="py-6 sm:py-8 px-3 sm:px-4 md:px-8">
      <div className="max-w-4xl mx-auto text-center mb-8">
         <Reveal>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--text-primary))] mb-4 leading-tight">{t.offer.title}</h2>
            <p className="text-lg text-muted-foreground">{t.offer.subtitle}</p>
         </Reveal>
      </div>

      <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8 mb-8">
        <Reveal delay={100}>
          <div className="bg-[hsl(var(--surface))] p-6 sm:p-8 rounded-2xl border border-[hsl(var(--divider))] h-full hover:border-[hsl(var(--teal))] transition-all hover:shadow-lg flex flex-col">
            <div className="w-12 h-12 bg-[hsl(var(--icon-bg-blue))] rounded-xl flex items-center justify-center text-[hsl(var(--icon-fg-blue))] mb-6">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[hsl(var(--text-primary))] mb-4">{t.offer.fullImplementation} <span className="block text-sm font-normal text-muted-foreground mt-1">{t.offer.fullImplementationTag}</span></h3>
            <p className="text-muted-foreground mb-6 flex-grow">
              {t.offer.fullImplementationDesc}
            </p>
            <div className="pt-6 border-t border-[hsl(var(--divider))] mt-auto">
              <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--text-primary))]">
                <Check className="w-4 h-4 text-[hsl(var(--teal))]" />
                {t.offer.fullImplementationBenefit}
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className="bg-[hsl(var(--surface))] p-6 sm:p-8 rounded-2xl border border-[hsl(var(--divider))] h-full hover:border-[hsl(var(--teal))] transition-all hover:shadow-lg flex flex-col">
            <div className="w-12 h-12 bg-[hsl(var(--icon-bg-amber))] rounded-xl flex items-center justify-center text-[hsl(var(--icon-fg-amber))] mb-6">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[hsl(var(--text-primary))] mb-4">{t.offer.strategicGuidance} <span className="block text-sm font-normal text-muted-foreground mt-1">{t.offer.strategicGuidanceTag}</span></h3>
            <p className="text-muted-foreground mb-6 flex-grow">
              {t.offer.strategicGuidanceDesc}
            </p>
            <div className="pt-6 border-t border-[hsl(var(--divider))] mt-auto">
              <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--text-primary))]">
                <Check className="w-4 h-4 text-[hsl(var(--teal))]" />
                {t.offer.strategicGuidanceBenefit}
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal delay={300}>
        <div className="max-w-3xl mx-auto bg-[hsl(var(--surface-raised))] rounded-2xl p-6 sm:p-8 text-center border border-[hsl(var(--divider))]">
          <h3 className="text-lg font-bold mb-2 text-[hsl(var(--text-primary))]">{t.offer.noSalesPressure}</h3>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            {t.offer.noSalesPressureDesc}
          </p>
          <button 
            onClick={() => window.open("https://calendar.im3systems.com", "_blank")}
            className="text-[hsl(var(--teal))] font-bold hover:text-[hsl(var(--text-primary))] transition-colors flex items-center justify-center gap-2 mx-auto"
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
    <section id="contacto" className="py-5 px-3 sm:px-4 md:px-8">
      <div className="max-w-3xl mx-auto text-center">
        <Reveal>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--text-primary))] mb-6 leading-tight">
            {t.contact.title}
          </h2>
          <p className="text-base sm:text-xl text-muted-foreground mb-8 sm:mb-10">
            {t.contact.subtitle}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button 
              onClick={() => window.open("https://calendar.im3systems.com", "_blank")}
              className="group relative bg-[hsl(var(--teal))] text-white px-8 py-4 rounded-xl font-bold hover:translate-y-[-2px] hover:shadow-[0_10px_25px_-6px_rgba(47,164,169,0.6)] transition-all flex items-center justify-center gap-2 overflow-hidden cta-glow"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <Calendar className="w-5 h-5" /> {t.contact.scheduleCall} <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5" />
              </span>
              <span className="absolute inset-0 cta-shimmer pointer-events-none" />
            </button>
            <button 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="bg-[hsl(var(--surface))] border border-[hsl(var(--divider))] text-[hsl(var(--text-primary))] px-8 py-4 rounded-xl font-bold hover:bg-[hsl(var(--surface-hover))] transition-all flex items-center justify-center gap-2"
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
    <section id="faq" className="py-6 sm:py-8 px-3 sm:px-4 md:px-8 bg-background">
      <div className="max-w-3xl mx-auto">
        <Reveal>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[hsl(var(--text-primary))] mb-2 leading-tight">{t.faq.title}</h2>
          <p className="text-muted-foreground mb-8">{t.faq.subtitle}</p>
        </Reveal>
        <div className="space-y-3">
          {t.faq.items.map((item, i) => (
            <Reveal key={i} delay={i * 50}>
              <div className="bg-[hsl(var(--surface))] rounded-xl border border-[hsl(var(--divider))] overflow-hidden">
                <button
                  data-testid={`faq-toggle-${i}`}
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-[hsl(var(--surface-hover))] transition-colors"
                >
                  <span className="font-semibold text-[hsl(var(--text-primary))] pr-4">{item.question}</span>
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
  const { isDark } = useDarkMode();
  const year = new Date().getFullYear();

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="py-5 px-3 sm:px-4 md:px-8 border-t border-[hsl(var(--divider))] bg-[hsl(var(--surface))]">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
          <div className="col-span-2 md:col-span-1">
            <img 
              src={im3Logo} 
              alt="IM3 Systems" 
              className="h-10 w-auto object-contain mb-4"
              style={isDark ? { filter: "brightness(0) invert(1)" } : undefined}
            />
            <p className="text-sm text-muted-foreground">
              <a href="mailto:info@im3systems.com" className="hover:text-[hsl(var(--teal))] transition-colors">info@im3systems.com</a>
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-[hsl(var(--text-primary))] mb-3">Navegación</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><button onClick={() => scrollToSection('que')} className="hover:text-[hsl(var(--teal))] transition-colors">{t.footer.whatWeDo}</button></li>
              <li><button onClick={() => scrollToSection('como')} className="hover:text-[hsl(var(--teal))] transition-colors">{t.footer.howWeWork}</button></li>
              <li><button onClick={() => scrollToSection('para')} className="hover:text-[hsl(var(--teal))] transition-colors">{t.footer.forWhom}</button></li>
              <li><button onClick={() => scrollToSection('faq')} className="hover:text-[hsl(var(--teal))] transition-colors">{t.footer.faq}</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-[hsl(var(--text-primary))] mb-3">Acciones</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><button onClick={() => window.open("https://calendar.im3systems.com", "_blank")} className="hover:text-[hsl(var(--teal))] transition-colors">{t.footer.diagnosis}</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-[hsl(var(--text-primary))] mb-3">Social</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="https://www.linkedin.com/company/im3-systems" target="_blank" rel="noopener noreferrer" className="hover:text-[hsl(var(--teal))] transition-colors flex items-center gap-2">
                  <Linkedin className="w-4 h-4" /> LinkedIn
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="pt-6 border-t border-[hsl(var(--divider))] flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
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
        <div className="h-px w-16 bg-gradient-to-r from-transparent to-[hsl(var(--divider))]" />
        <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--teal))]/40 mx-3" />
        <div className="h-px w-16 bg-gradient-to-l from-transparent to-[hsl(var(--divider))]" />
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
      <div className="h-px w-full max-w-xs bg-gradient-to-r from-transparent via-[hsl(var(--divider))] to-transparent" />
    </div>
  );
};

// --- Main Page Component ---

export default function Home() {
  return (
    <div className="min-h-screen font-sans bg-background selection:bg-[hsl(var(--teal))] selection:text-white transition-colors duration-300">
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
