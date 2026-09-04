CREATE TABLE "stock_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"share_count" numeric(14, 4) NOT NULL,
	"purchase_price" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"valuation" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"custody_bank" varchar(100) NOT NULL,
	"stock" varchar(150) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_purchases" ADD CONSTRAINT "stock_purchases_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_valuations" ADD CONSTRAINT "stock_valuations_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_purchases_stock_idx" ON "stock_purchases" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX "stock_valuations_stock_date_idx" ON "stock_valuations" USING btree ("stock_id","date");--> statement-breakpoint
CREATE INDEX "stocks_user_idx" ON "stocks" USING btree ("user_id");--> statement-breakpoint
-- Spec 020, plan.md §2: preserva los datos ya desplegados bajo el modelo de
-- spec 018 (histórico plano) migrándolos al modelo en tres niveles (acción +
-- historial de compras + historial de valoraciones), antes de retirar la
-- tabla vieja en la siguiente migración. GROUP BY: varias filas de spec 018
-- con el mismo banco custodia/acción se convierten en una única acción con
-- todas sus compras y valoraciones.
INSERT INTO "stocks" ("id", "user_id", "custody_bank", "stock", "created_at", "updated_at")
SELECT gen_random_uuid(), "user_id", "custody_bank", "stock", min("created_at"), max("updated_at")
FROM "stock_entries"
GROUP BY "user_id", "custody_bank", "stock";--> statement-breakpoint
INSERT INTO "stock_purchases" ("id", "stock_id", "share_count", "purchase_price", "created_at", "updated_at")
SELECT gen_random_uuid(), "s"."id", "e"."share_count", "e"."purchase_price", "e"."created_at", "e"."updated_at"
FROM "stock_entries" "e"
JOIN "stocks" "s"
  ON "s"."user_id" = "e"."user_id" AND "s"."custody_bank" = "e"."custody_bank" AND "s"."stock" = "e"."stock";--> statement-breakpoint
INSERT INTO "stock_valuations" ("id", "stock_id", "valuation", "date", "created_at", "updated_at")
SELECT gen_random_uuid(), "s"."id", "e"."current_valuation", "e"."created_at"::date, "e"."created_at", "e"."updated_at"
FROM "stock_entries" "e"
JOIN "stocks" "s"
  ON "s"."user_id" = "e"."user_id" AND "s"."custody_bank" = "e"."custody_bank" AND "s"."stock" = "e"."stock";--> statement-breakpoint
DROP INDEX "stock_entries_user_idx";