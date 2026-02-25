import { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'es' | 'en';

const translations = {
  es: {
    nav: {
      whatWeDo: "Qué hacemos",
      howWeWork: "Cómo trabajamos",
      forWhom: "Para quién",
      requestDiagnosis: "Solicitar diagnóstico",
      spanish: "Español",
      english: "English",
    },
    hero: {
      badge: "IM3 · SISTEMAS OPERATIVOS",
      headline: "Sistemas confiables para operar sin fricción",
      subheadline: "Construimos aplicaciones internas y automatizaciones conectadas que ordenan la operación diaria de una empresa.",
      cta: "Agendar conversación",
      secondary: "Ver qué hacemos",
      badges: {
        internalApps: "Apps internas",
        automation: "Automatización",
        integrations: "Integraciones",
        dashboards: "Dashboards",
        appliedAI: "IA aplicada",
        maintainableSystems: "Sistemas mantenibles",
      },
    },
    priorities: {
      title: "Lo que priorizamos",
      subtitle: "Orden → claridad → resultados. Convertimos la tecnología en una herramienta práctica para mejorar tus procesos, ahorrar tiempo y hacer crecer tu empresa.",
      clearExecution: "Ejecución clara",
      clearExecutionDesc: "Objetivos definidos desde el inicio para que sepas qué vas a lograr y cómo impacta tu negocio.",
      structure: "Estructura sólida",
      structureDesc: "Organizamos procesos y sistemas para que tu operación sea más eficiente y fácil de escalar.",
      maintainable: "Soluciones mantenibles",
      maintainableDesc: "Te entregamos herramientas claras, documentadas y listas para que tu equipo las use sin complicaciones.",
    },
    logoStrip: {
      title: "Empresas que confían en sistemas IM3",
    },
    services: {
      title: "Sistemas internos que ordenan la operación",
      subtitle: "Construimos soluciones a medida para reducir fricción, centralizar información y ejecutar mejor.",
      internalApps: "Aplicaciones internas",
      internalAppsDesc: "Herramientas a medida para control operativo, reportes, checklists, registros y flujos internos.",
      automation: "Automatización",
      automationDesc: "Conectamos tus apps y datos para eliminar tareas repetitivas y reducir errores en el día a día.",
      controlSystems: "Sistemas de control",
      controlSystemsDesc: "Dashboards, conciliaciones, alertas y auditoría: visibilidad real para decisiones mejores.",
    },
    leadMagnet: {
      badge: "SIN COSTO",
      title: "Diagnóstico operativo inicial",
      description: "Analizamos tu operación, detectamos cuellos de botella y te entregamos un mapa claro de qué sistema implementar, por qué y en qué orden.",
      cta: "Solicitar diagnóstico",
    },
    process: {
      title: "Estructura antes de velocidad",
      subtitle: "Un método simple para construir rápido sin romper la operación (y dejarlo mantenible).",
      steps: [
        { num: "01", title: "Diagnóstico", text: "Entendemos tu operación y dónde se pierde tiempo o dinero." },
        { num: "02", title: "Diseño", text: "Definimos estructura de datos, flujo, roles y métricas." },
        { num: "03", title: "Construcción", text: "Desarrollamos un MVP funcional con foco en uso real." },
        { num: "04", title: "Automatización", text: "Conectamos lo necesario para eliminar tareas repetitivas." },
        { num: "05", title: "Transferencia", text: "Documentación + handoff para que el sistema se mantenga." },
      ],
    },
    targetAudience: {
      title: "PYMEs con operación real",
      subtitle: "Especialmente equipos que necesitan orden y control, no más herramientas sueltas.",
      fitsYouIf: "Encaja contigo si...",
      fitsItems: [
        "Tu operación depende de personas y WhatsApp, pero necesitas estructura.",
        "Hay reportes manuales, cierres, conciliaciones o auditorías que toman horas.",
        "Tienes varias apps, pero no están conectadas (Sheets, POS, CRM, etc.).",
        "Quieres un sistema mantenible, no un proyecto eterno.",
      ],
      notForYou: "No somos para...",
      notForItems: [
        "Empresas que buscan una solución genérica sin entender su operación.",
        "Proyectos sin dueño interno o sin intención de usar el sistema.",
        "Implementaciones genéricas tipo 'copia y pega'.",
        "Soluciones que se rompen por no documentar procesos.",
      ],
    },
    testimonials: {
      title: "Resultados que hablan por sí solos",
      subtitle: "Casos reales de impacto operativo.",
      reviews: [
        { quote: "Logramos reducir el tiempo de cierre de 4 días a 4 horas.", author: "Laura Méndez", role: "Operaciones · Bodega 72" },
        { quote: "Por fin tenemos visibilidad real del inventario en tiempo real.", author: "Carlos Rojas", role: "Admin · CasaMesa" },
        { quote: "La implementación fue ordenada y el equipo adoptó la herramienta rápido.", author: "Paula Andrade", role: "Dirección · Quanta" },
      ],
    },
    offer: {
      title: "Modelos de Trabajo",
      subtitle: "Después del diagnóstico, definimos juntos la mejor forma de avanzar.",
      fullImplementation: "Implementación completa",
      fullImplementationTag: "(Done For You)",
      fullImplementationDesc: "Nos encargamos de todo. Diseñamos, construimos y te entregamos el sistema funcionando, llave en mano. Tu equipo solo se preocupa de usarlo.",
      fullImplementationBenefit: "Ideal si buscas velocidad y garantía de ejecución.",
      strategicGuidance: "Acompañamiento estratégico",
      strategicGuidanceTag: "(Consultoría + Diseño)",
      strategicGuidanceDesc: "Diseñamos la arquitectura y guiamos a tu equipo técnico (o externo) para que ellos construyan con nuestro mapa y supervisión de calidad.",
      strategicGuidanceBenefit: "Ideal si ya tienes capacidad técnica pero te falta dirección.",
      noSalesPressure: "Sin presión de venta",
      noSalesPressureDesc: "El objetivo del diagnóstico es entender tu operación. Si podemos ayudar, te presentaremos estas opciones. Si no, te daremos una recomendación honesta.",
      scheduleConversation: "Agendar conversación",
    },
    contact: {
      title: "¿Dónde se está perdiendo tiempo o control en tu operación?",
      subtitle: "Una conversación corta para entender tu caso y proponer el siguiente paso.",
      scheduleCall: "Agendar una llamada",
      backToTop: "Volver arriba",
    },
    footer: {
      copyright: "IM3 Systems",
    },
  },
  en: {
    nav: {
      whatWeDo: "What we do",
      howWeWork: "How we work",
      forWhom: "Who it's for",
      requestDiagnosis: "Request diagnosis",
      spanish: "Español",
      english: "English",
    },
    hero: {
      badge: "IM3 · OPERATIONAL SYSTEMS",
      headline: "Reliable systems for frictionless operations",
      subheadline: "We build internal apps and connected automations that bring order to your company's daily operations.",
      cta: "Schedule a call",
      secondary: "See what we do",
      badges: {
        internalApps: "Internal apps",
        automation: "Automation",
        integrations: "Integrations",
        dashboards: "Dashboards",
        appliedAI: "Applied AI",
        maintainableSystems: "Maintainable systems",
      },
    },
    priorities: {
      title: "Our priorities",
      subtitle: "Order → clarity → results. We turn technology into a practical tool to improve your processes, save time, and grow your business.",
      clearExecution: "Clear execution",
      clearExecutionDesc: "Goals defined from day one so you know what you'll achieve and how it impacts your business.",
      structure: "Solid structure",
      structureDesc: "We organize processes and systems so your operation is more efficient and easier to scale.",
      maintainable: "Maintainable solutions",
      maintainableDesc: "We deliver clear, documented tools ready for your team to use without complications.",
    },
    logoStrip: {
      title: "Companies that trust IM3 systems",
    },
    services: {
      title: "Internal systems that bring order to operations",
      subtitle: "We build tailored solutions to reduce friction, centralize information, and improve execution.",
      internalApps: "Internal applications",
      internalAppsDesc: "Custom tools for operational control, reports, checklists, records, and internal workflows.",
      automation: "Automation",
      automationDesc: "We connect your apps and data to eliminate repetitive tasks and reduce daily errors.",
      controlSystems: "Control systems",
      controlSystemsDesc: "Dashboards, reconciliations, alerts, and audits: real visibility for better decisions.",
    },
    leadMagnet: {
      badge: "FREE",
      title: "Initial operations assessment",
      description: "We analyze your operations, identify bottlenecks, and deliver a clear roadmap of what system to implement, why, and in what order.",
      cta: "Request assessment",
    },
    process: {
      title: "Structure before speed",
      subtitle: "A simple method to build fast without breaking operations (and keep it maintainable).",
      steps: [
        { num: "01", title: "Assessment", text: "We understand your operations and where time or money is lost." },
        { num: "02", title: "Design", text: "We define data structure, workflows, roles, and metrics." },
        { num: "03", title: "Build", text: "We develop a functional MVP focused on real-world use." },
        { num: "04", title: "Automate", text: "We connect what's needed to eliminate repetitive tasks." },
        { num: "05", title: "Handoff", text: "Documentation + transfer so the system stays maintained." },
      ],
    },
    targetAudience: {
      title: "SMBs with real operations",
      subtitle: "Especially teams that need order and control, not more disconnected tools.",
      fitsYouIf: "It's a fit if...",
      fitsItems: [
        "Your operations rely on people and WhatsApp, but you need structure.",
        "Manual reports, closings, reconciliations, or audits take hours.",
        "You use multiple apps that aren't connected (Sheets, POS, CRM, etc.).",
        "You want a maintainable system, not a never-ending project.",
      ],
      notForYou: "Not for you if...",
      notForItems: [
        "You're looking for a generic solution without understanding your operations.",
        "There's no internal owner or real intention to use the system.",
        "You want a copy-paste implementation.",
        "You expect solutions that don't require documented processes.",
      ],
    },
    testimonials: {
      title: "Results that speak for themselves",
      subtitle: "Real operational impact cases.",
      reviews: [
        { quote: "We reduced our closing time from 4 days to 4 hours.", author: "Laura Méndez", role: "Operations · Bodega 72" },
        { quote: "We finally have real-time inventory visibility.", author: "Carlos Rojas", role: "Admin · CasaMesa" },
        { quote: "The implementation was organized and our team adopted it quickly.", author: "Paula Andrade", role: "Director · Quanta" },
      ],
    },
    offer: {
      title: "Engagement Models",
      subtitle: "After the assessment, we define together the best way forward.",
      fullImplementation: "Full implementation",
      fullImplementationTag: "(Done For You)",
      fullImplementationDesc: "We handle everything. We design, build, and deliver the working system, turnkey. Your team just uses it.",
      fullImplementationBenefit: "Ideal if you want speed and guaranteed execution.",
      strategicGuidance: "Strategic guidance",
      strategicGuidanceTag: "(Consulting + Design)",
      strategicGuidanceDesc: "We design the architecture and guide your technical team (or external) to build with our roadmap and quality oversight.",
      strategicGuidanceBenefit: "Ideal if you have technical capacity but need direction.",
      noSalesPressure: "No sales pressure",
      noSalesPressureDesc: "The goal of the assessment is to understand your operations. If we can help, we'll present these options. If not, we'll give you an honest recommendation.",
      scheduleConversation: "Schedule a conversation",
    },
    contact: {
      title: "Where is your operation losing time or control?",
      subtitle: "A short conversation to understand your case and propose the next step.",
      scheduleCall: "Schedule a call",
      backToTop: "Back to top",
    },
    footer: {
      copyright: "IM3 Systems",
    },
  },
};

type Translations = typeof translations.es;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('es');

  const value: I18nContextType = {
    language,
    setLanguage,
    t: translations[language],
  };

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
