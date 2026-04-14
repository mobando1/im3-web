import { INDUSTRIA_LABELS, type IndustriaValue } from "@shared/industrias";

export type IndustryCase = {
  titulo: string;
  problema: string;
  solucion: string;
  impacto: string;
  herramientas: string[];
  nivelComplejidad: "bajo" | "medio" | "alto";
};

const ECOMMERCE: IndustryCase[] = [
  {
    titulo: "Recuperación inteligente de carritos abandonados",
    problema: "~70% de los carritos se abandonan y la secuencia de recuperación típica es un email genérico 24h después.",
    solucion: "Agente que genera emails y mensajes de WhatsApp personalizados con la foto del producto, un incentivo dinámico y tono adaptado al historial del cliente.",
    impacto: "Tasas de recuperación de 10-18% vs. 3-5% de campañas genéricas (Baymard Institute, 2024).",
    herramientas: ["Shopify / WooCommerce / VTEX", "Resend / WhatsApp Business API", "Claude API"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Chatbot de post-venta conectado al ERP",
    problema: "30-40% de los tickets de soporte son '¿dónde está mi pedido?' o dudas de devolución — drenan el tiempo del equipo.",
    solucion: "Bot en WhatsApp/web conectado a Shopify/ERP que responde tracking, políticas de devolución y FAQ con contexto real del pedido.",
    impacto: "Reduce tickets humanos en 45-60% y atiende 24/7 (Gartner, 2024).",
    herramientas: ["WhatsApp Business API", "Shopify / ERP API", "Claude / GPT"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Análisis automático de reseñas y NPS",
    problema: "Las reseñas están dispersas entre marketplaces, redes y post-venta — nadie las lee completas y se pierden insights de producto.",
    solucion: "Pipeline semanal que agrupa reseñas de todos los canales, las clasifica por tema y genera un reporte accionable.",
    impacto: "Detecta problemas de producto 3x más rápido y prioriza mejoras con data, no intuición.",
    herramientas: ["Google Sheets / Airtable", "APIs de marketplaces", "Claude API"],
    nivelComplejidad: "bajo",
  },
];

const SERVICIOS_PROFESIONALES: IndustryCase[] = [
  {
    titulo: "Asistente que prepara primeras reuniones con clientes",
    problema: "Cada consulta nueva consume 30-60 min de investigación previa (empresa, industria, contexto legal/contable).",
    solucion: "Agente que toma el nombre del cliente + contexto breve y devuelve un brief con historial público, riesgos típicos del sector y 3 preguntas clave.",
    impacto: "Reduce tiempo de preparación 70-80% y aumenta percepción de expertise del consultor.",
    herramientas: ["Claude API", "Web search API", "CRM (HubSpot/Pipedrive)"],
    nivelComplejidad: "bajo",
  },
  {
    titulo: "Redacción asistida de documentos y propuestas",
    problema: "La redacción de contratos, dictámenes o propuestas se vuelve cuello de botella y cada versión toma 2-4 horas.",
    solucion: "Plantillas inteligentes que toman datos del caso + criterios de riesgo y generan borrador con estructura, cláusulas y lenguaje consistente.",
    impacto: "Reduce tiempo por documento de horas a minutos y mantiene consistencia entre socios/juniors.",
    herramientas: ["Notion / Google Docs", "Claude API", "Plantillas propias"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Tracking automático de horas facturables",
    problema: "Los profesionales subfacturan 15-25% de su tiempo real porque registrar horas se olvida o se estima mal.",
    solucion: "Integración con calendar + email + documentos que sugiere entradas de time-tracking por cliente al final del día.",
    impacto: "Recuperación de 15-20% de horas facturables previamente perdidas.",
    herramientas: ["Google Calendar", "Gmail/Outlook", "Claude API"],
    nivelComplejidad: "medio",
  },
];

const SALUD_MEDICINA: IndustryCase[] = [
  {
    titulo: "Recordatorios y confirmación de citas por WhatsApp",
    problema: "Tasas de ausentismo (no-show) de 15-25% generan pérdidas directas y huecos en la agenda médica.",
    solucion: "Sistema que envía recordatorios inteligentes 48h y 3h antes, permite reagendar por WhatsApp y rellena huecos desde lista de espera.",
    impacto: "Reducción de no-show a 5-8% y aprovechamiento del 90%+ de la agenda.",
    herramientas: ["WhatsApp Business API", "Agenda/Calendar API", "Zapier/Make"],
    nivelComplejidad: "bajo",
  },
  {
    titulo: "Resumen clínico post-consulta automatizado",
    problema: "El médico pasa 20-30 min después de cada cita escribiendo notas, resúmenes y órdenes — o se deja para fin del día y se pierden detalles.",
    solucion: "Transcripción de consulta (con consentimiento) + IA que genera nota SOAP, plan de tratamiento y carta al paciente en segundos.",
    impacto: "Recuperación de 2-3 horas diarias por profesional y notas más completas.",
    herramientas: ["Whisper (transcripción)", "Claude API", "HIS / Software clínico"],
    nivelComplejidad: "alto",
  },
  {
    titulo: "Pre-triaje de pacientes por canal digital",
    problema: "Las recepcionistas pasan horas respondiendo preguntas repetitivas sobre servicios, precios, coberturas y horarios.",
    solucion: "Chatbot pre-triaje que responde FAQ, orienta al paciente al especialista correcto y agenda automáticamente.",
    impacto: "70% de consultas resueltas sin intervención humana, mejor experiencia y mayor conversión a cita.",
    herramientas: ["WhatsApp / Webchat", "Calendar API", "Claude API"],
    nivelComplejidad: "medio",
  },
];

const MANUFACTURA: IndustryCase[] = [
  {
    titulo: "Predicción de mantenimiento preventivo",
    problema: "Fallas no anticipadas en maquinaria generan paros de producción que cuestan miles por hora.",
    solucion: "Modelo que analiza datos de sensores/órdenes de mantenimiento y predice qué equipo fallará en los próximos 7-14 días.",
    impacto: "Reducción de paros no planificados 30-50% (McKinsey, 2023).",
    herramientas: ["Sensores IoT", "Base de datos de mantenimiento", "Python/Claude API"],
    nivelComplejidad: "alto",
  },
  {
    titulo: "Control de calidad visual automatizado",
    problema: "Inspección manual de piezas es lenta, cara y sujeta a fatiga humana — defectos se escapan.",
    solucion: "Cámara + visión por computadora que inspecciona cada pieza en segundos y marca las no-conformes antes del empaque.",
    impacto: "Detección de defectos >99% vs. 92-95% manual, y throughput 3-5x mayor.",
    herramientas: ["Cámara industrial", "Modelo de visión", "Integración con línea de producción"],
    nivelComplejidad: "alto",
  },
  {
    titulo: "Cotizaciones B2B automatizadas desde especificaciones",
    problema: "Generar una cotización toma 1-3 días porque requiere leer specs, calcular costos y redactar — pierdes clientes por lentitud.",
    solucion: "Agente que recibe la especificación del cliente (PDF/Excel), calcula BOM + costos + tiempo, y devuelve cotización en minutos para revisión humana.",
    impacto: "Tiempo de respuesta de días a minutos, mayor tasa de conversión de RFQ.",
    herramientas: ["ERP", "Claude API", "Excel / calculadoras internas"],
    nivelComplejidad: "medio",
  },
];

const CONSULTORIA_AGENCIA: IndustryCase[] = [
  {
    titulo: "Briefing automatizado de reuniones de prospección",
    problema: "Preparar una reunión con un lead consume 30-60 min de investigación y muchas veces no se hace bien.",
    solucion: "Agente que toma empresa + LinkedIn del prospecto y devuelve contexto, dolor probable, 3 casos relevantes y preguntas clave.",
    impacto: "Tasa de conversión post-primera-reunión sube 20-35% por mejor preparación.",
    herramientas: ["LinkedIn", "Web search API", "Claude API"],
    nivelComplejidad: "bajo",
  },
  {
    titulo: "Generación de propuestas comerciales personalizadas",
    problema: "Cada propuesta toma 4-8 horas de armado — bottleneck entre ventas y delivery.",
    solucion: "Sistema que genera propuesta con estructura, pricing, timeline y casos similares automáticamente desde los datos del diagnóstico.",
    impacto: "De 4-8h a 30-60 min por propuesta, con consistencia de marca.",
    herramientas: ["Notion / Docs", "Claude API", "Banco interno de casos"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Reportes automáticos de resultados para clientes",
    problema: "Los reportes mensuales al cliente consumen 3-5 horas por cuenta y son el primer recortado cuando hay overload.",
    solucion: "Pipeline que extrae data de plataformas (GA, Ads, CRM), genera gráficos y escribe el análisis narrativo automáticamente.",
    impacto: "Reducción de 80%+ del tiempo de reportería y reportes más frecuentes.",
    herramientas: ["Google Analytics / Ads API", "Notion / PDF", "Claude API"],
    nivelComplejidad: "medio",
  },
];

const FALLBACK_CROSS_INDUSTRY: IndustryCase[] = [
  {
    titulo: "Automatización del flujo de leads entrantes",
    problema: "Los leads llegan por múltiples canales (web, WhatsApp, email, referidos) y se pierden entre el equipo — responder tarde mata la conversión.",
    solucion: "Hub central que recibe todos los leads, los enriquece automáticamente, los asigna y dispara la primera respuesta personalizada en <5 min.",
    impacto: "Tiempo de respuesta 10x más rápido y conversión +20-40% (Harvard Business Review).",
    herramientas: ["CRM", "Zapier/Make", "Claude API"],
    nivelComplejidad: "bajo",
  },
  {
    titulo: "Copiloto interno con conocimiento de tu empresa",
    problema: "El equipo pierde tiempo buscando información en Drive/Notion/emails y responde distinto según quién atiende.",
    solucion: "Asistente conectado a tus documentos internos que responde dudas del equipo con contexto y tono de tu empresa.",
    impacto: "Onboarding 2-3x más rápido y consistencia de respuestas entre áreas.",
    herramientas: ["Google Drive / Notion", "Claude API (RAG)", "Slack / WhatsApp"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Dashboard ejecutivo con insights automáticos",
    problema: "Los reportes de operación/ventas/finanzas viven en Excel y nadie los lee — las decisiones se toman por intuición.",
    solucion: "Tablero que consolida las métricas clave, detecta anomalías automáticamente y envía un resumen ejecutivo semanal.",
    impacto: "Decisiones basadas en data y detección temprana de problemas antes de que escalen.",
    herramientas: ["Google Sheets / Metabase", "Integraciones ERP/CRM", "Claude API"],
    nivelComplejidad: "medio",
  },
];

const RETAIL_FISICO: IndustryCase[] = [
  {
    titulo: "Pronóstico de demanda por tienda y SKU",
    problema: "Cada tienda pide productos basado en intuición — o sobran productos que no rotan o faltan los que sí.",
    solucion: "Modelo que cruza ventas históricas, estacionalidad y eventos locales para sugerir pedidos óptimos por tienda.",
    impacto: "Reducción de stock muerto 20-30% y menos quiebres de inventario (McKinsey Retail, 2024).",
    herramientas: ["ERP / POS", "Google Sheets / BigQuery", "Claude / Python"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Programa de fidelización con IA personalizada",
    problema: "Las promociones son para todos los clientes igual — baja conversión y margen erosionado innecesariamente.",
    solucion: "Segmentación automática de clientes y ofertas personalizadas por WhatsApp según su historial de compra.",
    impacto: "Conversión de campañas 3-5x vs. blast masivo (Harvard Business Review).",
    herramientas: ["POS / CRM", "WhatsApp Business API", "Claude API"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Control de inventario con cámaras y visión",
    problema: "El conteo manual toma horas y genera errores — el stock real no coincide con el sistema.",
    solucion: "Cámaras en góndolas + visión por computadora que detectan faltantes y alertan al equipo en tiempo real.",
    impacto: "Quiebres en góndola -40% y menos reposiciones tardías.",
    herramientas: ["Cámaras IP", "Modelo de visión", "Integración POS"],
    nivelComplejidad: "alto",
  },
];

const EDUCACION: IndustryCase[] = [
  {
    titulo: "Tutor IA que acompaña al estudiante 24/7",
    problema: "Los estudiantes se atascan fuera de clase y no tienen a quién preguntar — abandono y frustración.",
    solucion: "Asistente conectado al contenido del curso que responde dudas con ejemplos y corrige ejercicios.",
    impacto: "Retención de cursos online +15-25% y satisfacción del estudiante notablemente mayor.",
    herramientas: ["LMS (Moodle, Canvas)", "Claude API (RAG)", "Webchat / WhatsApp"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Automatización de admisiones y seguimiento a prospectos",
    problema: "Los prospectos llegan por formularios y se responden en días — la mayoría se pierden por falta de seguimiento.",
    solucion: "Bot que responde en minutos, orienta al programa correcto y agenda entrevista con el equipo comercial.",
    impacto: "Tiempo de respuesta 50x más rápido y conversión prospecto → matriculado +20%.",
    herramientas: ["CRM educativo", "WhatsApp / Webchat", "Claude API"],
    nivelComplejidad: "bajo",
  },
  {
    titulo: "Generación y corrección asistida de evaluaciones",
    problema: "Diseñar quizzes, corregir ensayos y dar feedback personalizado consume horas por grupo.",
    solucion: "Plataforma que genera evaluaciones alineadas al contenido, corrige automáticamente y entrega feedback individual.",
    impacto: "Reducción de tiempo docente 60-70% en evaluación y feedback más frecuente.",
    herramientas: ["LMS", "Claude API", "Google Forms / Typeform"],
    nivelComplejidad: "medio",
  },
];

const LOGISTICA_TRANSPORTE: IndustryCase[] = [
  {
    titulo: "Optimización de rutas en tiempo real",
    problema: "Las rutas se planean manualmente y no consideran tráfico, ventanas de entrega ni prioridades cambiantes.",
    solucion: "Motor que recalcula rutas óptimas considerando tráfico, ventanas horarias y capacidad de los vehículos.",
    impacto: "Reducción de km recorridos 15-25% y más entregas por vehículo/día (Deloitte Logistics, 2024).",
    herramientas: ["APIs de mapas (Google/HERE)", "TMS / ERP", "Python / Claude API"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Tracking proactivo y comunicación al cliente",
    problema: "Los clientes llaman preguntando '¿dónde está mi envío?' — drena al equipo y genera mala experiencia.",
    solucion: "Notificaciones automáticas por WhatsApp en cada hito del envío + link público de tracking en vivo.",
    impacto: "Llamadas de tracking -70% y NPS mejora visiblemente.",
    herramientas: ["TMS", "WhatsApp Business API", "Webhook handlers"],
    nivelComplejidad: "bajo",
  },
  {
    titulo: "Cotización automática de envíos B2B",
    problema: "Cotizar un envío de carga toma horas de ida y vuelta entre vendedor y operaciones.",
    solucion: "Calculadora que toma origen, destino, peso y tipo de carga y devuelve cotización en segundos.",
    impacto: "Cierre de cotizaciones 5-10x más rápido y menos leads perdidos por lentitud.",
    herramientas: ["ERP / TMS", "Claude API", "Web form / WhatsApp"],
    nivelComplejidad: "medio",
  },
];

const CONSTRUCCION_INMOBILIARIA: IndustryCase[] = [
  {
    titulo: "Lead nurturing inmobiliario con IA",
    problema: "Los leads llegan curiosos pero no listos — y el equipo de ventas no tiene tiempo de nutrir a los fríos.",
    solucion: "Secuencia automatizada por WhatsApp/email que envía información relevante según interés y agenda visita cuando está caliente.",
    impacto: "Conversión de leads fríos a visitas +30-50% sin aumentar headcount.",
    herramientas: ["CRM inmobiliario", "WhatsApp Business API", "Claude API"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Generación de descripciones y materiales por unidad",
    problema: "Redactar fichas de cada unidad (depto, lote, proyecto) para web, portales y brochures consume horas.",
    solucion: "Agente que toma los datos técnicos del inmueble y genera descripciones, bullet points y texto SEO para cada portal.",
    impacto: "Tiempo de publicación por unidad de horas a minutos.",
    herramientas: ["CRM", "Claude API", "Portales (Inmuebles24, etc.)"],
    nivelComplejidad: "bajo",
  },
  {
    titulo: "Seguimiento automatizado de obra con reportes al cliente",
    problema: "Los clientes piden updates semanales de la obra y el equipo tiene que armar reportes manualmente.",
    solucion: "App donde el equipo sube fotos/notas en campo y la IA arma un reporte profesional que se envía al cliente.",
    impacto: "Transparencia percibida del cliente sube notablemente y menos reuniones de status.",
    herramientas: ["App móvil", "Claude API", "Portal del cliente"],
    nivelComplejidad: "medio",
  },
];

const FINTECH_SERVICIOS_FINANCIEROS: IndustryCase[] = [
  {
    titulo: "Onboarding KYC automatizado con validación IA",
    problema: "El proceso KYC manual tarda días — los clientes abandonan antes de completar el onboarding.",
    solucion: "Flujo digital con OCR de documentos, verificación biométrica y validación automática de listas.",
    impacto: "Tiempo de onboarding de días a minutos, conversión +30-50% (McKinsey Banking, 2024).",
    herramientas: ["OCR / Visión computacional", "APIs de validación de identidad", "Claude API"],
    nivelComplejidad: "alto",
  },
  {
    titulo: "Scoring crediticio alternativo con data no tradicional",
    problema: "Los modelos de scoring tradicionales excluyen a miles de clientes sin historial bancario.",
    solucion: "Modelo que usa data alternativa (comportamiento digital, pagos de servicios) para evaluar riesgo real.",
    impacto: "Ampliación de base de clientes calificables 2-3x manteniendo tasa de default.",
    herramientas: ["Datos alternativos", "Python / ML", "API de decisión"],
    nivelComplejidad: "alto",
  },
  {
    titulo: "Atención al cliente con copilot de agente",
    problema: "Los agentes pasan minutos buscando info en múltiples sistemas para responder una sola consulta.",
    solucion: "Copilot que resume el contexto del cliente y sugiere la respuesta correcta en tiempo real al agente.",
    impacto: "Tiempo promedio de atención -30-40% y satisfacción del cliente sube.",
    herramientas: ["Core bancario", "Claude API (RAG)", "Call center software"],
    nivelComplejidad: "medio",
  },
];

const AGROINDUSTRIA: IndustryCase[] = [
  {
    titulo: "Análisis satelital de cultivos y alertas tempranas",
    problema: "Los problemas de cultivo (plagas, sequía, estrés hídrico) se detectan cuando ya es tarde y la pérdida es grande.",
    solucion: "Monitoreo satelital semanal con IA que detecta anomalías y alerta al agrónomo antes de que sea visible a campo.",
    impacto: "Pérdidas por detección tardía -25-40% y mejor uso de insumos.",
    herramientas: ["Imágenes satelitales (Sentinel)", "Modelo de visión", "Alertas WhatsApp"],
    nivelComplejidad: "alto",
  },
  {
    titulo: "Trazabilidad y documentación automatizada para exportación",
    problema: "La documentación para exportar (fitosanitario, trazabilidad, orgánico) toma días de trabajo administrativo.",
    solucion: "Sistema que recolecta data del campo y genera automáticamente los reportes y certificados requeridos.",
    impacto: "Tiempo administrativo -70% y menos rechazos por documentación incompleta.",
    herramientas: ["App móvil campo", "Claude API", "Sistemas de certificación"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Pricing dinámico y forecasting de cosecha",
    problema: "Decidir cuándo vender cosecha es intuición — los precios fluctúan y hay millones en diferencia.",
    solucion: "Modelo que cruza historial de precios, clima, demanda global y tu volumen para sugerir mejor momento de venta.",
    impacto: "Precio promedio de venta +5-12% sin cambiar producción.",
    herramientas: ["Fuentes de precios (bolsa)", "Claude API", "Google Sheets"],
    nivelComplejidad: "medio",
  },
];

const ALIMENTOS_BEBIDAS: IndustryCase[] = [
  {
    titulo: "Automatización de pedidos B2B a distribuidores",
    problema: "Los distribuidores piden por WhatsApp/email y el equipo los pasa manualmente al ERP — errores y lentitud.",
    solucion: "Bot que recibe pedidos por WhatsApp, los valida contra inventario y los crea en el ERP automáticamente.",
    impacto: "Errores de pedido -80% y capacidad de procesamiento sin aumentar equipo.",
    herramientas: ["WhatsApp Business API", "ERP", "Claude API"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Pronóstico de producción con data de ventas",
    problema: "La producción se planea con Excel y a veces falta stock en puntos de venta o sobra producción que vence.",
    solucion: "Modelo que cruza ventas históricas, estacionalidad y promociones para sugerir plan de producción semanal.",
    impacto: "Merma por vencimiento -20-30% y menos faltantes en punto de venta.",
    herramientas: ["POS / ERP", "Google Sheets / BigQuery", "Python / Claude API"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Gestión de reservas y waiting list para HORECA",
    problema: "Las reservas por WhatsApp saturan al staff y la waiting list se maneja de memoria — clientes se pierden.",
    solucion: "Sistema de reservas automatizado con confirmaciones, recordatorios y waiting list inteligente por WhatsApp.",
    impacto: "Aprovechamiento de mesa +10-15% y menos no-shows.",
    herramientas: ["WhatsApp Business API", "Calendar / sistema de reservas", "Claude API"],
    nivelComplejidad: "bajo",
  },
];

const TURISMO_HOTELERIA: IndustryCase[] = [
  {
    titulo: "Concierge IA 24/7 para huéspedes",
    problema: "Los huéspedes preguntan lo mismo (wifi, desayuno, turismo cercano) y el staff no da abasto — o responden en horas.",
    solucion: "Asistente en WhatsApp con toda la info del hotel + recomendaciones locales que responde al instante.",
    impacto: "Satisfacción del huésped mejora visiblemente y menos consultas repetitivas al front desk.",
    herramientas: ["WhatsApp Business API", "Claude API (RAG)", "PMS"],
    nivelComplejidad: "bajo",
  },
  {
    titulo: "Revenue management automático",
    problema: "Los precios se ajustan manualmente una vez al mes — se pierde revenue en alta y se llenan los cuartos muy tarde.",
    solucion: "Motor que ajusta precios por día según ocupación, eventos locales y competencia en booking/expedia.",
    impacto: "RevPAR +8-15% sin aumentar ocupación (Cornell Hospitality, 2024).",
    herramientas: ["PMS", "Booking/Expedia API", "Claude / Python"],
    nivelComplejidad: "alto",
  },
  {
    titulo: "Generación de paquetes turísticos personalizados",
    problema: "Armar un itinerario personalizado para un cliente toma horas al asesor de viajes.",
    solucion: "Agente que toma preferencias del viajero y devuelve un itinerario con hoteles, tours y pricing listo para ajustar.",
    impacto: "Tiempo por cotización de horas a minutos y mayor conversión.",
    herramientas: ["APIs de proveedores turísticos", "Claude API", "CRM"],
    nivelComplejidad: "medio",
  },
];

const MEDIOS_CONTENIDO: IndustryCase[] = [
  {
    titulo: "Generación y distribución multi-canal de contenido",
    problema: "Adaptar una pieza de contenido a blog, LinkedIn, IG, newsletter y email consume horas por pieza.",
    solucion: "Pipeline que toma el contenido base y genera versiones optimizadas para cada canal con tono adecuado.",
    impacto: "Tiempo de publicación multi-canal -70% y consistencia de marca garantizada.",
    herramientas: ["CMS (WordPress/Notion)", "Claude API", "APIs sociales"],
    nivelComplejidad: "bajo",
  },
  {
    titulo: "Análisis automatizado de performance de contenido",
    problema: "Saber qué contenido funciona requiere cruzar data de múltiples plataformas — nadie lo hace consistentemente.",
    solucion: "Reporte semanal que consolida métricas de todas las plataformas y destaca qué está funcionando y qué no.",
    impacto: "Decisiones editoriales basadas en data real y ROI de contenido visible.",
    herramientas: ["APIs (Meta, LinkedIn, GA)", "Google Sheets", "Claude API"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Agente de investigación para periodismo y research",
    problema: "Preparar un artículo o reporte requiere horas de búsqueda en múltiples fuentes y verificación.",
    solucion: "Agente con acceso a fuentes confiables que arma un dossier con datos verificados y citas listas.",
    impacto: "Tiempo de research -60% y cobertura de fuentes más amplia.",
    herramientas: ["Web search API", "Claude API", "Notion / Docs"],
    nivelComplejidad: "medio",
  },
];

const TECNOLOGIA_SOFTWARE: IndustryCase[] = [
  {
    titulo: "Copilot interno para soporte técnico",
    problema: "Tier 1 responde las mismas preguntas todo el día — y escalan al equipo senior lo que podrían resolver solos.",
    solucion: "Copilot conectado a docs, runbooks y tickets pasados que sugiere respuesta al agente en tiempo real.",
    impacto: "Tickets escalados a Tier 2 -30-50% y tiempo de resolución más rápido.",
    herramientas: ["Helpdesk (Zendesk/Intercom)", "Claude API (RAG)", "Docs internos"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Análisis automático de feedback de usuarios",
    problema: "El feedback llega por tickets, reviews, NPS y no hay tiempo de leerlo todo — se pierden insights de producto.",
    solucion: "Pipeline semanal que clasifica feedback por tema, urgencia y feature afectado para priorizar product roadmap.",
    impacto: "Decisiones de producto mucho mejor informadas y churn detectado temprano.",
    herramientas: ["Tickets, reviews, NPS tool", "Claude API", "Linear / Jira"],
    nivelComplejidad: "bajo",
  },
  {
    titulo: "Onboarding de nuevos usuarios guiado por IA",
    problema: "Los usuarios se atascan en el onboarding y dan churn antes de experimentar valor.",
    solucion: "Asistente contextual in-app que detecta confusión y ofrece ayuda proactiva o agenda onboarding con customer success.",
    impacto: "Activación en primeros 7 días +20-40% y menos churn temprano.",
    herramientas: ["App propia", "Claude API", "Analytics (Mixpanel/Amplitude)"],
    nivelComplejidad: "medio",
  },
];

const ONG_GOBIERNO: IndustryCase[] = [
  {
    titulo: "Atención ciudadana automatizada por WhatsApp",
    problema: "Las oficinas atienden preguntas repetitivas (horarios, trámites, requisitos) — filas largas y satisfacción baja.",
    solucion: "Bot ciudadano que responde trámites, estado de solicitudes y redirige a humano solo cuando es necesario.",
    impacto: "Consultas presenciales -40-60% y satisfacción ciudadana sube notablemente.",
    herramientas: ["WhatsApp Business API", "Claude API (RAG)", "Sistemas internos"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Automatización de reportes a donantes y stakeholders",
    problema: "Armar los reportes trimestrales/anuales para donantes consume semanas del equipo administrativo.",
    solucion: "Sistema que consolida data de proyectos, métricas de impacto y genera reporte narrativo + visual automáticamente.",
    impacto: "Tiempo de reportería -70% y reportes más frecuentes = mejor relación con donantes.",
    herramientas: ["Base de datos de programas", "Claude API", "Plantillas de reporte"],
    nivelComplejidad: "medio",
  },
  {
    titulo: "Análisis de impacto con data de campo",
    problema: "La data de beneficiarios vive en encuestas y Excel disperso — el impacto real es difícil de medir.",
    solucion: "Pipeline que consolida data de campo, cruza con indicadores y genera dashboard de impacto en tiempo real.",
    impacto: "Visibilidad del impacto para decisiones y fundraising notablemente mejor.",
    herramientas: ["KoboToolbox / ODK", "BI tool", "Claude API"],
    nivelComplejidad: "medio",
  },
];

export const INDUSTRY_CASES: Partial<Record<IndustriaValue, IndustryCase[]>> = {
  ecommerce: ECOMMERCE,
  retail_fisico: RETAIL_FISICO,
  servicios_profesionales: SERVICIOS_PROFESIONALES,
  salud_medicina: SALUD_MEDICINA,
  educacion: EDUCACION,
  manufactura: MANUFACTURA,
  logistica_transporte: LOGISTICA_TRANSPORTE,
  construccion_inmobiliaria: CONSTRUCCION_INMOBILIARIA,
  fintech_servicios_financieros: FINTECH_SERVICIOS_FINANCIEROS,
  agroindustria: AGROINDUSTRIA,
  alimentos_bebidas: ALIMENTOS_BEBIDAS,
  turismo_hoteleria: TURISMO_HOTELERIA,
  medios_contenido: MEDIOS_CONTENIDO,
  tecnologia_software: TECNOLOGIA_SOFTWARE,
  consultoria_agencia: CONSULTORIA_AGENCIA,
  ong_gobierno: ONG_GOBIERNO,
  otro: FALLBACK_CROSS_INDUSTRY,
};

export function getCasesForIndustry(industria: string | null | undefined, limit = 3): IndustryCase[] {
  const key = (industria ?? "otro") as IndustriaValue;
  const cases = INDUSTRY_CASES[key] ?? FALLBACK_CROSS_INDUSTRY;
  return cases.slice(0, limit);
}

export function hasIndustrySpecificCases(industria: string | null | undefined): boolean {
  if (!industria) return false;
  return INDUSTRY_CASES[industria as IndustriaValue] !== undefined;
}

export { INDUSTRIA_LABELS };
