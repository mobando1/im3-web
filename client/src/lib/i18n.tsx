import { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'es' | 'en';

const translations = {
  es: {
    nav: {
      whatWeDo: "Qué hacemos",
      howWeWork: "Cómo trabajamos",
      forWhom: "Para quién",
      requestDiagnosis: "Solicitar diagnóstico gratis",
      spanish: "Español",
      english: "English",
    },
    hero: {
      badge: "IM3 · SISTEMAS OPERATIVOS",
      headline: "Sistemas confiables para operar sin fricción",
      subheadline: "Reduce horas de trabajo manual, errores y caos operativo con sistemas hechos a tu medida.",
      cta: "Solicitar diagnóstico gratis",
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
      subtitle: "Convertimos la tecnología en una herramienta práctica para mejorar tus procesos, ahorrar tiempo y hacer crecer tu empresa.",
      flow: ["Orden", "Claridad", "Resultados"],
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
    credibility: {
      systems: "12+",
      systemsLabel: "Sistemas implementados",
      industries: "6",
      industriesLabel: "Industrias",
      conversion: "100%",
      conversionLabel: "De diagnósticos continúan a implementación",
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
      cta: "Solicitar diagnóstico gratis",
    },
    process: {
      title: "Cómo trabajamos contigo",
      steps: [
        { num: "01", title: "Diagnóstico estratégico", text: "Analizamos tu operación, entendemos tu negocio, detectamos oportunidades y puntos críticos, definimos el sistema, procesos y herramientas que realmente necesitas." },
        { num: "02", title: "Desarrollo de la solución", text: "Diseñamos y construimos el sistema a medida — interfaces, automatizaciones, integraciones y flujos adaptados a cómo funciona tu equipo en el día a día." },
        { num: "03", title: "Implementación", text: "Lo integramos directamente en tu operación real, migramos datos, conectamos herramientas existentes y validamos que todo funcione antes de salir en vivo." },
        { num: "04", title: "Entrega y acompañamiento", text: "Te dejamos todo documentado, entrenamos a tu equipo, y te acompañamos las primeras semanas para asegurar una adopción sin fricciones." },
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
        { quote: "Pasamos de perder 8% del inventario por errores manuales a menos del 0.5%. Por fin tenemos visibilidad real.", author: "Carlos Rojas", role: "Admin · CasaMesa" },
        { quote: "En 2 semanas el equipo ya operaba sin soporte. Antes tardábamos meses en adoptar herramientas nuevas.", author: "Paula Andrade", role: "Dirección · Quanta" },
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
      scheduleConversation: "Solicitar diagnóstico gratis",
    },
    faq: {
      title: "Preguntas frecuentes",
      subtitle: "Lo que necesitas saber antes de dar el primer paso.",
      items: [
        { question: "¿Cuánto toma una implementación típica?", answer: "Depende del alcance, pero un MVP funcional suele estar listo en 4 a 8 semanas. Empezamos con lo que más impacta tu operación y vamos iterando." },
        { question: "¿Qué pasa si mi equipo no es técnico?", answer: "No necesitas equipo técnico. Diseñamos todo para que sea fácil de usar. Además, entregamos documentación y capacitación para que tu equipo opere sin depender de nosotros." },
        { question: "¿Qué tecnologías usan?", answer: "Usamos las herramientas que mejor se adapten a tu caso: desde apps web modernas hasta integraciones con las plataformas que ya usas (Google Sheets, CRMs, POS, etc.)." },
        { question: "¿Cuál es el rango de inversión?", answer: "Cada proyecto es diferente. El diagnóstico inicial es gratuito y al final te entregamos una propuesta clara con alcance, tiempos y costos definidos. Sin sorpresas." },
        { question: "¿El diagnóstico tiene algún costo o compromiso?", answer: "No. El diagnóstico es 100% gratuito y sin compromiso. Si después de entender tu operación podemos ayudar, te presentamos opciones. Si no, te damos una recomendación honesta." },
      ],
    },
    contact: {
      title: "¿Dónde se está perdiendo tiempo o control en tu operación?",
      subtitle: "Una conversación corta para entender tu caso y proponer el siguiente paso.",
      scheduleCall: "Solicitar diagnóstico gratis",
      backToTop: "Volver arriba",
    },
    footer: {
      copyright: "IM3 Systems",
      whatWeDo: "Qué hacemos",
      howWeWork: "Cómo trabajamos",
      forWhom: "Para quién",
      diagnosis: "Diagnóstico gratis",
      faq: "Preguntas frecuentes",
      privacyPolicy: "Política de privacidad",
    },
  },
  en: {
    nav: {
      whatWeDo: "What we do",
      howWeWork: "How we work",
      forWhom: "Who it's for",
      requestDiagnosis: "Request free diagnosis",
      spanish: "Español",
      english: "English",
    },
    hero: {
      badge: "IM3 · OPERATIONAL SYSTEMS",
      headline: "Reliable systems for frictionless operations",
      subheadline: "Cut manual hours, errors, and operational chaos with custom-built systems tailored to your business.",
      cta: "Request free diagnosis",
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
      subtitle: "We turn technology into a practical tool to improve your processes, save time, and grow your business.",
      flow: ["Order", "Clarity", "Results"],
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
    credibility: {
      systems: "12+",
      systemsLabel: "Systems implemented",
      industries: "6",
      industriesLabel: "Industries",
      conversion: "100%",
      conversionLabel: "Of assessments lead to implementation",
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
      cta: "Request free assessment",
    },
    process: {
      title: "How we work with you",
      steps: [
        { num: "01", title: "Strategic diagnosis", text: "We analyze your operation, understand your business, detect opportunities and critical points, and define the system, processes, and tools you truly need." },
        { num: "02", title: "Solution development", text: "We design and build the system to fit — interfaces, automations, integrations, and workflows adapted to how your team operates day to day." },
        { num: "03", title: "Implementation", text: "We integrate it directly into your real operation, migrate data, connect existing tools, and validate everything works before going live." },
        { num: "04", title: "Delivery & support", text: "We leave everything documented, train your team, and walk alongside you for the first weeks to ensure frictionless adoption." },
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
        { quote: "We went from losing 8% of inventory due to manual errors to under 0.5%. We finally have real visibility.", author: "Carlos Rojas", role: "Admin · CasaMesa" },
        { quote: "In 2 weeks our team was operating without support. Before, it took us months to adopt new tools.", author: "Paula Andrade", role: "Director · Quanta" },
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
      scheduleConversation: "Request free diagnosis",
    },
    faq: {
      title: "Frequently asked questions",
      subtitle: "What you need to know before taking the first step.",
      items: [
        { question: "How long does a typical implementation take?", answer: "It depends on scope, but a functional MVP is usually ready in 4 to 8 weeks. We start with what impacts your operation most and iterate from there." },
        { question: "What if my team isn't technical?", answer: "You don't need a technical team. We design everything to be easy to use. Plus, we deliver documentation and training so your team can operate without depending on us." },
        { question: "What technologies do you use?", answer: "We use whatever tools best fit your case: from modern web apps to integrations with platforms you already use (Google Sheets, CRMs, POS, etc.)." },
        { question: "What's the investment range?", answer: "Every project is different. The initial assessment is free, and at the end we deliver a clear proposal with defined scope, timeline, and costs. No surprises." },
        { question: "Does the assessment cost anything or have any commitment?", answer: "No. The assessment is 100% free with no commitment. If after understanding your operation we can help, we present options. If not, we give you an honest recommendation." },
      ],
    },
    contact: {
      title: "Where is your operation losing time or control?",
      subtitle: "A short conversation to understand your case and propose the next step.",
      scheduleCall: "Request free diagnosis",
      backToTop: "Back to top",
    },
    footer: {
      copyright: "IM3 Systems",
      whatWeDo: "What we do",
      howWeWork: "How we work",
      forWhom: "Who it's for",
      diagnosis: "Free diagnosis",
      faq: "FAQ",
      privacyPolicy: "Privacy policy",
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
