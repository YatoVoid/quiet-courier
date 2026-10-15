ALTER TABLE "partner_copies" ADD COLUMN "partner" text DEFAULT 'conversation' NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_reports" ADD COLUMN "partner" text DEFAULT 'conversation' NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_copies" DROP CONSTRAINT "partner_copies_pkey";--> statement-breakpoint
ALTER TABLE "partner_reports" DROP CONSTRAINT "partner_reports_pkey";--> statement-breakpoint
ALTER TABLE "partner_copies" ADD CONSTRAINT "partner_copies_partner_edition_date_pk" PRIMARY KEY("partner","edition_date");--> statement-breakpoint
ALTER TABLE "partner_reports" ADD CONSTRAINT "partner_reports_partner_month_pk" PRIMARY KEY("partner","month");
