import { db } from "./db";
import { emailTemplates } from "@shared/schema";
import { eq } from "drizzle-orm";

const templates = [
  {
    nombre: "confirmacion",
    subjectPrompt: "Genera un subject de confirmación para {participante} de {empresa}. Cálido y directo. Máximo 50 caracteres. Ejemplo: '{participante}, tu diagnóstico está confirmado'.",
    bodyPrompt: `Genera un email de CONFIRMACIÓN de sesión de diagnóstico tecnológico.

INSTRUCCIONES ESPECÍFICAS:
- Largo: máximo 180 palabras
- Estructura: agradecimiento → confirmación datos → botón reunión → qué esperar → reagendar/cancelar

CONTENIDO OBLIGATORIO:
1. Saludo con nombre: "Hola {participante}" — SIEMPRE usa el nombre del participante
2. Agradecimiento genuino y breve: "Gracias por agendar tu diagnóstico tecnológico con IM3 Systems"
3. Quiénes somos (1-2 líneas): especialistas en IA, automatización y desarrollo de software para empresas en Latinoamérica
4. Confirma datos de la cita con formato claro:
   - Fecha: {fechaCita}
   - Hora: {horaCita}
   - Duración: 45 minutos
5. Si hay meetLink: incluir como BOTÓN PRINCIPAL prominente: "Unirse a la reunión →" (usar el link de Meet del contexto)
6. Si hay link de agregar al calendario: incluir justo después como texto: "📅 Agregar a mi calendario"
7. Qué esperar: "En los próximos días te enviaremos contenido relevante sobre tecnología en {industria} para que llegues preparado"
8. Al final (texto pequeño, color #999): "¿Necesitas cambiar la fecha? Reagendar · Cancelar" (usar los links de reagendar y cancelar del contexto)

IMPORTANTE:
- NO uses "Confirmar asistencia" — la persona YA confirmó al agendar
- NO incluyas CTA a /booking — el contacto ya agendó
- El botón principal debe ser el link de la reunión (Meet)
- NO uses genéricos como "Estimado usuario" — SIEMPRE el nombre real

TONO: cálido, como darle la bienvenida a alguien que tomó una buena decisión. Profesional pero cercano.`,
    sequenceOrder: 0,
    delayDays: 0,
  },
  {
    nombre: "caso_exito",
    subjectPrompt: "Genera un subject sobre un caso de éxito de IA/automatización relevante para {industria}. Que genere curiosidad. Máximo 55 caracteres.",
    bodyPrompt: `Genera un email educativo con un caso de éxito de IA o automatización para la industria {industria}.

INSTRUCCIONES ESPECÍFICAS:
- Largo: máximo 200 palabras
- Estructura: saludo con nombre → gancho → caso → resultado → recordatorio de cita → link reunión

CONTENIDO OBLIGATORIO:
1. Abre con nombre: "{participante}," — nunca genérico
2. Dato o tendencia que capture atención sobre {industria} con FUENTE VERIFICABLE (McKinsey, Gartner, Forrester, Deloitte, HBR)
3. El problema que enfrentan empresas del sector (relacionado con {areaPrioridad})
4. La solución de IA/automatización que están adoptando
5. Resultado concreto con fuente verificable
6. Puente: "En tu sesión del {fechaCita} a las {horaCita} exploraremos oportunidades similares para {empresa}"
7. Si hay meetLink: incluir botón "Link de tu reunión →"
8. Al final (texto pequeño, color #999): "Reagendar · Cancelar" con los links correspondientes

NO incluyas CTA a /booking — el contacto ya tiene su cita agendada.

TONO: educativo, con sustancia. Como un artículo corto que vale la pena leer. Que sienta que ya está recibiendo valor antes de la reunión.`,
    sequenceOrder: 1,
    delayDays: 1,
  },
  {
    nombre: "insight_educativo",
    subjectPrompt: "Genera un subject sobre insights de automatización/IA para {industria}. Accionable. Máximo 55 caracteres. Ejemplo: '3 procesos en {industria} que ya se automatizan'.",
    bodyPrompt: `Genera un email con 3 insights accionables sobre IA y automatización para {industria}.

INSTRUCCIONES ESPECÍFICAS:
- Largo: máximo 200 palabras
- Estructura: saludo con nombre → intro → 3 insights → recordatorio de cita → link reunión

CONTENIDO OBLIGATORIO:
1. Saludo: "{participante},"
2. Intro: "En {industria}, estas son las 3 áreas donde más impacto está teniendo la tecnología:"
3. Tres insights específicos y accionables:
   - Cada uno con título en bold y 1-2 líneas
   - Relacionados con {areaPrioridad} y {objetivos}
   - Al menos una estadística con fuente verificable
4. Diferenciador: "Lo que hacemos diferente es que no solo identificamos oportunidades — diseñamos la hoja de ruta completa para implementarlas"
5. Recordatorio: "Esto es lo que analizaremos juntos el {fechaCita} a las {horaCita}"
6. Si hay meetLink: incluir botón "Link de tu reunión →"
7. Al final (texto pequeño, color #999): "Reagendar · Cancelar"

NO incluyas CTA a /booking — el contacto ya agendó.

TONO: thought leadership. Como un consultor senior compartiendo lo que ve en el mercado. Que sienta que ya está aprendiendo cosas útiles.`,
    sequenceOrder: 2,
    delayDays: 3,
  },
  {
    nombre: "prep_agenda",
    subjectPrompt: "Genera un subject de preparación para la sesión de mañana. Máximo 50 caracteres. Ejemplo: 'Mañana: tu diagnóstico con IM3, {participante}'.",
    bodyPrompt: `Genera un email de preparación y agenda para la sesión de diagnóstico de mañana.

INSTRUCCIONES ESPECÍFICAS:
- Largo: máximo 150 palabras
- Estructura: saludo → recordatorio → agenda → preparación → botón reunión → agregar calendario

CONTENIDO OBLIGATORIO:
1. "{participante}, mañana a las {horaCita} tenemos tu sesión de diagnóstico"
2. Agenda de la sesión (bullets):
   - Auditoría de operaciones actuales y stack tecnológico
   - Mapeo de oportunidades de IA y automatización
   - Evaluación de viabilidad técnica
   - Hoja de ruta sugerida con prioridades
3. "Prepárate pensando en: tus herramientas actuales, procesos clave, y los cuellos de botella más grandes de tu operación"
4. Si hay meetLink: incluir como BOTÓN PRINCIPAL "Unirse a la reunión →"
5. Si hay link de agregar al calendario: "📅 Agregar a mi calendario"
6. Al final (texto pequeño, color #999): "Reagendar · Cancelar"

NO incluyas CTA a /booking. El único CTA prominente es el link de la reunión.

TONO: útil, genera anticipación. Como un email de un consultor que se preparó y quiere que tú también llegues listo.`,
    sequenceOrder: 3,
    delayDays: 0,
  },
  {
    nombre: "recordatorio_6h",
    subjectPrompt: "fixed",
    bodyPrompt: "fixed",
    sequenceOrder: 4,
    delayDays: 0,
  },
  {
    nombre: "micro_recordatorio",
    subjectPrompt: "fixed",
    bodyPrompt: "fixed",
    sequenceOrder: 5,
    delayDays: 0,
  },
  {
    nombre: "seguimiento_post",
    subjectPrompt: "Genera un subject de seguimiento post-reunión para {participante} de {empresa}. Con momentum. Máximo 55 caracteres. Ejemplo: 'Próximos pasos para {empresa}' o '{participante}, tu hoja de ruta'.",
    bodyPrompt: `Genera un email de SEGUIMIENTO enviado 5 horas después de la sesión de diagnóstico.

INSTRUCCIONES ESPECÍFICAS:
- Largo: máximo 220 palabras
- Estructura: agradecimiento → oportunidades detectadas → próximos pasos → CTA seguimiento

CONTENIDO OBLIGATORIO:
1. "{participante}, gracias por tu tiempo en la sesión de hoy" — reconoce que invirtieron 45 minutos
2. Resumen de oportunidades (2-3 bullets): basado en diagnóstico de {industria} y {areaPrioridad}
3. Próximos pasos claros (2-3 pasos concretos): evaluación técnica → prototipo → implementación
4. CTA: "¿Te gustaría agendar una sesión de seguimiento para revisar la propuesta?" con botón a https://www.im3systems.com/booking

IMPORTANTE: Este email se envía DESPUÉS de la reunión. Escribe en pasado ("en nuestra conversación de hoy", "como vimos juntos"). NO menciones fecha ni hora.

Este es el ÚNICO email donde el CTA va a /booking (para agendar seguimiento).

TONO: consultivo, con momentum. Como un consultor senior que quiere mantener el impulso.`,
    sequenceOrder: 6,
    delayDays: 0,
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
3. Beneficio concreto: qué tipo de resultados logran las empresas que completan el diagnóstico
4. CTA claro: "Completar mi diagnóstico" con botón a https://im3systems.com/booking
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
