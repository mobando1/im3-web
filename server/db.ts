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
