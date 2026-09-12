ALTER TABLE "receipt_lines" DROP CONSTRAINT "receipt_lines_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_supermarket_id_supermarkets_id_fk";
--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_supermarket_id_supermarkets_id_fk" FOREIGN KEY ("supermarket_id") REFERENCES "public"."supermarkets"("id") ON DELETE cascade ON UPDATE no action;