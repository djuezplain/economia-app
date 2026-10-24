-- Spec 051 plan.md §0 decisión 1 (añadido a mano: drizzle-kit no genera extensiones ni funciones).
-- `unaccent` no es IMMUTABLE (depende de un diccionario configurable), así que no se puede usar
-- en un índice; el envoltorio fija el diccionario y se declara IMMUTABLE, el truco habitual.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;--> statement-breakpoint
CREATE TABLE "receipt_tag_links" (
	"receipt_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "receipt_tag_links_receipt_id_tag_id_pk" PRIMARY KEY("receipt_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "receipt_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(40) NOT NULL,
	"color" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_tags_color_check" CHECK ("receipt_tags"."color" IS NULL OR "receipt_tags"."color" IN ('gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple'))
);
--> statement-breakpoint
CREATE TABLE "warranty_reminders_sent" (
	"receipt_id" uuid NOT NULL,
	"warranty_until" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warranty_reminders_sent_receipt_id_warranty_until_pk" PRIMARY KEY("receipt_id","warranty_until")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "warranty_reminder_emails" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "receipt_documents" ADD COLUMN "ocr_text" text;--> statement-breakpoint
ALTER TABLE "receipt_documents" ADD COLUMN "ocr_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receipt_documents" ADD COLUMN "thumbnail" "bytea";--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "warranty_until" date;--> statement-breakpoint
ALTER TABLE "receipt_tag_links" ADD CONSTRAINT "receipt_tag_links_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_tag_links" ADD CONSTRAINT "receipt_tag_links_tag_id_receipt_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."receipt_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_tags" ADD CONSTRAINT "receipt_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_reminders_sent" ADD CONSTRAINT "warranty_reminders_sent_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_tag_links_tag_idx" ON "receipt_tag_links" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_tags_user_name_uidx" ON "receipt_tags" USING btree ("user_id",immutable_unaccent(lower("name")));--> statement-breakpoint
CREATE INDEX "receipt_documents_ocr_trgm_idx" ON "receipt_documents" USING gin (immutable_unaccent(lower("ocr_text")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "receipts_note_trgm_idx" ON "receipts" USING gin (immutable_unaccent(lower("note")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "receipts_user_warranty_idx" ON "receipts" USING btree ("user_id","warranty_until");