CREATE TABLE "bank_account_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"euros" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bank" varchar(100) NOT NULL,
	"account_number" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_account_balances" ADD CONSTRAINT "bank_account_balances_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_account_balances_account_date_idx" ON "bank_account_balances" USING btree ("bank_account_id","date");--> statement-breakpoint
CREATE INDEX "bank_accounts_user_idx" ON "bank_accounts" USING btree ("user_id");--> statement-breakpoint
-- Spec 019, plan.md §2: preserva los datos ya desplegados bajo el modelo de
-- spec 018 (histórico plano) migrándolos al modelo en dos niveles (cuenta +
-- historial de saldos), antes de retirar la tabla vieja en la siguiente
-- migración. GROUP BY: varias filas de spec 018 con el mismo banco/número
-- de cuenta se convierten en una única cuenta con todo su historial.
INSERT INTO "bank_accounts" ("id", "user_id", "bank", "account_number", "created_at", "updated_at")
SELECT gen_random_uuid(), "user_id", "bank", "account_number", min("created_at"), max("updated_at")
FROM "bank_account_entries"
GROUP BY "user_id", "bank", "account_number";--> statement-breakpoint
INSERT INTO "bank_account_balances" ("id", "bank_account_id", "euros", "date", "created_at", "updated_at")
SELECT gen_random_uuid(), "ba"."id", "e"."euros", "e"."date", "e"."created_at", "e"."updated_at"
FROM "bank_account_entries" "e"
JOIN "bank_accounts" "ba"
  ON "ba"."user_id" = "e"."user_id" AND "ba"."bank" = "e"."bank" AND "ba"."account_number" = "e"."account_number";--> statement-breakpoint
DROP INDEX "bank_account_entries_user_date_idx";