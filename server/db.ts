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

    console.log("✓ Database tables ensured");

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
