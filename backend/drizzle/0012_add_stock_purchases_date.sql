ALTER TABLE "stock_purchases" ADD COLUMN "date" date;--> statement-breakpoint
UPDATE "stock_purchases" SET "date" = "created_at"::date WHERE "date" IS NULL;--> statement-breakpoint
ALTER TABLE "stock_purchases" ALTER COLUMN "date" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "stock_purchases_stock_date_idx" ON "stock_purchases" USING btree ("stock_id","date");