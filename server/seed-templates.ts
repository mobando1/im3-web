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
3. Qué esperar de la sesión (30 min, evaluación técnica)
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
3. Duración: 30 minutos
4. Que pueden reagendar si lo necesitan contactando a info@im3systems.com
Tono: breve, útil, no presiona.`,
    sequenceOrder: 2,
    delayDays: 4,
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
