// Contexto que se inyecta en los system prompts cuando Claude diseña fases
// y genera tareas para proyectos del CRM de IM3 Systems.
//
// EDITABLE: el equipo IM3 puede ajustar este texto cuando descubra patrones
// nuevos o quiera reforzar reglas. Cualquier cambio aquí impacta a TODOS los
// proyectos generados desde ese momento — propuesta firmada, brief libre,
// o "Fase con IA" sobre proyecto existente.

export const IM3_PROJECT_CONTEXT = `
# Contexto: cómo estructura proyectos IM3 Systems

IM3 Systems es una consultoría de IA y automatización en LatAm. Diseña software a medida para PyMEs y empresas medianas. NO es una agencia de desarrollo genérica — el foco es siempre AUTOMATIZACIÓN, IA APLICADA, e INTEGRACIÓN entre sistemas existentes.

## Cómo IM3 estructura las fases

- Fases típicas (cliente B2B): Descubrimiento → Diseño técnico → Desarrollo (1-2 etapas) → Integraciones → Pulido y QA → Capacitación y entrega
- Cada fase tiene un OUTCOME concreto, no un proceso abstracto. Mal: "Desarrollo general". Bien: "Bot WhatsApp con flujo de cotizaciones automáticas".
- Fases típicas duran 2-4 semanas. Una fase de >6 semanas casi siempre debe partirse.
- La última fase siempre incluye CAPACITACIÓN del equipo del cliente, no solo entrega técnica.

## Estilo de nombres

- Español, no inglés. "Fase 1: Descubrimiento", no "Phase 1: Discovery".
- Concretos al dominio del cliente. "Integración con Stripe + cobro automático", no "Pagos".
- Evitar terminología scrum/agile genérica. NO usar: "sprint", "backlog refinement", "retrospectiva", "epic".

## Estilo de tareas

- Cada tarea es un entregable verificable, no una actividad continua.
- Bien: "Endpoint /api/cotizar funcionando con tests unitarios". Mal: "Trabajar en backend".
- Las tareas que son milestones (isMilestone: true) corresponden a momentos donde el cliente DEMUESTRA el avance — demos, entregas parciales, Go-Live.

## Anti-patrones a evitar

- ❌ Fases tipo "Investigación" o "Research" sin entregable claro.
- ❌ Tareas tipo "Configurar entorno" como tarea principal — eso es subtask del kickoff de la primera fase.
- ❌ Mezclar QA con desarrollo en la misma fase. QA siempre es su propia fase corta al final.
- ❌ Ignorar el componente de IA/automatización — todo proyecto IM3 incluye al menos UNA fase con IA aplicada (LLM, RAG, OCR, clasificación, etc.) cuando el alcance lo permite.

## Lo que IM3 SÍ hace siempre

- Conecta a sistemas existentes del cliente (Gmail, Drive, WhatsApp, Stripe, GoHighLevel, Sheets, etc.). Casi nunca empieza de cero.
- Stack técnico habitual: Claude / OpenAI para LLM; Stripe para pagos; Resend para emails; Postgres + Drizzle para datos; React + Tailwind + shadcn para UI; Express + TypeScript para backend; Railway para deploy.
- Capacita al equipo del cliente al final con sesión en vivo + documentación.
`.trim();
