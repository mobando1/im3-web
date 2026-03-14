CREATE TABLE "activity_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_insights_cache" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"insight" json NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_insights_cache_contact_id_unique" UNIQUE("contact_id")
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "substatus" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "tags" json DEFAULT '[]'::json;