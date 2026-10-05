CREATE TABLE "referral_clicks" (
	"code" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "referral_clicks_code_day_pk" PRIMARY KEY("code","day")
);
--> statement-breakpoint
CREATE TABLE "referral_conversions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"referrer_id" integer NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"payout_cents" integer NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"voided_at" timestamp with time zone,
	CONSTRAINT "referral_conversions_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "referral_conversions_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "referral_links" (
	"code" text PRIMARY KEY NOT NULL,
	"referrer_id" integer NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "referral_links_code" CHECK ("referral_links"."code" ~ '^[a-z0-9-]{2,32}$')
);
--> statement-breakpoint
CREATE TABLE "referral_payouts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"referrer_id" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_on" date NOT NULL,
	"method" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_payouts_amount" CHECK ("referral_payouts"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "referrers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"kind" text NOT NULL,
	"payout_cents" integer NOT NULL,
	"max_payouts" integer,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"agreed_at" date,
	"w9_on_file" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrers_kind" CHECK ("referrers"."kind" in ('organization', 'individual')),
	CONSTRAINT "referrers_payout" CHECK ("referrers"."payout_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "email_tokens" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referred_by" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referral_clicks" ADD CONSTRAINT "referral_clicks_code_referral_links_code_fk" FOREIGN KEY ("code") REFERENCES "public"."referral_links"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_code_referral_links_code_fk" FOREIGN KEY ("code") REFERENCES "public"."referral_links"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_referrer_id_referrers_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."referrers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_referrer_id_referrers_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."referrers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_payouts" ADD CONSTRAINT "referral_payouts_referrer_id_referrers_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."referrers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referral_conversions_referrer" ON "referral_conversions" USING btree ("referrer_id","paid_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_referral_links_code_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."referral_links"("code") ON DELETE no action ON UPDATE no action;