import { Pool } from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import * as schema from "@shared/schema";

const scryptAsync = promisify(scrypt);

let db: NodePgDatabase<typeof schema> | null = null;
let pool: Pool | null = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  db = drizzle(pool, { schema });
  console.log("✓ Database connected");
} else {
  console.error("✗ CRITICAL: DATABASE_URL not set — CRM, newsletter, and email features will NOT work");
}

export async function runMigrations() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "blog_categories" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "slug" text NOT NULL,
        "description" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "blog_categories_slug_unique" UNIQUE("slug")
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "blog_posts" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "title" text NOT NULL,
        "slug" text NOT NULL,
        "excerpt" text NOT NULL,
        "content" text NOT NULL,
        "category_id" varchar,
        "tags" json DEFAULT '[]'::json,
        "featured_image_url" text,
        "author_name" text DEFAULT 'Equipo IM3' NOT NULL,
        "status" text DEFAULT 'draft' NOT NULL,
        "language" text DEFAULT 'es' NOT NULL,
        "meta_title" text,
        "meta_description" text,
        "read_time_minutes" integer DEFAULT 5,
        "published_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "newsletter_sends" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "subject" text NOT NULL,
        "content" text NOT NULL,
        "blog_post_id" varchar,
        "sent_at" timestamp DEFAULT now() NOT NULL,
        "recipient_count" integer DEFAULT 0,
        "status" text DEFAULT 'sent' NOT NULL
      );
    `);
    // Add references column to blog_posts
    await pool.query(`
      ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "references" json DEFAULT '[]'::json;
    `).catch(() => {});

    // Make diagnostic_id nullable (was NOT NULL in original migration,
    // but newsletter contacts don't have a diagnostic)
    await pool.query(`
      ALTER TABLE "contacts" ALTER COLUMN "diagnostic_id" DROP NOT NULL;
    `).catch(() => {}); // Ignore if already nullable

    // Add indexes on frequently queried FK columns
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_sent_emails_contact_id" ON "sent_emails" ("contact_id");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_sent_emails_status" ON "sent_emails" ("status");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_sent_emails_scheduled_for" ON "sent_emails" ("scheduled_for");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_contacts_diagnostic_id" ON "contacts" ("diagnostic_id");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_contacts_status" ON "contacts" ("status");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_activity_log_contact_id" ON "activity_log" ("contact_id");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_notifications_contact_id" ON "notifications" ("contact_id");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_deals_contact_id" ON "deals" ("contact_id");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_contact_notes_contact_id" ON "contact_notes" ("contact_id");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_tasks_contact_id" ON "tasks" ("contact_id");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_tasks_status_due" ON "tasks" ("status", "due_date");`).catch(() => {});

    // Meeting status columns for appointments and diagnostics
    await pool.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'scheduled';`).catch(() => {});
    await pool.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;`).catch(() => {});
    await pool.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "recording_url" text;`).catch(() => {});
    await pool.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "transcript_url" text;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ADD COLUMN IF NOT EXISTS "meeting_status" text DEFAULT 'scheduled';`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ADD COLUMN IF NOT EXISTS "meeting_completed_at" timestamp;`).catch(() => {});

    // WhatsApp messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "contact_id" varchar NOT NULL,
        "phone" text NOT NULL,
        "message" text NOT NULL,
        "template_name" text,
        "template_params" json,
        "media_url" text,
        "media_type" text,
        "status" text DEFAULT 'pending' NOT NULL,
        "scheduled_for" timestamp NOT NULL,
        "sent_at" timestamp,
        "delivered_at" timestamp,
        "read_at" timestamp,
        "whatsapp_message_id" text,
        "error_message" text,
        "retry_count" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_whatsapp_messages_contact_id" ON "whatsapp_messages" ("contact_id");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_whatsapp_messages_status" ON "whatsapp_messages" ("status");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_whatsapp_messages_scheduled_for" ON "whatsapp_messages" ("scheduled_for");`).catch(() => {});

    // WhatsApp condition columns (added later)
    await pool.query(`ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "condition_type" text;`).catch(() => {});
    await pool.query(`ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "condition_email_template" text;`).catch(() => {});

    // Appointments extra columns
    await pool.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "appointment_type" text DEFAULT 'manual';`).catch(() => {});
    await pool.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "parent_appointment_id" varchar;`).catch(() => {});

    // Contacts extra columns
    await pool.query(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "idioma" varchar(5) DEFAULT 'es';`).catch(() => {});
    await pool.query(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp;`).catch(() => {});
    await pool.query(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "apellido" text;`).catch(() => {});

    // Diagnostics extra columns
    await pool.query(`ALTER TABLE "diagnostics" ADD COLUMN IF NOT EXISTS "google_calendar_event_id" text;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ADD COLUMN IF NOT EXISTS "form_duration_minutes" integer;`).catch(() => {});

    // Sent emails extra columns
    await pool.query(`ALTER TABLE "sent_emails" ADD COLUMN IF NOT EXISTS "opened_at" timestamp;`).catch(() => {});
    // Allow contactId to be null for admin notifications not tied to a specific contact
    await pool.query(`ALTER TABLE "sent_emails" ALTER COLUMN "contact_id" DROP NOT NULL;`).catch(() => {});

    // Project type — distingue proyectos de cliente (scope fijo) vs internos (evolutivos)
    await pool.query(`ALTER TABLE "client_projects" ADD COLUMN IF NOT EXISTS "project_type" text DEFAULT 'client' NOT NULL;`).catch(() => {});

    // Origen del proyecto — para auditar bulk imports vs creaciones manuales/desde propuesta
    await pool.query(`ALTER TABLE "client_projects" ADD COLUMN IF NOT EXISTS "created_from" text DEFAULT 'manual' NOT NULL;`).catch(() => {});

    // Project feedback — bugs/cambios/sugerencias del cliente con attachments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "project_feedback" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "type" text NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL,
        "priority" text NOT NULL DEFAULT 'normal',
        "status" text NOT NULL DEFAULT 'open',
        "attachment_urls" json DEFAULT '[]'::json,
        "created_by" text,
        "reporter_name" text,
        "admin_response" text,
        "resolved_task_id" varchar,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "resolved_at" timestamp
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_project_feedback_project_status" ON "project_feedback" ("project_id", "status");`).catch(() => {});

    // Vincular appointments a proyectos del portal (reuniones de proyecto)
    await pool.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "client_project_id" varchar;`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_appointments_client_project" ON "appointments" ("client_project_id");`).catch(() => {});

    // Client projects tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "client_projects" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "contact_id" varchar,
        "name" text NOT NULL,
        "description" text,
        "status" text DEFAULT 'planning' NOT NULL,
        "start_date" timestamp,
        "estimated_end_date" timestamp,
        "actual_end_date" timestamp,
        "total_budget" integer,
        "currency" varchar(3) DEFAULT 'USD',
        "access_token" varchar DEFAULT gen_random_uuid() NOT NULL,
        "health_status" text DEFAULT 'on_track',
        "health_note" text,
        "github_repo_url" text,
        "github_webhook_secret" text,
        "ai_tracking_enabled" boolean DEFAULT false NOT NULL,
        "last_weekly_summary_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "client_projects_access_token_unique" UNIQUE("access_token")
      );
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "project_phases" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "order_index" integer DEFAULT 0 NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "start_date" timestamp,
        "end_date" timestamp,
        "estimated_hours" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "project_tasks" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "phase_id" varchar NOT NULL,
        "project_id" varchar NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "client_facing_title" text,
        "client_facing_description" text,
        "status" text DEFAULT 'pending' NOT NULL,
        "priority" text DEFAULT 'medium' NOT NULL,
        "estimated_hours" integer,
        "actual_hours" numeric(6, 2),
        "completed_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "project_deliverables" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "phase_id" varchar,
        "task_id" varchar,
        "title" text NOT NULL,
        "description" text,
        "type" text DEFAULT 'feature' NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "delivered_at" timestamp,
        "approved_at" timestamp,
        "client_comment" text,
        "screenshot_url" text,
        "demo_url" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "project_time_log" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "task_id" varchar,
        "description" text NOT NULL,
        "hours" numeric(6, 2) NOT NULL,
        "date" text NOT NULL,
        "category" text DEFAULT 'development' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "project_messages" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "sender_type" text NOT NULL,
        "sender_name" text NOT NULL,
        "content" text NOT NULL,
        "is_read" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "project_activity_entries" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "task_id" varchar,
        "phase_id" varchar,
        "source" text DEFAULT 'manual' NOT NULL,
        "commit_shas" json DEFAULT '[]'::json,
        "summary_level1" text NOT NULL,
        "summary_level2" text,
        "summary_level3" text,
        "category" text DEFAULT 'feature' NOT NULL,
        "ai_generated" boolean DEFAULT false NOT NULL,
        "is_significant" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "github_webhook_events" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "payload" json NOT NULL,
        "processed" boolean DEFAULT false NOT NULL,
        "activity_entry_id" varchar,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});

    // AI insights cache
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "ai_insights_cache" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "contact_id" varchar NOT NULL,
        "insights" json NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});

    // Project tasks: dates + milestones
    await pool.query(`ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "start_date" timestamp;`).catch(() => {});
    await pool.query(`ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "due_date" timestamp;`).catch(() => {});
    await pool.query(`ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "is_milestone" boolean DEFAULT false NOT NULL;`).catch(() => {});

    // Project tasks: assignee (free-text) + manual order index for drag-to-reorder
    await pool.query(`ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "assignee_name" text;`).catch(() => {});
    await pool.query(`ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "order_index" integer DEFAULT 0 NOT NULL;`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_project_tasks_phase_order" ON "project_tasks" ("phase_id", "order_index");`).catch(() => {});

    // Soft delete: phases and tasks marked deletedAt instead of removed, recoverable for ~undo flow
    await pool.query(`ALTER TABLE "project_phases" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;`).catch(() => {});
    await pool.query(`ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_project_phases_deleted_at" ON "project_phases" ("deleted_at");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_project_tasks_deleted_at" ON "project_tasks" ("deleted_at");`).catch(() => {});

    // Bonus phases (surprise gifts): hidden from client portal until revealedAt is set
    await pool.query(`ALTER TABLE "project_phases" ADD COLUMN IF NOT EXISTS "is_bonus" boolean DEFAULT false NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "project_phases" ADD COLUMN IF NOT EXISTS "bonus_label" text;`).catch(() => {});
    await pool.query(`ALTER TABLE "project_phases" ADD COLUMN IF NOT EXISTS "revealed_at" timestamp;`).catch(() => {});

    // Multi-repo GitHub support: one project can have N github repos connected.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "project_github_repos" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "repo_full_name" text NOT NULL,
        "repo_url" text NOT NULL,
        "webhook_secret" text NOT NULL,
        "webhook_id" integer,
        "label" text,
        "is_active" boolean DEFAULT true NOT NULL,
        "disconnected_at" timestamp,
        "created_at" timestamp DEFAULT NOW() NOT NULL,
        "updated_at" timestamp DEFAULT NOW() NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_project_github_repos_project" ON "project_github_repos" ("project_id");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_project_github_repos_active" ON "project_github_repos" ("project_id", "is_active");`).catch(() => {});
    await pool.query(`ALTER TABLE "github_webhook_events" ADD COLUMN IF NOT EXISTS "repo_id" varchar;`).catch(() => {});
    await pool.query(`ALTER TABLE "project_activity_entries" ADD COLUMN IF NOT EXISTS "repo_id" varchar;`).catch(() => {});
    await pool.query(`ALTER TABLE "project_activity_entries" ADD COLUMN IF NOT EXISTS "repo_full_name" text;`).catch(() => {});

    // Data migration: copy legacy single-repo columns into the new table.
    // Idempotent — only inserts if no equivalent row exists yet. Webhook secret
    // is preserved when present (so the legacy webhook URL in GitHub still works
    // via the shim endpoint); generated only if the legacy row had it null.
    await pool.query(`
      INSERT INTO "project_github_repos" ("project_id", "repo_full_name", "repo_url", "webhook_secret", "label")
      SELECT
        cp."id",
        REGEXP_REPLACE(cp."github_repo_url", '^https?://github\\.com/', ''),
        cp."github_repo_url",
        COALESCE(cp."github_webhook_secret", encode(gen_random_bytes(32), 'hex')),
        'Legacy (auto-migrado)'
      FROM "client_projects" cp
      WHERE cp."github_repo_url" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "project_github_repos" pgr
          WHERE pgr."project_id" = cp."id" AND pgr."repo_url" = cp."github_repo_url"
        );
    `).catch((err) => console.error(`legacy github repo migration: ${err?.message}`));

    // Project deliverables: client rating
    await pool.query(`ALTER TABLE "project_deliverables" ADD COLUMN IF NOT EXISTS "client_rating" integer;`).catch(() => {});
    // Soft delete on deliverables — cascades from phase delete so undo restores them
    await pool.query(`ALTER TABLE "project_deliverables" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_project_deliverables_deleted_at" ON "project_deliverables" ("deleted_at");`).catch(() => {});
    // One-time cleanup: legacy zombie deliverables whose parent phase was already
    // soft-deleted before this column existed. Idempotent — only touches rows
    // where deleted_at is still null AND the parent phase is gone.
    await pool.query(`
      UPDATE "project_deliverables" SET "deleted_at" = NOW()
      WHERE "deleted_at" IS NULL
        AND "phase_id" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "project_phases"
          WHERE "project_phases"."id" = "project_deliverables"."phase_id"
            AND "project_phases"."deleted_at" IS NOT NULL
        );
    `).catch(() => {});

    // Proposals
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "proposals" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "contact_id" varchar NOT NULL,
        "title" text NOT NULL,
        "status" text DEFAULT 'draft' NOT NULL,
        "sections" json DEFAULT '{}'::json,
        "pricing" json,
        "timeline_data" json,
        "notes" text,
        "access_token" varchar DEFAULT gen_random_uuid() NOT NULL,
        "sent_at" timestamp,
        "viewed_at" timestamp,
        "accepted_at" timestamp,
        "accepted_by" text,
        "accepted_option" text,
        "acceptance_details" json,
        "expires_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "proposals_access_token_unique" UNIQUE("access_token")
      );
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "proposal_views" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "proposal_id" varchar NOT NULL,
        "section" text,
        "time_spent" integer,
        "device" text,
        "ip" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});

    // Agent runs (logs de ejecución de cron jobs, servicios IA, webhooks)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "agent_runs" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "agent_name" text NOT NULL,
        "status" text NOT NULL,
        "started_at" timestamp DEFAULT now() NOT NULL,
        "completed_at" timestamp,
        "duration_ms" integer,
        "records_processed" integer DEFAULT 0,
        "error_message" text,
        "error_stack" text,
        "metadata" json,
        "triggered_by" text DEFAULT 'cron' NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runs_name_started" ON "agent_runs" ("agent_name", "started_at" DESC);`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runs_status" ON "agent_runs" ("status");`).catch(() => {});

    // Fase 2 — columnas para agentes IA (error-supervisor, meeting-prep, followup-writer)
    await pool.query(`ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "supervisor_analyzed_at" timestamp;`).catch(() => {});
    await pool.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "prep_sent_at" timestamp;`).catch(() => {});
    await pool.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "followup_drafted_at" timestamp;`).catch(() => {});

    // Migración 0007 — diagnostic form de 2 fases (Fase 1 obligatoria + Fase 2 opcional)
    // Añade columnas nuevas y hace nullable los campos legacy que ahora son opcionales.
    await pool.query(`ALTER TABLE "diagnostics" ADD COLUMN IF NOT EXISTS "industria_otro" text;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ADD COLUMN IF NOT EXISTS "phase2_completed_at" timestamp;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "anos_operacion" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "ciudades" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "objetivos" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "resultado_esperado" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "productos" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "volumen_mensual" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "cliente_principal" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "canales_adquisicion" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "canal_principal" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "herramientas" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "conectadas" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "nivel_tech" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "usa_ia" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "comodidad_tech" DROP NOT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ALTER COLUMN "familiaridad" DROP NOT NULL;`).catch(() => {});

    // Contact Drive folder cache
    await pool.query(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "drive_folder_id" text;`).catch(() => {});

    // Gmail email classifier — match tracking + manual override
    await pool.query(`ALTER TABLE "gmail_emails" ADD COLUMN IF NOT EXISTS "match_method" text;`).catch(() => {});
    await pool.query(`ALTER TABLE "gmail_emails" ADD COLUMN IF NOT EXISTS "manually_unlinked" boolean DEFAULT false NOT NULL;`).catch(() => {});

    // Proposals: soft-delete (papelera con retención de 30 días)
    await pool.query(`ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_proposals_deleted_at" ON "proposals" ("deleted_at");`).catch(() => {});

    // Chat global memory — hechos cross-proposal/cross-client del chat
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "chat_global_memory" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "category" text NOT NULL,
        "fact" text NOT NULL,
        "confidence" integer DEFAULT 50 NOT NULL,
        "source_proposal_ids" json DEFAULT '[]'::json,
        "reinforced_count" integer DEFAULT 1 NOT NULL,
        "last_seen_at" timestamp DEFAULT now() NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_chat_memory_category" ON "chat_global_memory" ("category", "confidence" DESC);`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_chat_memory_last_seen" ON "chat_global_memory" ("last_seen_at" DESC);`).catch(() => {});

    // Org preferences — memoria entre propuestas (Sprint 6.1)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "org_preferences" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "key" text NOT NULL,
        "value" text NOT NULL,
        "source" text NOT NULL,
        "confidence" integer DEFAULT 50 NOT NULL,
        "derived_from_proposal_ids" json DEFAULT '[]'::json,
        "notes" text,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_org_preferences_key" ON "org_preferences" ("key");`).catch(() => {});

    // Snapshots de propuesta para undo del chat
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "proposal_snapshots" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "proposal_id" varchar NOT NULL,
        "sections" json NOT NULL,
        "triggered_by_message_id" varchar,
        "change_summary" text,
        "section_key" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_proposal_snapshots_proposal" ON "proposal_snapshots" ("proposal_id", "created_at" DESC);`).catch(() => {});

    // Proposal chat messages — Fase 1 del asistente conversacional
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "proposal_chat_messages" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "proposal_id" varchar NOT NULL,
        "role" text NOT NULL,
        "content" text NOT NULL,
        "tool_calls" json,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_proposal_chat_proposal_id" ON "proposal_chat_messages" ("proposal_id", "created_at");`).catch(() => {});
    await pool.query(`ALTER TABLE "proposal_chat_messages" ADD COLUMN IF NOT EXISTS "attachments" json;`).catch(() => {});

    // Portal de Clientes — Auth (login + reset + invite)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "client_users" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "email" text NOT NULL UNIQUE,
        "password_hash" text,
        "name" text,
        "status" text NOT NULL DEFAULT 'invited',
        "invited_at" timestamp DEFAULT now() NOT NULL,
        "accepted_at" timestamp,
        "last_login_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "client_user_projects" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "client_user_id" varchar NOT NULL,
        "client_project_id" varchar NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        UNIQUE ("client_user_id", "client_project_id")
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_cup_client_user" ON "client_user_projects" ("client_user_id");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_cup_project" ON "client_user_projects" ("client_project_id");`).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "client_invites" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "email" text NOT NULL,
        "token" varchar NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        "client_project_id" varchar,
        "invited_by_user_id" varchar,
        "expires_at" timestamp NOT NULL,
        "used_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_client_invites_token" ON "client_invites" ("token");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_client_invites_email" ON "client_invites" ("email");`).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "client_password_resets" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "client_user_id" varchar NOT NULL,
        "token" varchar NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        "expires_at" timestamp NOT NULL,
        "used_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_client_pwd_resets_token" ON "client_password_resets" ("token");`).catch(() => {});

    // Magic-link tokens (passwordless access from notifications / "envíame un link")
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "client_magic_tokens" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "client_user_id" varchar NOT NULL,
        "client_project_id" varchar,
        "token" varchar NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        "expires_at" timestamp NOT NULL,
        "used_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_client_magic_tokens_token" ON "client_magic_tokens" ("token");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_client_magic_tokens_user" ON "client_magic_tokens" ("client_user_id");`).catch(() => {});

    // Portal Analytics — GA4 connections + daily metrics
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "client_analytics_connections" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "client_project_id" varchar NOT NULL UNIQUE,
        "ga4_property_id" varchar NOT NULL,
        "property_timezone" varchar(64),
        "status" text NOT NULL DEFAULT 'pending',
        "last_synced_at" timestamp,
        "last_error" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "client_analytics_daily" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "client_project_id" varchar NOT NULL,
        "date" text NOT NULL,
        "sessions" integer NOT NULL DEFAULT 0,
        "users" integer NOT NULL DEFAULT 0,
        "new_users" integer NOT NULL DEFAULT 0,
        "pageviews" integer NOT NULL DEFAULT 0,
        "avg_session_duration" numeric(10, 2) NOT NULL DEFAULT '0',
        "bounce_rate" numeric(5, 4) NOT NULL DEFAULT '0',
        "top_pages" json DEFAULT '[]'::json,
        "top_sources" json DEFAULT '[]'::json,
        "top_countries" json DEFAULT '[]'::json,
        "created_at" timestamp DEFAULT now() NOT NULL,
        UNIQUE ("client_project_id", "date")
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_analytics_daily_project_date" ON "client_analytics_daily" ("client_project_id", "date" DESC);`).catch(() => {});

    // Proposal Briefs — material de soporte detallado post-reunión (1:1 con proposals)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "proposal_briefs" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "proposal_id" varchar NOT NULL,
        "contact_id" varchar NOT NULL,
        "title" text,
        "sections" json DEFAULT '{}'::json,
        "status" text DEFAULT 'not_generated' NOT NULL,
        "access_token" varchar DEFAULT gen_random_uuid() NOT NULL,
        "ai_sources_report" json,
        "notes" text,
        "outdated_since_proposal_update" timestamp,
        "generated_at" timestamp,
        "sent_at" timestamp,
        "viewed_at" timestamp,
        "expires_at" timestamp,
        "deleted_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "proposal_briefs_proposal_id_unique" UNIQUE("proposal_id"),
        CONSTRAINT "proposal_briefs_access_token_unique" UNIQUE("access_token")
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_proposal_briefs_contact_id" ON "proposal_briefs" ("contact_id");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_proposal_briefs_deleted_at" ON "proposal_briefs" ("deleted_at");`).catch(() => {});

    // Snapshots del brief para undo del chat
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "proposal_brief_snapshots" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "brief_id" varchar NOT NULL,
        "sections" json NOT NULL,
        "triggered_by_message_id" varchar,
        "change_summary" text,
        "module_key" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_proposal_brief_snapshots_brief" ON "proposal_brief_snapshots" ("brief_id", "created_at" DESC);`).catch(() => {});

    // Chat IA del brief — historial separado del chat de proposals
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "proposal_brief_chat_messages" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "brief_id" varchar NOT NULL,
        "role" text NOT NULL,
        "content" text NOT NULL,
        "tool_calls" json,
        "attachments" json,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_proposal_brief_chat_brief_id" ON "proposal_brief_chat_messages" ("brief_id", "created_at");`).catch(() => {});

    // Analytics de visualización del brief público
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "proposal_brief_views" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "brief_id" varchar NOT NULL,
        "module" text,
        "time_spent" integer,
        "device" text,
        "ip" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_proposal_brief_views_brief" ON "proposal_brief_views" ("brief_id", "created_at" DESC);`).catch(() => {});

    // Stack Services — catálogo del stack tecnológico cobrable
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "stack_services" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "vendor" text,
        "category" text NOT NULL,
        "description" text,
        "url" text,
        "billing_model" text NOT NULL,
        "base_fee_usd" numeric(10, 4) DEFAULT '0',
        "markup_percent" numeric(5, 2) DEFAULT '0',
        "pricing_units" json DEFAULT '[]'::json,
        "internal_notes" text,
        "last_price_update" timestamp,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_stack_services_category" ON "stack_services" ("category");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_stack_services_active" ON "stack_services" ("is_active");`).catch(() => {});

    // Contract Templates — plantillas Markdown con variables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "contract_templates" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "body_markdown" text NOT NULL,
        "expected_variables" json DEFAULT '[]'::json,
        "is_default" boolean DEFAULT false NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `).catch(() => {});

    // Contracts — documentos generados (1:1 con propuestas aceptadas)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "contracts" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "proposal_id" varchar NOT NULL,
        "contact_id" varchar NOT NULL,
        "template_id" varchar NOT NULL,
        "title" text NOT NULL,
        "body_markdown" text NOT NULL,
        "resolved_variables" json,
        "status" text DEFAULT 'draft' NOT NULL,
        "locked_at" timestamp,
        "signed_at" timestamp,
        "signed_by" text,
        "signed_notes" text,
        "access_token" varchar DEFAULT gen_random_uuid() NOT NULL,
        "notes" text,
        "deleted_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "contracts_proposal_id_unique" UNIQUE("proposal_id"),
        CONSTRAINT "contracts_access_token_unique" UNIQUE("access_token")
      );
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_contracts_contact_id" ON "contracts" ("contact_id");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_contracts_status" ON "contracts" ("status");`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_contracts_deleted_at" ON "contracts" ("deleted_at");`).catch(() => {});

    // Seed inicial del catálogo de stack — 10 servicios reales que IM3 usa hoy
    // Solo inserta si la tabla está vacía (idempotente). Tras seed, admin edita en /admin/stack-catalog.
    try {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM stack_services`);
      const count = rows[0]?.n ?? 0;
      if (count === 0) {
        const now = new Date();
        const seed = [
          {
            name: "Railway", vendor: "Railway Corporation", category: "hosting",
            description: "Hosting de Node.js + Postgres para el backend del CRM y el sitio.",
            url: "https://railway.app/pricing",
            billing_model: "fixed", base_fee_usd: "20", markup_percent: "0",
            pricing_units: JSON.stringify([]),
            internal_notes: "Plan Hobby cubre proyectos chicos. Pro $20/mes para producción.",
          },
          {
            name: "Supabase", vendor: "Supabase Inc.", category: "database",
            description: "Postgres managed + storage + auth para proyectos cliente.",
            url: "https://supabase.com/pricing",
            billing_model: "tiered", base_fee_usd: "25", markup_percent: "0",
            pricing_units: JSON.stringify([
              { unit: "GB storage", includedQuantity: 100, overageUnitCostUSD: 0.021, note: "Pro tier" },
              { unit: "GB transferencia", includedQuantity: 250, overageUnitCostUSD: 0.09 },
              { unit: "MAU (auth)", includedQuantity: 100000, overageUnitCostUSD: 0.00325 },
            ]),
            internal_notes: "Pro tier $25/mes. Free tier funciona para PoC.",
          },
          {
            name: "Anthropic Claude Sonnet 4", vendor: "Anthropic", category: "ai",
            description: "LLM principal para generación de contenido, agentes y chat.",
            url: "https://www.anthropic.com/pricing",
            billing_model: "passthrough-with-cap", base_fee_usd: "0", markup_percent: "10",
            pricing_units: JSON.stringify([
              { unit: "1M input tokens", includedQuantity: 0, overageUnitCostUSD: 3 },
              { unit: "1M output tokens", includedQuantity: 0, overageUnitCostUSD: 15 },
              { unit: "1M cached input tokens (5min TTL)", includedQuantity: 0, overageUnitCostUSD: 0.3, note: "90% off lectura tras cache hit" },
            ]),
            internal_notes: "Markup 10% sobre uso real. Cap mensual configurable por cliente.",
          },
          {
            name: "Anthropic Claude Haiku 4.5", vendor: "Anthropic", category: "ai",
            description: "LLM rápido y económico para validaciones y clasificación.",
            url: "https://www.anthropic.com/pricing",
            billing_model: "passthrough-with-cap", base_fee_usd: "0", markup_percent: "10",
            pricing_units: JSON.stringify([
              { unit: "1M input tokens", includedQuantity: 0, overageUnitCostUSD: 1 },
              { unit: "1M output tokens", includedQuantity: 0, overageUnitCostUSD: 5 },
            ]),
            internal_notes: "Usar para quality gates y clasificación rápida.",
          },
          {
            name: "Resend", vendor: "Resend", category: "email",
            description: "Envío transaccional de emails (notificaciones, newsletter, propuestas).",
            url: "https://resend.com/pricing",
            billing_model: "tiered", base_fee_usd: "20", markup_percent: "0",
            pricing_units: JSON.stringify([
              { unit: "emails/mes", includedQuantity: 50000, overageUnitCostUSD: 0.0004 },
            ]),
            internal_notes: "Pro $20/mes incluye 50k emails. Free tier 3k/mes para PoC.",
          },
          {
            name: "Meta WhatsApp Cloud API", vendor: "Meta", category: "messaging",
            description: "Mensajería WhatsApp Business para clientes finales (recordatorios, notificaciones).",
            url: "https://developers.facebook.com/docs/whatsapp/pricing",
            billing_model: "passthrough", base_fee_usd: "0", markup_percent: "15",
            pricing_units: JSON.stringify([
              { unit: "conversación marketing (Colombia)", includedQuantity: 1000, overageUnitCostUSD: 0.0252, note: "Tras free tier mensual" },
              { unit: "conversación utility (Colombia)", includedQuantity: 0, overageUnitCostUSD: 0.005 },
              { unit: "conversación authentication", includedQuantity: 0, overageUnitCostUSD: 0.005 },
            ]),
            internal_notes: "Tarifas varían por país. Markup 15% sobre uso real.",
          },
          {
            name: "Stripe", vendor: "Stripe Inc.", category: "payments",
            description: "Procesamiento de pagos para clientes que cobran online.",
            url: "https://stripe.com/pricing",
            billing_model: "client-direct", base_fee_usd: "0", markup_percent: "0",
            pricing_units: JSON.stringify([
              { unit: "% por transacción exitosa", includedQuantity: 0, overageUnitCostUSD: 0.029, note: "2.9% + $0.30 USD por charge en Colombia" },
            ]),
            internal_notes: "Cliente paga directo a Stripe. IM3 no toca el flujo de dinero.",
          },
          {
            name: "Google Workspace", vendor: "Google", category: "other",
            description: "Gmail, Drive, Calendar, Meet — usado para impersonación con service account.",
            url: "https://workspace.google.com/pricing",
            billing_model: "client-direct", base_fee_usd: "0", markup_percent: "0",
            pricing_units: JSON.stringify([
              { unit: "usuario/mes (Business Starter)", includedQuantity: 0, overageUnitCostUSD: 7.2 },
            ]),
            internal_notes: "Cliente paga su propio Workspace. IM3 configura service account.",
          },
          {
            name: "Vercel", vendor: "Vercel Inc.", category: "hosting",
            description: "Hosting de frontends estáticos / Next.js para clientes que requieren CDN global.",
            url: "https://vercel.com/pricing",
            billing_model: "tiered", base_fee_usd: "20", markup_percent: "0",
            pricing_units: JSON.stringify([
              { unit: "GB bandwidth", includedQuantity: 1000, overageUnitCostUSD: 0.15 },
              { unit: "invocaciones serverless", includedQuantity: 1000000, overageUnitCostUSD: 0.0000006 },
            ]),
            internal_notes: "Pro $20/usuario/mes. Solo si el cliente requiere CDN global o ISR.",
          },
          {
            name: "ElevenLabs", vendor: "ElevenLabs", category: "ai",
            description: "Text-to-speech para módulos de voz / asistentes telefónicos.",
            url: "https://elevenlabs.io/pricing",
            billing_model: "passthrough", base_fee_usd: "22", markup_percent: "15",
            pricing_units: JSON.stringify([
              { unit: "1M characters TTS", includedQuantity: 100000, overageUnitCostUSD: 180, note: "Plan Creator incluye 100k chars" },
            ]),
            internal_notes: "Solo cuando el módulo requiere voz sintética premium.",
          },
        ];
        for (const s of seed) {
          await pool.query(
            `INSERT INTO stack_services (name, vendor, category, description, url, billing_model, base_fee_usd, markup_percent, pricing_units, internal_notes, last_price_update)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::json,$10,$11)
             ON CONFLICT DO NOTHING`,
            [s.name, s.vendor, s.category, s.description, s.url, s.billing_model, s.base_fee_usd, s.markup_percent, s.pricing_units, s.internal_notes, now]
          );
        }
        console.log(`✓ Stack services seeded (${seed.length})`);
      }
    } catch (err) {
      console.error("⚠ Could not seed stack_services:", err);
    }

    // Seed plantilla default de contrato — solo si la tabla está vacía
    try {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM contract_templates`);
      const count = rows[0]?.n ?? 0;
      if (count === 0) {
        const defaultBody = `# CONTRATO DE PRESTACIÓN DE SERVICIOS TECNOLÓGICOS

**Fecha de elaboración:** {{fecha.hoy}}

## Entre las partes

Por una parte, **IM3 SYSTEMS S.A.S.** (en adelante, "EL PRESTADOR"), identificada con NIT [NIT pendiente], con domicilio principal en Colombia, representada legalmente por {{im3.representante}}, mayor de edad, identificado con cédula de ciudadanía No. [pendiente].

Por la otra parte, **{{cliente.empresa}}** (en adelante, "EL CLIENTE"), representada por {{cliente.nombre}}, mayor de edad, identificado con cédula de ciudadanía No. [pendiente], con correo electrónico {{cliente.email}}.

## Cláusula primera — Objeto

EL PRESTADOR se obliga a desarrollar e implementar para EL CLIENTE el siguiente proyecto: **{{proposal.titulo}}**.

El alcance detallado se describe en la propuesta comercial adjunta, que forma parte integral de este contrato.

{{proposal.alcance}}

## Cláusula segunda — Valor y forma de pago

El valor total del proyecto es de **{{pricing.totalUSD}}** USD (o su equivalente en pesos colombianos al momento del pago).

La forma de pago será por hitos, según el siguiente cronograma:

{{pricing.milestones}}

## Cláusula tercera — Costos operativos recurrentes

Adicionalmente al valor del desarrollo, EL CLIENTE asumirá los siguientes costos operativos mensuales asociados al stack tecnológico:

- **Estimado mensual:** {{costos.totalMensualUSD}} USD
- **Estimado anual:** {{costos.totalAnualUSD}} USD

Desglose por servicio:

{{costos.desglose}}

Estos costos pueden variar según el uso real del CLIENTE. EL PRESTADOR notificará con anticipación cualquier cambio significativo.

## Cláusula cuarta — Cronograma

EL PRESTADOR estima entregar el proyecto en **{{timeline.semanas}} semanas** a partir de la firma del presente contrato.

- Fecha de inicio estimada: {{timeline.fechaInicio}}
- Fecha de entrega estimada: {{timeline.fechaFin}}

## Cláusula quinta — Propiedad intelectual

Todo el código fuente, documentación y entregables desarrollados específicamente para EL CLIENTE en el marco de este contrato serán de propiedad exclusiva de EL CLIENTE una vez completado el pago total.

Las herramientas, frameworks y bibliotecas open-source utilizadas mantienen su licencia original.

## Cláusula sexta — Confidencialidad

Las partes se obligan a mantener confidencialidad sobre la información comercial, técnica y operativa intercambiada en el marco de este contrato, durante la vigencia del mismo y por dos (2) años posteriores a su terminación.

## Cláusula séptima — Terminación

Cualquiera de las partes podrá dar por terminado este contrato con un preaviso de treinta (30) días calendario. En tal caso, EL CLIENTE pagará a EL PRESTADOR el valor proporcional al avance del proyecto a la fecha de terminación.

## Cláusula octava — Ley aplicable y jurisdicción

El presente contrato se rige por las leyes de la República de Colombia. Cualquier controversia derivada del mismo será resuelta ante los jueces competentes de Bogotá D.C.

## Firma

En constancia de lo anterior, las partes firman el presente contrato el día {{fecha.firma}}.

\\
\\
\\
\\

___________________________________
**Por IM3 SYSTEMS S.A.S.**
{{im3.representante}}
{{im3.email}}

\\
\\
\\
\\

___________________________________
**Por {{cliente.empresa}}**
{{cliente.nombre}}
{{cliente.email}}
`;
        await pool.query(
          `INSERT INTO contract_templates (name, description, body_markdown, expected_variables, is_default, is_active)
           VALUES ($1, $2, $3, $4::json, $5, $6)`,
          [
            "Contrato estándar de prestación de servicios IM3",
            "Plantilla base con cláusulas estándar: objeto, valor, costos operativos, cronograma, IP, confidencialidad, terminación.",
            defaultBody,
            JSON.stringify([
              "fecha.hoy", "fecha.firma",
              "cliente.nombre", "cliente.empresa", "cliente.email", "cliente.telefono",
              "im3.representante", "im3.email",
              "proposal.titulo", "proposal.alcance",
              "pricing.totalUSD", "pricing.milestones",
              "costos.totalMensualUSD", "costos.totalAnualUSD", "costos.desglose",
              "timeline.semanas", "timeline.fechaInicio", "timeline.fechaFin",
            ]),
            true,
            true,
          ]
        );
        console.log("✓ Contract template seeded (default IM3)");
      }
    } catch (err) {
      console.error("⚠ Could not seed contract_templates:", err);
    }

    console.log("✓ Database tables and indexes ensured");

    // Ensure admin user exists with correct password
    try {
      const username = process.env.ADMIN_USERNAME || "admin";
      const password = process.env.ADMIN_PASSWORD || "im3admin2024";
      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      const existingUser = await pool.query(
        'SELECT id FROM users WHERE username = $1 LIMIT 1',
        [username]
      );

      if (existingUser.rows.length === 0) {
        await pool.query(
          `INSERT INTO users (id, username, password) VALUES (gen_random_uuid(), $1, $2)`,
          [username, hashedPassword]
        );
        console.log(`✓ Admin user created: ${username}`);
      } else {
        await pool.query(
          'UPDATE users SET password = $1 WHERE username = $2',
          [hashedPassword, username]
        );
        console.log(`✓ Admin password reset: ${username}`);
      }
    } catch (userErr) {
      console.error("⚠ Could not ensure admin user:", userErr);
    }
  } catch (err) {
    console.error("✗ Migration failed:", err);
  }
}

export { db };
