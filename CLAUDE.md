# IM3 Systems — CRM + Website

## Descripción
Plataforma completa de IM3 Systems (consultoría de IA / automatización en Latinoamérica). Integra el sitio público (captura de leads vía formulario de diagnóstico), un CRM admin interno, un portal para clientes con proyectos, generación de propuestas comerciales asistida por IA, y un sistema de agentes automatizados (email nurturing, WhatsApp, sync Gmail/Drive/Calendar, análisis de proyectos GitHub).

Dominio público: `im3systems.com`
Dominio CRM admin: `hub.im3systems.com`

## Stack Técnico
- **Frontend:** React + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query + Wouter (router)
- **Backend:** Node.js + Express 5 + TypeScript (tsx en dev)
- **Base de datos:** PostgreSQL en **Railway** (`maglev.proxy.rlwy.net`) + Drizzle ORM
- **Migraciones:** SQL crudo en `server/db.ts` (bloque `runMigrations()` con `CREATE TABLE IF NOT EXISTS`) + carpeta `migrations/` con `.sql` numerados
- **Auth admin:** Passport.js + passport-local + sesiones en Postgres (`connect-pg-simple`)
- **IA:** Anthropic Claude (`@anthropic-ai/sdk`) — modelos `claude-sonnet-4-20250514` (generación) y `claude-haiku-4-5-20251001` (clasificación rápida)
- **Email:** Resend
- **WhatsApp:** Meta WhatsApp Business Cloud API
- **Google Workspace:** Service Account con domain-wide delegation, impersona `info@im3systems.com`
  - Gmail (read-only sync del inbox)
  - Drive (carpetas por cliente, upload/read de docs)
  - Calendar (eventos de diagnóstico con Meet links)
- **GitHub:** OAuth para conectar repos de clientes + webhooks para push events
- **Cron:** `node-cron` con timezone `America/Bogota`
- **Deploy:** ⚠️ Confirmar con el equipo antes de deployar (CRM admin en `hub.im3systems.com`, sitio público en `im3systems.com`). No es Replit.

## Rutas Principales

### Público (sin login)
- `/` — landing IM3 Systems
- `/booking` — formulario de diagnóstico (flujo progresivo: Fase 1 obligatoria + Fase 2 opcional post-booking)
- `/confirmed` — confirmación post-diagnóstico
- `/reschedule/:contactId`, `/cancel/:contactId` — reagendar/cancelar reunión
- `/blog`, `/blog/:slug` — blog
- `/proposal/:token` — vista de propuesta comercial (acceso por token UUID v4, no login)
- `/portal/:token` — portal del cliente para ver progreso de su proyecto

### Admin (requiere login, `/admin/login`)
- `/admin` — dashboard con métricas
- `/admin/contacts` y `/admin/contacts/:id` — CRM de contactos
- `/admin/pipeline` — kanban de deals
- `/admin/projects` y `/admin/projects/:id` — gestión de proyectos de cliente
- `/admin/auditorias` — módulo de auditorías
- `/admin/proposals` — generador de propuestas con IA
- `/admin/blog` — editor de blog con IA
- `/admin/calendar` — calendario de reuniones
- `/admin/tasks` — tareas internas
- `/admin/templates` — plantillas de email
- `/admin/agents` — dashboard de agentes/servicios (Fase 1 del sistema de agentes; ver roadmap)

## Sistema de Agentes Automatizados
El proyecto tiene ~27 agentes/servicios corriendo (cron jobs, webhooks, servicios de IA on-demand). Todos se registran en `server/agents/registry.ts` y se envuelven con `runAgent(name, fn)` de `server/agents/runner.ts` para persistir cada ejecución en la tabla `agent_runs`. El dashboard `/admin/agents` los visualiza por dominio (communication, ai, sync, projects, content, analysis) con estado de salud.

**Roadmap vivo**: `/Users/mateoobandoangel/.claude/plans/quiet-rolling-octopus.md` — detalla Fase 1 (visibilidad, ✅), Fase 2 (error-supervisor + meeting-prep + followup-writer, ✅), y fases futuras.

## Estructura de Carpetas
```
client/src/
  components/
    diagnostic-form/     → formulario progresivo (Fase 1 booking + Fase 2 post-booking)
    ui/                  → shadcn components
  pages/
    admin/               → todas las páginas admin (contacts, projects, agents, etc.)
    home.tsx, booking.tsx, portal.tsx, proposal.tsx, blog.tsx, ...
  lib/
    queryClient.ts       → cliente fetch centralizado
    hooks/useAuth.ts     → auth admin
    i18n.ts              → es/en

server/
  index.ts               → entry point Express
  routes.ts              → >7000 líneas, todos los endpoints (aún no modularizado en routes/)
  db.ts                  → Drizzle setup + runMigrations() con SQL crudo
  auth.ts                → Passport setup + requireAuth middleware
  email-scheduler.ts     → cron jobs (process queue, whatsapp, gmail sync, newsletter, etc.)
  email-ai.ts            → generación de contenido con Claude (emails, insights)
  email-sender.ts        → envío vía Resend
  proposal-ai.ts         → generación de propuestas
  project-ai.ts          → análisis de commits GitHub → resúmenes cliente
  blog-ai.ts             → generación de blog
  google-gmail.ts, google-drive.ts, google-calendar.ts → integraciones
  whatsapp.ts            → Meta Cloud API
  lead-scoring.ts        → algoritmo puro (no IA)
  agents/
    runner.ts            → wrapper runAgent() con logging persistente
    registry.ts          → catálogo de todos los agentes
    error-supervisor.ts  → analiza errores con Claude, reintenta, alerta
    meeting-prep.ts      → brief AI 2-3h antes de cada reunión
    followup-writer.ts   → draft de follow-up post-reunión

shared/
  schema.ts              → Drizzle schema (contacts, diagnostics, sent_emails, appointments, projects, proposals, agent_runs, etc.)
  industrias.ts          → catálogo de industrias para el form progresivo
  proposal-template/     → assets de propuestas

migrations/              → .sql numerados (complemento a runMigrations())
```

## Convenciones de Código
- **TypeScript estricto** — nunca usar `any`
- **Mobile-first** — cada pantalla debe funcionar en 390px
- Mutations con TanStack Query `useMutation` + `invalidateQueries`
- Nunca `fetch` directo en componentes — siempre `useQuery` / `useMutation` vía `apiRequest` o `queryFn`
- Errores de API: `res.status(4xx).json({ message: "..." })` o `{ error: "..." }`
- Idiomas soportados: `es` (default) y `en` (campo `idioma` en `contacts`)
- Rutas admin **siempre** con `requireAuth` middleware
- Rutas públicas sin auth usan tokens UUID v4 no predecibles (`access_token` en `proposals`, `client_projects`)
- Timezone para cron: `America/Bogota`
- Cambios de schema: actualizar `shared/schema.ts` + añadir `ALTER TABLE ... IF NOT EXISTS` en `runMigrations()` de `server/db.ts` (idempotente con `.catch(() => {})`)

## Reglas de Negocio Importantes
- El diagnóstico usa **commit progresivo**: Fase 1 obligatoria al agendar (empresa, email, industria, área prioridad, presupuesto, cita), Fase 2 opcional post-booking (objetivos, productos, volumen, herramientas, etc.) completable vía PATCH
- Un contacto se identifica por **email** (único). Si ya existe, se actualiza (returning contact). Si no, se crea.
- Cuando un suscriptor de newsletter completa un diagnóstico, se dispara una alerta especial al admin ("Conversión Newsletter → Auditoría") por ser un lead ya caliente
- Los emails del sistema de nurturing se **pre-generan** al momento del intake (subject + body con Claude) y se guardan en `sent_emails` con status=pending. El cron `email-queue` los envía en la hora programada.
- El email `confirmacion` se envía **inmediatamente** (no espera al cron)
- WhatsApp messages usan condicionales: `if_email_not_opened` — no se mandan si el email correspondiente ya fue abierto
- Los tokens de propuesta/portal expiran (propuesta: `expiresAt`; portal: sin expiración pero revocable)
- Todo contacto creado desde diagnóstico tiene auto-creado: deal en stage `qualification`, 2 tasks (revisar pre-cita + follow-up post-cita), notification `new_lead`
- Gmail sync corre cada 15 min (lookback 90 días, batch de 50, delays de 1s para respetar rate limits)
- Meet link + Calendar event se crean **antes** de programar emails (await obligatorio) para que los emails puedan incluir el link correcto
- `agent_runs` es la fuente de verdad para observabilidad de fallas — todos los agentes se envuelven con `runAgent()`

## Lo que NO hacer
- **No** usar Redux (usar TanStack Query)
- **No** hacer `fetch` directo en componentes
- **No** crear archivos `README.md` ni documentación adicional
- **No** instalar librerías nuevas sin preguntar
- **No** hacer `git push` ni deploy sin autorización explícita del usuario
- **No** romper mobile-first (390px)
- **No** usar `any` en TypeScript
- **No** tocar/borrar datos en DB de producción (Railway) sin autorización. Queries read-only están OK; escrituras requieren confirmación.
- **No** añadir cron jobs sin envolver con `runAgent()` (pierde observabilidad)
- **No** añadir agentes nuevos sin registrarlos en `server/agents/registry.ts`
- **No** tocar `/Users/mateoobandoangel/CLAUDE.md` — ese describe el proyecto "Acta" (otro producto del usuario), no este

## Variables de Entorno Necesarias
```
# Core
DATABASE_URL=postgres://...          # Railway
SESSION_SECRET=...
ADMIN_EMAIL=info@im3systems.com      # destinatario de briefings/alertas
ADMIN_USERNAME, ADMIN_PASSWORD        # credenciales del admin seed
BASE_URL=https://im3systems.com       # para links en emails

# IA
ANTHROPIC_API_KEY=sk-ant-...

# Email
RESEND_API_KEY=re_...

# Google Workspace (service account con domain-wide delegation)
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY=...                # con \n literales
GOOGLE_DRIVE_IMPERSONATE=info@im3systems.com
GOOGLE_DRIVE_FOLDER_ID=...            # carpeta raíz de clientes

# WhatsApp (Meta Cloud API)
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...

# GitHub OAuth (para conectar repos de clientes)
GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_WEBHOOK_SECRET

# Stripe (opcional, aún no activo)
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM
```

## Contexto Adicional
- **Calendar/Meet (2026-05-04)**: el bug histórico de `createCalendarEvent` parece resuelto — el último diagnóstico (Abril 14) sí generó Meet link y Calendar event correctamente. Validar con un diagnóstico de prueba si surge duda.
- **GHL/GoHighLevel removido (2026-05-04)**: ya no usamos GHL. Cualquier referencia residual en migraciones históricas (`migrations/meta/*`) o columna `diagnostics.sent_to_ghl` es legacy inerte. No reintroducir.
- **Dev local en macOS**: `npm run dev` falla con `ENOTSUP` por `reusePort: true` en `server/index.ts:131`. Workaround: setear `PORT=3000` + eliminar `reusePort` temporalmente, o correr con Docker.
- **El dashboard `/admin/agents` es la fuente de verdad operativa**: después de deployar Fase 1 del sistema de agentes, cualquier falla de cualquier agente queda visible ahí con `errorMessage` + `errorStack`.
- **Otro producto del usuario**: Acta (`acta.im3systems.com`) — app separada de grabación de reuniones. No confundir con este proyecto.

## Cómo trabajamos juntos

Reglas aprendidas en sesiones largas. Aplicar siempre, sin que el usuario las repita.

### Para el usuario (recordatorios cuando arranquemos algo)
1. **Definition of Done en una frase**: antes de pedir cambios, escribir "esto estará bien cuando suceda X, Y, Z". Si no se puede en 30 segundos, todavía no está claro qué se quiere — y Claude va a adivinar mal. La mayoría de rondas perdidas vienen de un DoD ambiguo.
2. **Plan completo antes de codear** (para tareas > 1 archivo o > 30 min): pedir a Claude que entre a `/plan`. Investigar + proponer + aprobar + arrancar. Es barato comparado con codear lo equivocado.
3. **Diagnóstico antes que fix**: cuando algo no funciona, pedir "diagnostica la causa raíz, NO toques código hasta que me digas el por qué exacto". Evita el patrón fix-fix-fix.
4. **Si llevamos 3+ rondas en el mismo problema, parar**: no es falta de esfuerzo, es que no estamos en la raíz. Pedir "stop, replantea desde cero, ¿qué supusimos mal?".
5. **Pedir nivel de confianza**: cuando Claude promete que algo está arreglado, pedir "del 1 al 10, ¿qué tan seguro estás? ¿Qué podría fallar?". Reduce humo y obliga a ser honesto.

### Para Claude (yo, sin que me lo pidan)
- Cuando una tarea sea > 1 archivo o > 30 min, sugerir entrar a `/plan` antes de codear.
- Al terminar un fix, dar % de confianza honesto + lista de qué podría fallar.
- Si detecto patrón fix-fix-fix (3+ iteraciones en el mismo problema), pedir replantear de raíz.
- Decir "no sé" o "no estoy seguro" cuando aplique, en vez de adivinar con confianza falsa.
- Cuando el usuario pida un cambio de UX/diseño grande, pedir un brief completo (no iterar en pedacitos).
