import { db } from "./db";
import { emailTemplates } from "@shared/schema";

const templates = [
  {
    nombre: "confirmacion",
    subjectPrompt: "Genera un subject corto y profesional confirmando la sesión de diagnóstico tecnológico para la empresa {empresa}. Máximo 50 caracteres.",
    bodyPrompt: `Genera un email de confirmación de sesión de diagnóstico.
Datos: empresa={empresa}, industria={industria}, participante={participante}, fecha={fechaCita}, hora={horaCita}.
Incluye:
1. Agradecimiento por agendar
2. Resumen breve de lo que analizaremos basado en su industria y objetivos
3. Qué esperar de la sesión (45 min, evaluación técnica)
4. Próximos pasos (recibirán un cuestionario previo)
Tono: profesional pero cercano, genera confianza.`,
    sequenceOrder: 0,
    delayDays: 0,
  },
  {
    nombre: "caso_uso",
    subjectPrompt: "Genera un subject atractivo sobre un caso de uso de IA/automatización relevante para la industria {industria}. Máximo 50 caracteres.",
    bodyPrompt: `Genera un email educativo con un caso de uso concreto de IA o automatización para la industria {industria}.
Datos del cliente: herramientas actuales={herramientas}, áreas prioritarias={areaPrioridad}, nivel tech={nivelTech}, usa IA={usaIA}.
Incluye:
1. Un mini caso de estudio realista (no tiene que ser cliente real, pero sí verosímil)
2. Métricas de mejora (ej: "redujo 40% el tiempo de procesamiento")
3. Cómo esto se relaciona con sus áreas prioritarias
4. Cierre: "En su sesión exploraremos oportunidades similares para {empresa}"
Tono: educativo, genera valor, sin vender directamente.`,
    sequenceOrder: 1,
    delayDays: 2,
  },
  {
    nombre: "recordatorio",
    subjectPrompt: "Genera un subject de recordatorio amigable para la sesión de diagnóstico del {fechaCita}. Máximo 50 caracteres.",
    bodyPrompt: `Genera un email recordatorio para la sesión de diagnóstico.
Datos: empresa={empresa}, participante={participante}, fecha={fechaCita}, hora={horaCita}.
Incluye:
1. Recordatorio amigable de la sesión
2. Qué preparar: tener a mano info sobre herramientas actuales y procesos clave
3. Duración: 45 minutos
4. Que pueden reagendar si lo necesitan contactando a info@im3systems.com
Tono: breve, útil, no presiona.`,
    sequenceOrder: 2,
    delayDays: 4,
  },
  {
    nombre: "abandono",
    subjectPrompt: "Genera un subject corto y empático para alguien que empezó a agendar su diagnóstico tecnológico pero no terminó. Máximo 50 caracteres. Algo como '¿Todavía pensando?' o 'Tu diagnóstico está pendiente'.",
    bodyPrompt: `Genera un email de rescate para alguien que dejó su email pero no completó el formulario de diagnóstico tecnológico de IM3 Systems.
Incluye:
1. Tono empático, sin presión — "sabemos que a veces hay interrupciones"
2. Brevísimo recordatorio de lo que obtienen: diagnóstico personalizado de IA y automatización, gratuito, 45 minutos
3. Un mini caso de éxito verosímil (ej: "Una empresa de logística redujo 35% sus tiempos de procesamiento después de nuestro diagnóstico")
4. CTA claro: "Completar mi diagnóstico" con link a https://im3systems.com/booking
5. Nota de escasez sutil: "Solo realizamos 2 auditorías por semana"
Tono: cercano, sin vender demasiado, genera curiosidad.`,
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

  for (const t of templates) {
    await db.insert(emailTemplates).values(t);
    console.log(`  ✓ ${t.nombre} (day ${t.delayDays})`);
  }

  console.log("Done!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
