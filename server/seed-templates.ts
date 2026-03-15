import { db } from "./db";
import { emailTemplates } from "@shared/schema";
import { eq } from "drizzle-orm";

const templates = [
  {
    nombre: "confirmacion",
    subjectPrompt: "Genera un subject de bienvenida para {empresa} que acaba de agendar su diagnóstico. Cálido y profesional. Máximo 50 caracteres. Ejemplo: 'Bienvenido {participante} — tu diagnóstico está listo'.",
    bodyPrompt: `Genera un email de BIENVENIDA y confirmación de sesión de diagnóstico tecnológico.

INSTRUCCIONES ESPECÍFICAS:
- Largo: máximo 180 palabras
- Estructura: agradecimiento → quiénes somos → confirmación → qué esperar → cierre

CONTENIDO OBLIGATORIO:
1. Agradecimiento genuino: "Gracias por dar el primer paso" — el lead acaba de llenar un formulario largo, reconoce eso
2. Quiénes somos (2-3 líneas máximo): IM3 Systems es una empresa de tecnología especializada en inteligencia artificial, automatización y desarrollo de software para empresas en Latinoamérica. No somos una consultora genérica — diseñamos e implementamos soluciones tecnológicas reales que transforman operaciones.
3. Confirma la cita: fecha={fechaCita}, hora={horaCita}, duración=45 minutos
4. Mención personalizada: "Vamos a analizar oportunidades de IA y automatización específicas para {industria}"
5. Si hay meetLink disponible, incluir: "Link de la reunión: {meetLink}"
6. Qué esperar: "En los próximos días te enviaremos contenido relevante sobre tecnología aplicada a tu industria para que llegues preparado a la sesión"
7. Para reagendar: "Si necesitas mover la sesión, puedes reagendar aquí: https://im3systems.com/booking"

TONO: cálido pero profesional. Como recibir a alguien que tomó una buena decisión. No corporativo, no vendedor.`,
    sequenceOrder: 0,
    delayDays: 0, // Inmediato
  },
  {
    nombre: "caso_exito",
    subjectPrompt: "Genera un subject sobre un caso de éxito de IA/automatización relevante para {industria}. Que genere curiosidad. Máximo 55 caracteres. Ejemplo: 'Cómo una empresa de {industria} automatizó su operación'.",
    bodyPrompt: `Genera un email educativo con un caso de éxito de IA o automatización para la industria {industria}.

INSTRUCCIONES ESPECÍFICAS:
- Largo: máximo 200 palabras
- Estructura: gancho → problema → solución → resultado → conexión con su empresa

CONTENIDO OBLIGATORIO:
1. Abre con un dato o situación que capture atención sobre {industria}
2. Describe tendencias reales del sector — NO inventes nombres de empresas ni cifras específicas ficticias. Usa frases como "empresas del sector", "negocios similares en {industria}":
   - El problema que tenían (relacionado con sus áreas prioritarias: {areaPrioridad})
   - La solución de IA/automatización implementada
   - Resultado medible (ej: "redujo 40% tiempos de procesamiento", "aumentó 25% conversión")
3. Puente: "En tu sesión del {fechaCita} exploraremos oportunidades similares para {empresa}"
4. NO incluir CTA de venta — el valor ES el contenido

CONTEXTO PARA PERSONALIZAR:
- Herramientas actuales: {herramientas}
- Nivel tech: {nivelTech}
- Usa IA: {usaIA}
- Objetivos: {objetivos}

TONO: educativo, con sustancia. Como un artículo corto de blog que vale la pena leer.`,
    sequenceOrder: 1,
    delayDays: 1, // Día siguiente
  },
  {
    nombre: "insight_educativo",
    subjectPrompt: "Genera un subject sobre insights de automatización/IA para {industria}. Que sea accionable. Máximo 55 caracteres. Ejemplo: '3 procesos en {industria} que ya no necesitan ser manuales'.",
    bodyPrompt: `Genera un email con 3 insights accionables sobre IA y automatización para {industria}.

INSTRUCCIONES ESPECÍFICAS:
- Largo: máximo 200 palabras
- Estructura: intro breve → 3 insights numerados → cierre

CONTENIDO OBLIGATORIO:
1. Intro: "En {industria}, estas son las 3 áreas donde más impacto está teniendo la tecnología:"
2. Tres insights específicos y accionables:
   - Cada uno con título en bold y 1-2 líneas de explicación
   - Relacionados con sus áreas prioritarias ({areaPrioridad}) y objetivos ({objetivos})
   - Incluir al menos una tendencia reciente verificable del sector
   - Hablar en términos generales del sector, NO inventar nombres de empresas ni datos ficticios
3. Cómo IM3 se diferencia: "Lo que hacemos diferente es que no solo identificamos oportunidades — diseñamos la hoja de ruta completa para implementarlas"
4. Cierre: "El {fechaCita} profundizaremos en cómo aplicar esto en {empresa}"

CONTEXTO:
- Productos/servicios: {productos}
- Volumen mensual: {volumenMensual}
- Comodidad tech: {comodidadTech}
- Familiaridad: automatización={familiaridad.automatizacion}, IA={familiaridad.ia}

TONO: thought leadership. Como si fuera un consultor senior compartiendo lo que ve en el mercado.`,
    sequenceOrder: 2,
    delayDays: 3, // Día 3
  },
  {
    nombre: "prep_agenda",
    subjectPrompt: "Genera un subject de preparación para la sesión de mañana con {empresa}. Máximo 50 caracteres. Ejemplo: 'Mañana: tu sesión de diagnóstico IM3'.",
    bodyPrompt: `Genera un email de preparación y agenda para la sesión de diagnóstico de mañana.

INSTRUCCIONES ESPECÍFICAS:
- Largo: máximo 130 palabras
- Estructura: recordatorio → agenda → preparación → link

CONTENIDO OBLIGATORIO:
1. "Mañana a las {horaCita} tenemos tu sesión de diagnóstico"
2. Agenda de la sesión (bullets):
   - Auditoría de operaciones actuales y stack tecnológico
   - Mapeo de oportunidades de IA y automatización
   - Evaluación de viabilidad técnica
   - Hoja de ruta sugerida con prioridades
3. Qué tener a mano: "Piensa en tus herramientas actuales, procesos clave, y los cuellos de botella más grandes de tu operación"
4. Si hay meetLink: "Link de la reunión: {meetLink}"
5. Para reagendar: "Si necesitas mover la sesión, puedes reagendar aquí: https://im3systems.com/booking"

TONO: útil, estructurado, genera anticipación. No presiona.`,
    sequenceOrder: 3,
    delayDays: 0, // Calculado dinámicamente: fechaCita - 24h
  },
  {
    nombre: "recordatorio_6h",
    subjectPrompt: "fixed", // No se usa — template fijo
    bodyPrompt: "fixed", // No se usa — template fijo
    sequenceOrder: 4,
    delayDays: 0, // Calculado dinámicamente: fechaCita - 6h
  },
  {
    nombre: "micro_recordatorio",
    subjectPrompt: "fixed", // No se usa — E5 es template fijo
    bodyPrompt: "fixed", // No se usa — E5 es template fijo
    sequenceOrder: 5,
    delayDays: 0, // Calculado dinámicamente: fechaCita - 1h
  },
  {
    nombre: "seguimiento_post",
    subjectPrompt: "Genera un subject de seguimiento post-reunión para {empresa}. Profesional y con momentum. Máximo 55 caracteres. Ejemplo: 'Próximos pasos para {empresa}' o 'Tu hoja de ruta, {participante}'.",
    bodyPrompt: `Genera un email de SEGUIMIENTO enviado 5 horas después de la sesión de diagnóstico tecnológico con IM3 Systems.

INSTRUCCIONES ESPECÍFICAS:
- Largo: máximo 220 palabras
- Estructura: agradecimiento → oportunidades detectadas → próximos pasos → CTA

CONTENIDO OBLIGATORIO:
1. Agradecimiento breve: "Gracias por tu tiempo en la sesión de hoy" — reconoce que invirtieron 45 minutos
2. Resumen de oportunidades (2-3 bullets): basado en sus datos del diagnóstico, menciona oportunidades concretas de IA/automatización para su industria ({industria}) y áreas prioritarias ({areaPrioridad})
3. Próximos pasos claros: "Esto es lo que recomendamos como siguiente paso:" — propón una hoja de ruta de 2-3 pasos concretos (evaluación técnica, prototipo, implementación)
4. CTA: "¿Te gustaría agendar una sesión de seguimiento para revisar la propuesta?" con link: https://im3systems.com/booking
5. Firma: "— Equipo IM3 Systems"

IMPORTANTE: Este email se envía DESPUÉS de la reunión. Escribe en pasado sobre la sesión ("en nuestra conversación de hoy", "como vimos juntos"). NO menciones fecha ni hora de la cita pasada.

CONTEXTO PARA PERSONALIZAR:
- Herramientas actuales: {herramientas}
- Nivel tech: {nivelTech}
- Objetivos: {objetivos}
- Área prioritaria: {areaPrioridad}
- Industria: {industria}

TONO: consultivo, con momentum. Como un consultor senior que acaba de tener una reunión productiva y quiere mantener el impulso. No vendedor, sino estratégico.`,
    sequenceOrder: 6,
    delayDays: 0, // Calculado dinámicamente: fechaCita + 5h
  },
  {
    nombre: "abandono",
    subjectPrompt: "Genera un subject empático para alguien que empezó a agendar pero no terminó. Máximo 50 caracteres. Ejemplo: '¿Todavía pensando?' o 'Tu diagnóstico está pendiente'.",
    bodyPrompt: `Genera un email de rescate para alguien que dejó su email pero no completó el formulario de diagnóstico de IM3 Systems.

INSTRUCCIONES ESPECÍFICAS:
- Largo: máximo 120 palabras
- Estructura: empatía → valor → caso de éxito → CTA

CONTENIDO OBLIGATORIO:
1. Empatía: "Sabemos que a veces hay interrupciones — tu diagnóstico quedó pendiente"
2. Recordatorio de valor: diagnóstico personalizado de IA y automatización, gratuito, 45 minutos
3. Beneficio concreto: qué tipo de resultados logran las empresas que completan el diagnóstico (en términos generales, sin inventar nombres ni cifras específicas)
4. CTA claro: "Completar mi diagnóstico" con link a https://im3systems.com/booking
5. Escasez sutil: "Solo realizamos un número limitado de auditorías por semana"

TONO: cercano, sin presión, genera curiosidad.`,
    sequenceOrder: 99,
    delayDays: 0,
  },
];

async function seed() {
  if (!db) {
    console.error("DATABASE_URL not configured");
    process.exit(1);
  }

  console.log("Seeding email templates...");

  // Deactivate old templates
  const existing = await db.select().from(emailTemplates);
  if (existing.length > 0) {
    console.log(`  Deactivating ${existing.length} old template(s)...`);
    for (const t of existing) {
      await db.update(emailTemplates)
        .set({ isActive: false })
        .where(eq(emailTemplates.id, t.id));
    }
  }

  // Insert new templates
  for (const t of templates) {
    await db.insert(emailTemplates).values(t);
    console.log(`  + ${t.nombre} (order: ${t.sequenceOrder})`);
  }

  console.log("Done!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
