ALTER TABLE "users" ADD COLUMN "delivery_method" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "read_link_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_delivery_method" CHECK ("users"."delivery_method" in ('email', 'download'));