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
