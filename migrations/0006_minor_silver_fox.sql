CREATE TABLE "client_projects" (
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
--> statement-breakpoint
CREATE TABLE "github_webhook_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"payload" json NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"activity_entry_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_sends" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"blog_post_id" varchar,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"recipient_count" integer DEFAULT 0,
	"status" text DEFAULT 'sent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_activity_entries" (
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
--> statement-breakpoint
CREATE TABLE "project_deliverables" (
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
--> statement-breakpoint
CREATE TABLE "project_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"sender_type" text NOT NULL,
	"sender_name" text NOT NULL,
	"content" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_phases" (
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
--> statement-breakpoint
CREATE TABLE "project_tasks" (
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
--> statement-breakpoint
CREATE TABLE "project_time_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"task_id" varchar,
	"description" text NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"date" text NOT NULL,
	"category" text DEFAULT 'development' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
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
	"condition_type" text,
	"condition_email_template" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "diagnostic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "status" text DEFAULT 'scheduled';--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "recording_url" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "transcript_url" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "appointment_type" text DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "parent_appointment_id" varchar;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "references" json DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "idioma" varchar(5) DEFAULT 'es' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "last_activity_at" timestamp;--> statement-breakpoint
ALTER TABLE "diagnostics" ADD COLUMN "google_calendar_event_id" text;--> statement-breakpoint
ALTER TABLE "diagnostics" ADD COLUMN "meeting_status" text DEFAULT 'scheduled';--> statement-breakpoint
ALTER TABLE "diagnostics" ADD COLUMN "meeting_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "diagnostics" ADD COLUMN "form_duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN "opened_at" timestamp;