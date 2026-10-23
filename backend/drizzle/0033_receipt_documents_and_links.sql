CREATE TABLE "receipt_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"receipt_id" uuid,
	"mime_type" varchar(50) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"page_count" smallint,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipt_lines" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "receipt_documents" ADD CONSTRAINT "receipt_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_documents" ADD CONSTRAINT "receipt_documents_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_documents_receipt_uidx" ON "receipt_documents" USING btree ("receipt_id") WHERE "receipt_documents"."receipt_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "receipt_documents_user_receipt_idx" ON "receipt_documents" USING btree ("user_id","receipt_id");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_transaction_uidx" ON "receipts" USING btree ("transaction_id") WHERE "receipts"."transaction_id" IS NOT NULL;