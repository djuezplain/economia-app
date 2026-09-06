CREATE TABLE "fund_dividends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" uuid NOT NULL,
	"net_amount" numeric(12, 2) NOT NULL,
	"retention_percent" numeric(5, 2) DEFAULT '19.00' NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_dividends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"net_amount" numeric(12, 2) NOT NULL,
	"retention_percent" numeric(5, 2) DEFAULT '19.00' NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fund_dividends" ADD CONSTRAINT "fund_dividends_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_dividends" ADD CONSTRAINT "stock_dividends_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fund_dividends_fund_idx" ON "fund_dividends" USING btree ("fund_id");--> statement-breakpoint
CREATE INDEX "fund_dividends_fund_date_idx" ON "fund_dividends" USING btree ("fund_id","date");--> statement-breakpoint
CREATE INDEX "stock_dividends_stock_idx" ON "stock_dividends" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX "stock_dividends_stock_date_idx" ON "stock_dividends" USING btree ("stock_id","date");