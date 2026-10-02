CREATE TABLE "deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"edition_date" date NOT NULL,
	"edition_key" text NOT NULL,
	"format" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliveries_user_date" UNIQUE("user_id","edition_date"),
	CONSTRAINT "deliveries_status" CHECK ("deliveries"."status" in ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "partner_copies" (
	"edition_date" date PRIMARY KEY NOT NULL,
	"articles" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_reports" (
	"month" text PRIMARY KEY NOT NULL,
	"articles" integer NOT NULL,
	"subscribers" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_date" ON "deliveries" USING btree ("edition_date");