CREATE TABLE "appointments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar,
	"title" text NOT NULL,
	"date" text NOT NULL,
	"time" text NOT NULL,
	"duration" integer DEFAULT 45 NOT NULL,
	"notes" text,
	"meet_link" text,
	"google_calendar_event_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
