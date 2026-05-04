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

    // Diagnostics extra columns
    await pool.query(`ALTER TABLE "diagnostics" ADD COLUMN IF NOT EXISTS "google_calendar_event_id" text;`).catch(() => {});
    await pool.query(`ALTER TABLE "diagnostics" ADD COLUMN IF NOT EXISTS "form_duration_minutes" integer;`).catch(() => {});

    // Sent emails extra columns
    await pool.query(`ALTER TABLE "sent_emails" ADD COLUMN IF NOT EXISTS "opened_at" timestamp;`).catch(() => {});
    // Allow contactId to be null for admin notifications not tied to a specific contact
    await pool.query(`ALTER TABLE "sent_emails" ALTER COLUMN "contact_id" DROP NOT NULL;`).catch(() => {});

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

    // Project deliverables: client rating
    await pool.query(`ALTER TABLE "project_deliverables" ADD COLUMN IF NOT EXISTS "client_rating" integer;`).catch(() => {});

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
