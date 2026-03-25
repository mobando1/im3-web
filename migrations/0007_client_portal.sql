-- Add role-based access and client portal support
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'admin';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "contact_id" varchar;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now() NOT NULL;

-- Invitations table for client portal access
CREATE TABLE IF NOT EXISTS "invitations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "token" text NOT NULL UNIQUE,
  "contact_id" varchar NOT NULL,
  "created_by" varchar NOT NULL,
  "email" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_invitations_token" ON "invitations" ("token");
CREATE INDEX IF NOT EXISTS "idx_invitations_contact" ON "invitations" ("contact_id");
CREATE INDEX IF NOT EXISTS "idx_users_contact" ON "users" ("contact_id");
