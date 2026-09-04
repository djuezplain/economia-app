ALTER TABLE "stock_valuations" ADD COLUMN "price_per_share" numeric(12, 2);--> statement-breakpoint
UPDATE "stock_valuations" SET "price_per_share" = "valuation" WHERE "price_per_share" IS NULL;--> statement-breakpoint
ALTER TABLE "stock_valuations" ALTER COLUMN "price_per_share" SET NOT NULL;