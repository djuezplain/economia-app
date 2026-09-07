CREATE TABLE "stock_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"share_count" numeric(18, 8) NOT NULL,
	"sale_price" numeric(18, 8) NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_sales" ADD CONSTRAINT "stock_sales_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_sales_stock_idx" ON "stock_sales" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX "stock_sales_stock_date_idx" ON "stock_sales" USING btree ("stock_id","date");