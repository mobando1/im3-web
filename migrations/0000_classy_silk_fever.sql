CREATE TABLE "abandoned_leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"converted" boolean DEFAULT false NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"content" text NOT NULL,
	"author_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagnostic_id" varchar NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"empresa" text NOT NULL,
	"telefono" text,
	"status" text DEFAULT 'lead' NOT NULL,
	"opted_out" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnostics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha_cita" text NOT NULL,
	"hora_cita" text NOT NULL,
	"empresa" text NOT NULL,
	"industria" text NOT NULL,
	"anos_operacion" text NOT NULL,
	"empleados" text NOT NULL,
	"ciudades" text NOT NULL,
	"participante" text NOT NULL,
	"email" text NOT NULL,
	"telefono" text,
	"objetivos" json NOT NULL,
	"resultado_esperado" text NOT NULL,
	"productos" text NOT NULL,
	"volumen_mensual" text NOT NULL,
	"cliente_principal" text NOT NULL,
	"cliente_principal_otro" text,
	"canales_adquisicion" json NOT NULL,
	"canal_adquisicion_otro" text,
	"canal_principal" text NOT NULL,
	"herramientas" text NOT NULL,
	"conectadas" text NOT NULL,
	"conectadas_detalle" text,
	"nivel_tech" text NOT NULL,
	"usa_ia" text NOT NULL,
	"usa_ia_para_que" text,
	"comodidad_tech" text NOT NULL,
	"familiaridad" json NOT NULL,
	"area_prioridad" json NOT NULL,
	"presupuesto" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_to_ghl" boolean DEFAULT false NOT NULL,
	"google_drive_url" text,
	"meet_link" text
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"subject_prompt" text NOT NULL,
	"body_prompt" text NOT NULL,
	"sequence_order" integer NOT NULL,
	"delay_days" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"subscribed_at" timestamp DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sent_emails" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"template_id" varchar NOT NULL,
	"subject" text,
	"body" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"sent_at" timestamp,
	"resend_message_id" text,
	"retry_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
