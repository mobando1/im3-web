import { db } from "./db";
import { contacts, clientProjects, projectPhases, projectTasks, projectMessages } from "@shared/schema";
import { eq } from "drizzle-orm";

async function seedP2F() {
  if (!db) {
    console.error("DATABASE_URL not configured");
    process.exit(1);
  }

  console.log("Creating P2F project...");

  // 1. Create or find contact
  const [existingContact] = await db.select().from(contacts).where(eq(contacts.email, "info@passport2fluency.com")).limit(1);
  let contactId: string;

  if (existingContact) {
    contactId = existingContact.id;
    console.log(`  Contact already exists: ${existingContact.nombre} (${contactId})`);
  } else {
    const [newContact] = await db.insert(contacts).values({
      nombre: "Sebastián Garzón",
      empresa: "P2F Passport2Fluency",
      email: "info@passport2fluency.com",
      status: "converted",
      leadScore: 100,
    }).returning();
    contactId = newContact.id;
    console.log(`  + Contact created: ${newContact.nombre} (${contactId})`);
  }

  // 2. Create project
  const [project] = await db.insert(clientProjects).values({
    contactId,
    name: "Portal P2F — Passport2Fluency",
    description: "Plataforma SaaS de aprendizaje de idiomas con tutores en vivo, práctica con IA (Lingo), gamificación, pagos Stripe, Google Meet y CRM integrado. 3 roles: estudiante, tutor, admin.",
    status: "in_progress",
    startDate: new Date("2025-10-01"),
    estimatedEndDate: new Date("2026-06-30"),
    totalBudget: 7500,
    currency: "USD",
    healthStatus: "on_track",
    healthNote: "Proyecto en fase de corrección y pulido. 7 de 10 fases completadas.",
  }).returning();

  console.log(`  + Project created: ${project.name} (${project.id})`);
  console.log(`  Portal token: ${project.accessToken}`);

  // 3. Create phases with tasks
  const phasesData = [
    {
      phase: { name: "Arquitectura y Base", description: "Fundamentos técnicos: autenticación, base de datos, roles y deploy", status: "completed", estimatedHours: 60, startDate: new Date("2025-10-01"), endDate: new Date("2025-11-15") },
      tasks: [
        { title: "Auth local (email + password + bcrypt)", status: "completed", priority: "high", clientFacingTitle: "Sistema de login seguro" },
        { title: "Google OAuth integration", status: "completed", priority: "high", clientFacingTitle: "Login con Google" },
        { title: "Microsoft OAuth integration", status: "completed", priority: "medium", clientFacingTitle: "Login con Microsoft" },
        { title: "PostgreSQL + Drizzle ORM (26+ tablas)", status: "completed", priority: "high", clientFacingTitle: "Base de datos completa" },
        { title: "Estructura 3 roles (estudiante, tutor, admin)", status: "completed", priority: "high", clientFacingTitle: "Sistema de roles y permisos" },
        { title: "Deploy en Railway", status: "completed", priority: "high", clientFacingTitle: "Servidor en producción" },
        { title: "Middleware de protección de rutas", status: "completed", priority: "high", clientFacingTitle: "Seguridad de acceso" },
      ],
    },
    {
      phase: { name: "Portal del Estudiante", description: "Interfaz completa para estudiantes: clases, tutores, mensajes, soporte", status: "completed", estimatedHours: 120, startDate: new Date("2026-01-10"), endDate: new Date("2026-02-10") },
      tasks: [
        { title: "Dashboard con clases y progreso", status: "completed", priority: "high", clientFacingTitle: "Panel principal del estudiante" },
        { title: "Catálogo de tutores con filtros", status: "completed", priority: "high", clientFacingTitle: "Búsqueda y selección de tutores" },
        { title: "Reserva de clases con calendario", status: "completed", priority: "high", clientFacingTitle: "Agendamiento de clases" },
        { title: "Perfil y configuración del estudiante", status: "completed", priority: "medium", clientFacingTitle: "Perfil y preferencias" },
        { title: "Mensajes directos tutor-estudiante", status: "completed", priority: "medium", clientFacingTitle: "Chat con tutores" },
        { title: "Sistema de soporte (tickets)", status: "completed", priority: "medium", clientFacingTitle: "Centro de ayuda" },
        { title: "Guía de aprendizaje", status: "completed", priority: "low", clientFacingTitle: "Guía y consejos" },
      ],
    },
    {
      phase: { name: "Portal del Tutor", description: "Espacio de trabajo completo para tutores: calendario, materiales, pagos, IA", status: "completed", estimatedHours: 100, startDate: new Date("2026-02-10"), endDate: new Date("2026-03-01") },
      tasks: [
        { title: "Dashboard con calendario visual", status: "completed", priority: "high", clientFacingTitle: "Panel del tutor con calendario" },
        { title: "Gestión de disponibilidad semanal + excepciones", status: "completed", priority: "high", clientFacingTitle: "Horarios y disponibilidad" },
        { title: "Notas de sesión y tareas", status: "completed", priority: "medium", clientFacingTitle: "Notas y homework por clase" },
        { title: "Biblioteca de materiales", status: "completed", priority: "medium", clientFacingTitle: "Materiales didácticos" },
        { title: "Métricas de rendimiento del tutor", status: "completed", priority: "medium", clientFacingTitle: "Estadísticas del tutor" },
        { title: "Historial de pagos y liquidaciones", status: "completed", priority: "high", clientFacingTitle: "Pagos y facturación del tutor" },
        { title: "Asistente IA para planificación de clases", status: "completed", priority: "medium", clientFacingTitle: "IA para preparar clases" },
        { title: "Sistema de invitación de tutores", status: "completed", priority: "medium", clientFacingTitle: "Invitar nuevos tutores" },
      ],
    },
    {
      phase: { name: "Inteligencia Artificial", description: "Partner de práctica 'Lingo' con correcciones, vocabulario y memoria contextual", status: "completed", estimatedHours: 80, startDate: new Date("2026-02-15"), endDate: new Date("2026-03-05") },
      tasks: [
        { title: "Partner de práctica Lingo (Claude API)", status: "completed", priority: "high", clientFacingTitle: "Compañero de práctica con IA" },
        { title: "Correcciones gramaticales en tiempo real", status: "completed", priority: "high", clientFacingTitle: "Correcciones automáticas" },
        { title: "Tracking de vocabulario aprendido", status: "completed", priority: "medium", clientFacingTitle: "Seguimiento de vocabulario" },
        { title: "Perfiles de estudiante con memoria contextual", status: "completed", priority: "medium", clientFacingTitle: "IA recuerda el progreso" },
      ],
    },
    {
      phase: { name: "Gamificación y Learning Path", description: "Camino de aprendizaje visual A1→B2 con XP, rachas y logros", status: "completed", estimatedHours: 60, startDate: new Date("2026-03-01"), endDate: new Date("2026-03-10") },
      tasks: [
        { title: "Camino visual snake path (A1→A2→B1→B2)", status: "completed", priority: "high", clientFacingTitle: "Camino de aprendizaje visual" },
        { title: "Sistema de XP, rachas y logros", status: "completed", priority: "medium", clientFacingTitle: "Puntos y logros" },
        { title: "Quizzes por nivel", status: "completed", priority: "medium", clientFacingTitle: "Exámenes de progreso" },
        { title: "Flashcards y speaking prompts", status: "completed", priority: "medium", clientFacingTitle: "Tarjetas y ejercicios orales" },
      ],
    },
    {
      phase: { name: "Pagos y Suscripciones", description: "Stripe completo: 3 planes de suscripción + paquetes à-la-carte + webhooks", status: "completed", estimatedHours: 50, startDate: new Date("2026-02-20"), endDate: new Date("2026-03-08") },
      tasks: [
        { title: "Integración Stripe (suscripciones + paquetes)", status: "completed", priority: "high", clientFacingTitle: "Pasarela de pagos" },
        { title: "3 planes: Starter $119, Momentum $219, Fluency $299", status: "completed", priority: "high", clientFacingTitle: "Planes de suscripción" },
        { title: "Paquetes à-la-carte (5, 10, 20, 30 clases)", status: "completed", priority: "medium", clientFacingTitle: "Paquetes de clases" },
        { title: "Webhooks Stripe para ciclo de vida", status: "completed", priority: "high", clientFacingTitle: "Renovaciones y cancelaciones automáticas" },
      ],
    },
    {
      phase: { name: "Integraciones Externas", description: "Google Meet, Calendar, High Level CRM, Resend, Reviews", status: "completed", estimatedHours: 70, startDate: new Date("2026-02-25"), endDate: new Date("2026-03-15") },
      tasks: [
        { title: "Google Meet (links automáticos)", status: "completed", priority: "high", clientFacingTitle: "Videollamadas automáticas" },
        { title: "Google Calendar (sync disponibilidad)", status: "completed", priority: "medium", clientFacingTitle: "Sincronización de calendario" },
        { title: "High Level CRM (contactos, calendarios, webhooks)", status: "completed", priority: "medium", clientFacingTitle: "Integración CRM existente" },
        { title: "Resend (emails transaccionales)", status: "completed", priority: "medium", clientFacingTitle: "Emails automáticos" },
        { title: "Sistema de reviews tutor-estudiante", status: "completed", priority: "medium", clientFacingTitle: "Sistema de calificaciones" },
      ],
    },
    {
      phase: { name: "Corrección y Pulido", description: "Testing, corrección de bugs, optimización de UX y rendimiento", status: "in_progress", estimatedHours: 40, startDate: new Date("2026-03-15"), endDate: new Date("2026-04-15") },
      tasks: [
        { title: "Corregir errores en portal del estudiante", status: "in_progress", priority: "high", clientFacingTitle: "Correcciones portal estudiante" },
        { title: "Corregir errores en portal del tutor", status: "in_progress", priority: "high", clientFacingTitle: "Correcciones portal tutor" },
        { title: "Corregir errores en panel admin", status: "pending", priority: "medium", clientFacingTitle: "Correcciones panel admin" },
        { title: "Corregir pasarelas de pago", status: "in_progress", priority: "high", clientFacingTitle: "Ajustes en pagos" },
        { title: "Pulir UX/UI general", status: "pending", priority: "medium", clientFacingTitle: "Mejoras visuales y de usabilidad" },
        { title: "Testing end-to-end flujos críticos", status: "pending", priority: "high", clientFacingTitle: "Pruebas completas" },
        { title: "Optimización de rendimiento", status: "pending", priority: "medium", clientFacingTitle: "Mejorar velocidad de carga" },
      ],
    },
    {
      phase: { name: "Mejoras de IA y Personalización", description: "Paquetes personalizados por perfil, mejoras al learning path, más IA", status: "pending", estimatedHours: 50, startDate: new Date("2026-04-15"), endDate: new Date("2026-05-15") },
      tasks: [
        { title: "Paquetes personalizados según perfil del estudiante", status: "pending", priority: "high", clientFacingTitle: "Paquetes a la medida", isMilestone: true },
        { title: "Mejoras al learning path y contenido", status: "pending", priority: "medium", clientFacingTitle: "Más contenido en el camino" },
        { title: "Más inteligencia artificial en la experiencia", status: "pending", priority: "medium", clientFacingTitle: "Experiencia más inteligente" },
      ],
    },
    {
      phase: { name: "Migración y Go-Live", description: "Migrar estudiantes y contactos desde High Level, pruebas con usuarios reales, lanzamiento", status: "pending", estimatedHours: 30, startDate: new Date("2026-05-15"), endDate: new Date("2026-06-30") },
      tasks: [
        { title: "Migrar estudiantes desde High Level CRM", status: "pending", priority: "high", clientFacingTitle: "Migración de estudiantes" },
        { title: "Migrar contactos y datos existentes", status: "pending", priority: "high", clientFacingTitle: "Migración de datos" },
        { title: "Pruebas con usuarios reales", status: "pending", priority: "high", clientFacingTitle: "Pruebas beta" },
        { title: "Go-live de la plataforma", status: "pending", priority: "high", clientFacingTitle: "Lanzamiento oficial", isMilestone: true },
      ],
    },
  ];

  for (let i = 0; i < phasesData.length; i++) {
    const { phase, tasks } = phasesData[i];
    const [ph] = await db.insert(projectPhases).values({
      projectId: project.id,
      ...phase,
      orderIndex: i,
    }).returning();
    console.log(`  + Fase ${i + 1}: ${phase.name} (${phase.status})`);

    for (const task of tasks) {
      await db.insert(projectTasks).values({
        projectId: project.id,
        phaseId: ph.id,
        ...task,
        isMilestone: task.isMilestone || false,
      });
    }
    console.log(`    ${tasks.length} tareas creadas`);
  }

  // 4. Welcome message
  await db.insert(projectMessages).values({
    projectId: project.id,
    senderType: "team",
    senderName: "Equipo IM3 Systems",
    content: "¡Bienvenido al portal de tu proyecto, Sebastián! Aquí puedes ver el avance en tiempo real de Passport2Fluency. Estamos en la fase de corrección y pulido — 7 de 10 fases completadas. Cualquier duda o comentario, escríbenos por aquí.",
  });

  console.log("\n✅ Proyecto P2F creado exitosamente!");
  console.log(`\n📋 Portal URL: /portal/${project.accessToken}`);
  console.log(`🔑 Token: ${project.accessToken}`);
  process.exit(0);
}

seedP2F().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
