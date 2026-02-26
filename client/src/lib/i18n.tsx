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
      title: "¿Qué construimos?",
      subtitle: "Tres tipos de soluciones que se combinan según lo que tu operación necesita.",
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
      cycleLabel: "Ciclo continuo de mejora",
    },
    targetAudience: {
      title: "¿Con quién trabajamos mejor?",
      subtitle: "Empresas que exigen precisión, orden y tecnología diseñada con intención.",
      fitsYouIf: "Somos una buena elección cuando tu empresa…",
      fitsItems: [
        "Gestiona una operación compleja y requiere orden, trazabilidad y control real sobre sus procesos.",
        "Dedica horas a cierres, conciliaciones, reportes o auditorías que podrían estar automatizados.",
        "Utiliza múltiples herramientas desconectadas (ERP, POS, CRM, hojas de cálculo) y necesita que funcionen como un solo sistema.",
        "Busca un sistema estable, escalable y mantenible, diseñado para evolucionar con la operación.",
      ],
      notForYou: "No somos la mejor opción si tu empresa…",
      notForItems: [
        "Busca una solución genérica o rápida, sin dedicar tiempo a entender su operación.",
        "No cuenta con un responsable interno del proyecto, o no existe compromiso real con la adopción del sistema.",
        "No documenta, estandariza o define procesos, ni está dispuesta a construir una base operativa sólida.",
      ],
    },
    testimonials: {
      title: "Resultados que hablan por sí solos",
      subtitle: "Casos reales de impacto operativo.",
      featuredLabel: "Cliente destacado",
      reviews: [
        { quote: "Nos automatizaron todo el agendamiento de clases, cronogramas y la página web. Lo que antes nos tomaba horas de coordinación manual ahora funciona solo. El equipo puede enfocarse en enseñar, no en administrar.", author: "Sebastián Garzón", role: "Fundador · Passport2Fluency", featured: true },
        { quote: "Nos construyeron la página web y un chatbot de ventas y atención al cliente en WhatsApp. Los resultados fueron asombrosos — cerramos más ventas y nuestros clientes reciben respuesta inmediata, 24/7.", author: "Nicolás Hernández", role: "Director · AMJ Solutions", featured: true },
        { quote: "Diseñaron una app de contratación y preselección de personal que nos ahorra horas. Antes revisábamos 200 hojas de vida a mano — ahora el sistema filtra, clasifica y nos muestra solo los perfiles que encajan.", author: "Andrés Villamizar", role: "Gerente de Operaciones · La Glorieta" },
        { quote: "El sistema de seguimiento de talento humano nos cambió la gestión. Ahora tenemos visibilidad real del desempeño de cada trabajador, evaluaciones automatizadas y alertas antes de que un problema escale.", author: "Camila Restrepo", role: "Directora RRHH · Grupo Santamaría" },
        { quote: "Nos armaron un sistema de procesos y checklists operativos. Cada turno se ejecuta igual, con trazabilidad completa. Las auditorías que antes tomaban días ahora se resuelven con un click.", author: "Diego Morales", role: "Director de Calidad · FreshBox" },
        { quote: "La app de ventas e inventario nos dio control total. Sabemos en tiempo real qué se vende, qué hay en stock y cuándo reponer. Dejamos de perder plata por desabasto y sobrestock.", author: "Valentina Ospina", role: "Administradora · Salomé Momentos" },
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
      title: "What do we build?",
      subtitle: "Three types of solutions that combine based on what your operation needs.",
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
      cycleLabel: "Continuous improvement cycle",
    },
    targetAudience: {
      title: "Who do we work best with?",
      subtitle: "Companies that demand precision, order, and technology designed with intention.",
      fitsYouIf: "We're a great fit when your company…",
      fitsItems: [
        "Manages complex operations and needs order, traceability, and real control over its processes.",
        "Spends hours on closings, reconciliations, reports, or audits that could be automated.",
        "Uses multiple disconnected tools (ERP, POS, CRM, spreadsheets) and needs them to work as one system.",
        "Wants a stable, scalable, and maintainable system designed to evolve with the operation.",
      ],
      notForYou: "We're not the best fit if your company…",
      notForItems: [
        "Wants a generic or quick solution without investing time to understand its own operation.",
        "Doesn't have an internal project owner, or there's no real commitment to adopting the system.",
        "Doesn't document, standardize, or define processes, and isn't willing to build a solid operational foundation.",
      ],
    },
    testimonials: {
      title: "Results that speak for themselves",
      subtitle: "Real operational impact cases.",
      featuredLabel: "Featured client",
      reviews: [
        { quote: "They automated our entire class scheduling, timetables, and website. What used to take hours of manual coordination now runs on its own. The team can focus on teaching, not managing.", author: "Sebastián Garzón", role: "Founder · Passport2Fluency", featured: true },
        { quote: "They built our website and a WhatsApp sales and customer service chatbot. The results were amazing — we close more sales and our clients get instant responses, 24/7.", author: "Nicolás Hernández", role: "Director · AMJ Solutions", featured: true },
        { quote: "They designed a hiring and pre-screening app that saves us hours. We used to review 200 resumes by hand — now the system filters, ranks, and shows only the profiles that fit.", author: "Andrés Villamizar", role: "Operations Manager · La Glorieta" },
        { quote: "The talent management system transformed our HR. We now have real visibility into each worker's performance, automated evaluations, and alerts before a problem escalates.", author: "Camila Restrepo", role: "HR Director · Grupo Santamaría" },
        { quote: "They built a process and checklist system for our operations. Every shift runs the same way, with full traceability. Audits that used to take days now resolve with one click.", author: "Diego Morales", role: "Quality Director · FreshBox" },
        { quote: "The sales and inventory app gave us total control. We know in real time what's selling, what's in stock, and when to reorder. We stopped losing money to stockouts and overstock.", author: "Valentina Ospina", role: "Admin · Salomé Momentos" },
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
