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
      headline: "Sistemas con inteligencia artificial para tu negocio",
      subheadline: "Diseñamos e implementamos sistemas a medida con IA: apps internas, automatización de procesos, dashboards operativos e integraciones inteligentes.",
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
      internalApps: "Aplicaciones internas con IA",
      internalAppsDesc: "Software a medida con inteligencia artificial para control operativo, reportes automatizados, checklists inteligentes y flujos internos.",
      automation: "Automatización con IA",
      automationDesc: "Conectamos tus apps y datos con inteligencia artificial para eliminar tareas repetitivas y automatizar decisiones.",
      controlSystems: "Chatbots y dashboards con IA",
      controlSystemsDesc: "Chatbots de WhatsApp con IA, dashboards inteligentes, alertas predictivas y análisis automático de datos.",
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
        { quote: "Nos automatizaron todo el agendamiento de clases, cronogramas y la página web. Lo que antes nos tomaba horas de coordinación manual ahora funciona solo. El equipo puede enfocarse en enseñar, no en administrar.", author: "Sebastián Garzón", role: "Fundador · Passport2Fluency", image: "/assets/headshots/sebastian-garzon.jpg", featured: true },
        { quote: "Nos construyeron la página web y un chatbot de ventas y atención al cliente en WhatsApp. Los resultados fueron asombrosos — cerramos más ventas y nuestros clientes reciben respuesta inmediata, 24/7.", author: "Nicolás Hernández", role: "Fundador y CEO · Xtremcol", image: "/assets/headshots/nicolas-hernandez.jpg", featured: true },
        { quote: "Diseñaron una app de contratación y preselección de personal que nos ahorra horas. Antes revisábamos 200 hojas de vida a mano — ahora el sistema filtra, clasifica y nos muestra solo los perfiles que encajan.", author: "Andrés Villamizar", role: "Gerente de Operaciones · La Glorieta", image: "/assets/headshots/andres-villamizar.jpg" },
        { quote: "El sistema de seguimiento de talento humano nos cambió la gestión. Ahora tenemos visibilidad real del desempeño de cada trabajador, evaluaciones automatizadas y alertas antes de que un problema escale.", author: "Camila Restrepo", role: "Directora RRHH · Grupo Santamaría", image: "/assets/headshots/camila-restrepo.jpg" },
        { quote: "Nos armaron un sistema de procesos y checklists operativos. Cada turno se ejecuta igual, con trazabilidad completa. Las auditorías que antes tomaban días ahora se resuelven con un click.", author: "Diego Morales", role: "Director de Calidad · FreshBox", image: "/assets/headshots/diego-morales.jpg" },
        { quote: "La app de ventas e inventario nos dio control total. Sabemos en tiempo real qué se vende, qué hay en stock y cuándo reponer. Dejamos de perder plata por desabasto y sobrestock.", author: "Valentina Ospina", role: "Administradora · Salomé Momentos", image: "/assets/headshots/valentina-ospina.jpg" },
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
        { question: "¿Usan inteligencia artificial en sus proyectos?", answer: "Sí. Aplicamos inteligencia artificial donde genera valor real: chatbots de ventas y atención en WhatsApp con IA, clasificación automática de datos, predicciones operativas, dashboards inteligentes y asistentes de IA para equipos." },
        { question: "¿Pueden hacer un chatbot de WhatsApp con inteligencia artificial?", answer: "Sí. Construimos chatbots de ventas y atención al cliente en WhatsApp potenciados por IA. Responden consultas, califican leads y cierran ventas 24/7. Ya lo hemos implementado para empresas de e-commerce con resultados inmediatos." },
        { question: "¿Cuánto toma una implementación típica?", answer: "Un MVP funcional con inteligencia artificial integrada suele estar listo en 2 a 4 semanas. Empezamos con lo que más impacta tu operación y vamos iterando con entregas semanales." },
        { question: "¿Qué pasa si mi equipo no es técnico?", answer: "No necesitas equipo técnico. Diseñamos todo para que sea fácil de usar, incluyendo los componentes de IA. Entregamos documentación y capacitación para que tu equipo opere sin depender de nosotros." },
        { question: "¿Pueden automatizar procesos de mi empresa con IA?", answer: "Sí. Automatizamos procesos combinando integraciones con inteligencia artificial. Conectamos CRMs, POS, ERPs y herramientas existentes. La IA decide, prioriza y ejecuta acciones automáticas." },
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
    newsletter: {
      popupTitle: "Lo que los negocios inteligentes están haciendo ahora",
      popupDescription: "IA, automatización y herramientas que puedes aplicar en tu negocio.",
      sectionTitle: "Lo que los negocios inteligentes están haciendo ahora",
      sectionDescription: "IA, automatización y herramientas que puedes aplicar en tu negocio.",
      placeholder: "tu@email.com",
      subscribe: "Quiero recibirlo",
      success: "Listo — revisa tu correo.",
      alreadySubscribed: "Ya estás suscrito.",
      error: "Algo falló. Intenta de nuevo.",
      dismiss: "Paso por ahora",
    },
    blog: {
      sectionTitle: "Desde el blog",
      sectionSubtitle: "Artículos sobre IA, automatización y tecnología para empresas",
      viewAll: "Ver todos los artículos",
      readMore: "Leer más",
      minRead: "min lectura",
    },
    whatsappDemo: {
      title: "Tu negocio vendiendo 24/7 con IA",
      subtitle: "Así funciona un chatbot de WhatsApp con inteligencia artificial.",
      botName: "IM3 Bot",
      messages: [
        { from: "client", text: "Hola, me interesa el plan empresarial" },
        { from: "bot", text: "¡Hola! Con gusto te ayudo. El plan empresarial incluye CRM, automatización y dashboards con IA. ¿Para qué industria sería?" },
        { from: "client", text: "Tenemos un restaurante con 3 sucursales" },
        { from: "bot", text: "Perfecto. Para restaurantes recomendamos: checklists operativos por turno, control de inventario en tiempo real, y alertas de reposición automáticas. ¿Te agendo una demo gratuita?" },
        { from: "client", text: "Sí, por favor" },
        { from: "bot", text: "Listo, te acabo de enviar un link para agendar. También te comparto un caso de éxito de FreshBox, un cliente similar. ¡Hablamos pronto! 🚀" },
      ],
    },
    beforeAfter: {
      title: "De caos operativo a control total",
      subtitle: "Lo que cambia cuando implementamos un sistema a medida.",
      before: "Antes",
      after: "Después",
      items: [
        { before: "Reportes manuales en Excel", after: "Dashboards en tiempo real con IA" },
        { before: "WhatsApp desordenado con clientes", after: "Chatbot inteligente 24/7" },
        { before: "Seguimiento de leads en la cabeza", after: "CRM con scoring automático" },
        { before: "Procesos sin estandarizar", after: "Checklists digitales con trazabilidad" },
      ],
    },
    industries: {
      title: "Industrias que transformamos",
      subtitle: "Soluciones adaptadas a cada operación.",
      items: [
        { name: "Retail", desc: "Control de inventario, ventas y reposición automática", icon: "store" },
        { name: "Logística", desc: "Trazabilidad de envíos, rutas y despachos", icon: "truck" },
        { name: "Educación", desc: "Agendamiento de clases y plataformas educativas", icon: "graduation" },
        { name: "Manufactura", desc: "Checklists de calidad y control de producción", icon: "factory" },
        { name: "Servicios", desc: "CRM, seguimiento de clientes y automatización", icon: "briefcase" },
        { name: "Alimentos", desc: "Procesos operativos, auditorías y cumplimiento", icon: "utensils" },
      ],
    },
    integrations: {
      title: "Nos integramos con todo tu ecosistema",
      subtitle: "Conectamos las herramientas que tu negocio ya usa — más de 60 plataformas y servicios.",
      more: "...y cualquier servicio con API REST, GraphQL, webhooks o SDK disponible.",
    },
    aiShowcase: {
      title: "Inteligencia artificial aplicada a tu operación",
      subtitle: "No es IA genérica — es IA diseñada para resolver problemas reales de tu negocio.",
      email: { title: "Emails personalizados con IA", desc: "Cada email se genera basado en el perfil del cliente" },
      scoring: { title: "Scoring automático de leads", desc: "Calificamos cada lead por potencial de conversión" },
      insights: { title: "Insights de negocio con IA", desc: "Análisis automático de cada contacto" },
    },
    caseStudies: {
      title: "Proyectos que hablan por sí solos",
      subtitle: "Sistemas reales construidos para empresas reales.",
      cases: [
        { empresa: "Passport2Fluency", industria: "Educación", solucion: "Automatización de agendamiento de clases y página web", resultado: "Coordinación manual → 100% automático" },
        { empresa: "Xtremcol", industria: "E-commerce", solucion: "Página web + chatbot de WhatsApp con IA", resultado: "Ventas 24/7, respuesta inmediata" },
        { empresa: "La Glorieta", industria: "Servicios", solucion: "App de contratación y preselección de personal", resultado: "200 CVs manuales → filtrado automático" },
        { empresa: "Grupo Santamaría", industria: "Empresarial", solucion: "Sistema de seguimiento de talento humano", resultado: "Evaluaciones automáticas + alertas" },
        { empresa: "FreshBox", industria: "Alimentos", solucion: "Sistema de procesos y checklists operativos", resultado: "Auditorías de días → 1 click" },
        { empresa: "Salomé Momentos", industria: "Retail", solucion: "App de ventas e inventario en tiempo real", resultado: "Control total de stock y ventas" },
      ],
    },
    techStack: {
      title: "La tecnología detrás de cada sistema",
      subtitle: "Combinamos herramientas de clase mundial para construir soluciones que funcionan.",
      ai: "Inteligencia Artificial",
      aiItems: ["Emails personalizados con IA", "Insights de contactos automáticos", "Generación de contenido", "Chatbots inteligentes"],
      integrations: "Integraciones",
      integrationsItems: ["Google Calendar y Drive", "WhatsApp Business", "CRMs y ERPs", "Pasarelas de pago"],
      automation: "Automatización",
      automationItems: ["Scoring automático de leads", "Secuencias de email adaptativas", "Alertas en tiempo real", "Flujos de trabajo inteligentes"],
    },
    credibilityExtra: {
      mvpLabel: "Semanas para MVP",
      chatbotsLabel: "Chatbots operando 24/7",
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
      headline: "AI-powered systems for your business",
      subheadline: "We design and build custom systems with AI: internal apps, process automation, operational dashboards, and smart integrations.",
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
      internalApps: "Internal apps with AI",
      internalAppsDesc: "Custom software with AI for operational control, automated reports, smart checklists, and internal workflows.",
      automation: "AI-powered automation",
      automationDesc: "We connect your apps and data with artificial intelligence to eliminate repetitive tasks and automate decisions.",
      controlSystems: "AI chatbots & dashboards",
      controlSystemsDesc: "WhatsApp chatbots with AI, intelligent dashboards, predictive alerts, and automated data analysis.",
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
        { quote: "They automated our entire class scheduling, timetables, and website. What used to take hours of manual coordination now runs on its own. The team can focus on teaching, not managing.", author: "Sebastián Garzón", role: "Founder · Passport2Fluency", image: "/assets/headshots/sebastian-garzon.jpg", featured: true },
        { quote: "They built our website and a WhatsApp sales and customer service chatbot. The results were amazing — we close more sales and our clients get instant responses, 24/7.", author: "Nicolás Hernández", role: "Founder & CEO · Xtremcol", image: "/assets/headshots/nicolas-hernandez.jpg", featured: true },
        { quote: "They designed a hiring and pre-screening app that saves us hours. We used to review 200 resumes by hand — now the system filters, ranks, and shows only the profiles that fit.", author: "Andrés Villamizar", role: "Operations Manager · La Glorieta", image: "/assets/headshots/andres-villamizar.jpg" },
        { quote: "The talent management system transformed our HR. We now have real visibility into each worker's performance, automated evaluations, and alerts before a problem escalates.", author: "Camila Restrepo", role: "HR Director · Grupo Santamaría", image: "/assets/headshots/camila-restrepo.jpg" },
        { quote: "They built a process and checklist system for our operations. Every shift runs the same way, with full traceability. Audits that used to take days now resolve with one click.", author: "Diego Morales", role: "Quality Director · FreshBox", image: "/assets/headshots/diego-morales.jpg" },
        { quote: "The sales and inventory app gave us total control. We know in real time what's selling, what's in stock, and when to reorder. We stopped losing money to stockouts and overstock.", author: "Valentina Ospina", role: "Admin · Salomé Momentos", image: "/assets/headshots/valentina-ospina.jpg" },
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
        { question: "Do you use artificial intelligence in your projects?", answer: "Yes. We apply AI where it creates real value: WhatsApp sales and support chatbots with AI, automatic data classification, operational predictions, intelligent dashboards, and AI assistants for teams." },
        { question: "Can you build a WhatsApp chatbot with AI?", answer: "Yes. We build WhatsApp sales and customer service chatbots powered by AI. They answer queries, qualify leads, and close sales 24/7. We've already implemented this for e-commerce companies with immediate results." },
        { question: "How long does a typical implementation take?", answer: "A functional MVP with AI integrated is usually ready in 2 to 4 weeks. We start with what impacts your operation most and iterate with weekly deliveries." },
        { question: "What if my team isn't technical?", answer: "You don't need a technical team. We design everything to be easy to use, including AI components. We deliver documentation and training so your team can operate independently." },
        { question: "Can you automate my business processes with AI?", answer: "Yes. We automate business processes combining integrations with artificial intelligence. We connect CRMs, POS, ERPs, and existing tools. AI decides, prioritizes, and executes automatic actions." },
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
    newsletter: {
      popupTitle: "What smart businesses are doing right now",
      popupDescription: "AI, automation, and tools you can apply to your business.",
      sectionTitle: "What smart businesses are doing right now",
      sectionDescription: "AI, automation, and tools you can apply to your business.",
      placeholder: "you@email.com",
      subscribe: "I'm in",
      success: "Done — check your inbox.",
      alreadySubscribed: "You're already subscribed.",
      error: "Something went wrong. Try again.",
      dismiss: "Skip for now",
    },
    blog: {
      sectionTitle: "From the blog",
      sectionSubtitle: "Articles on AI, automation, and technology for businesses",
      viewAll: "View all articles",
      readMore: "Read more",
      minRead: "min read",
    },
    whatsappDemo: {
      title: "Your business selling 24/7 with AI",
      subtitle: "This is how an AI-powered WhatsApp chatbot works.",
      botName: "IM3 Bot",
      messages: [
        { from: "client", text: "Hi, I'm interested in the enterprise plan" },
        { from: "bot", text: "Hello! Happy to help. The enterprise plan includes CRM, automation, and AI dashboards. What industry would this be for?" },
        { from: "client", text: "We have a restaurant with 3 locations" },
        { from: "bot", text: "Perfect. For restaurants we recommend: shift-based operational checklists, real-time inventory control, and automatic restocking alerts. Want me to schedule a free demo?" },
        { from: "client", text: "Yes, please" },
        { from: "bot", text: "Done! I just sent you a scheduling link. I'm also sharing a success story from FreshBox, a similar client. Talk soon! 🚀" },
      ],
    },
    beforeAfter: {
      title: "From operational chaos to total control",
      subtitle: "What changes when we implement a custom system.",
      before: "Before",
      after: "After",
      items: [
        { before: "Manual reports in Excel", after: "Real-time dashboards with AI" },
        { before: "Messy WhatsApp with clients", after: "Intelligent 24/7 chatbot" },
        { before: "Lead tracking in your head", after: "CRM with automatic scoring" },
        { before: "Unstandardized processes", after: "Digital checklists with traceability" },
      ],
    },
    industries: {
      title: "Industries we transform",
      subtitle: "Solutions adapted to each operation.",
      items: [
        { name: "Retail", desc: "Inventory control, sales, and automatic restocking", icon: "store" },
        { name: "Logistics", desc: "Shipment tracking, routes, and dispatching", icon: "truck" },
        { name: "Education", desc: "Class scheduling and learning platforms", icon: "graduation" },
        { name: "Manufacturing", desc: "Quality checklists and production control", icon: "factory" },
        { name: "Services", desc: "CRM, client tracking, and automation", icon: "briefcase" },
        { name: "Food", desc: "Operational processes, audits, and compliance", icon: "utensils" },
      ],
    },
    integrations: {
      title: "We integrate with your entire ecosystem",
      subtitle: "We connect the tools your business already uses — 60+ platforms and services.",
      more: "...and any service with a REST API, GraphQL, webhooks, or available SDK.",
    },
    aiShowcase: {
      title: "Artificial intelligence applied to your operation",
      subtitle: "Not generic AI — AI designed to solve real problems in your business.",
      email: { title: "AI-personalized emails", desc: "Each email is generated based on the client's profile" },
      scoring: { title: "Automatic lead scoring", desc: "We score each lead by conversion potential" },
      insights: { title: "AI business insights", desc: "Automatic analysis of each contact" },
    },
    caseStudies: {
      title: "Projects that speak for themselves",
      subtitle: "Real systems built for real businesses.",
      cases: [
        { empresa: "Passport2Fluency", industria: "Education", solucion: "Class scheduling automation and website", resultado: "Manual coordination → fully automated" },
        { empresa: "Xtremcol", industria: "E-commerce", solucion: "Website + AI-powered WhatsApp chatbot", resultado: "24/7 sales, instant response" },
        { empresa: "La Glorieta", industria: "Services", solucion: "Hiring and pre-screening app", resultado: "200 manual CVs → automated filtering" },
        { empresa: "Grupo Santamaría", industria: "Enterprise", solucion: "Talent management tracking system", resultado: "Automated evaluations + alerts" },
        { empresa: "FreshBox", industria: "Food", solucion: "Process management and operational checklists", resultado: "Audits from days → 1 click" },
        { empresa: "Salomé Momentos", industria: "Retail", solucion: "Real-time sales and inventory app", resultado: "Full stock and sales control" },
      ],
    },
    techStack: {
      title: "The technology behind every system",
      subtitle: "We combine world-class tools to build solutions that work.",
      ai: "Artificial Intelligence",
      aiItems: ["AI-personalized emails", "Automatic contact insights", "Content generation", "Intelligent chatbots"],
      integrations: "Integrations",
      integrationsItems: ["Google Calendar & Drive", "WhatsApp Business", "CRMs & ERPs", "Payment gateways"],
      automation: "Automation",
      automationItems: ["Automatic lead scoring", "Adaptive email sequences", "Real-time alerts", "Intelligent workflows"],
    },
    credibilityExtra: {
      mvpLabel: "Weeks to MVP",
      chatbotsLabel: "Chatbots running 24/7",
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
