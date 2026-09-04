CREATE TABLE "bank_account_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bank" varchar(100) NOT NULL,
	"account_number" varchar(50) NOT NULL,
	"euros" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"custody_bank" varchar(100) NOT NULL,
	"stock" varchar(150) NOT NULL,
	"share_count" numeric(14, 4) NOT NULL,
	"purchase_price" numeric(12, 2) NOT NULL,
	"current_valuation" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_account_entries" ADD CONSTRAINT "bank_account_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_account_entries_user_date_idx" ON "bank_account_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "stock_entries_user_idx" ON "stock_entries" USING btree ("user_id");