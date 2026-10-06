ALTER TABLE "deliveries" ADD COLUMN "backup_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "check_in_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "check_in_answer" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "check_in_answered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_check_in_answer" CHECK ("users"."check_in_answer" in ('yes', 'no'));