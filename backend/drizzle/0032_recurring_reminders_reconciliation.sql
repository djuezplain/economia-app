ALTER TYPE "public"."recurring_resolution_status" ADD VALUE 'RECONCILED';--> statement-breakpoint
CREATE TABLE "recurring_reconciliation_dismissals" (
	"recurring_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"transaction_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_reconciliation_dismissals_recurring_id_occurrence_date_transaction_id_pk" PRIMARY KEY("recurring_id","occurrence_date","transaction_id")
);
--> statement-breakpoint
CREATE TABLE "recurring_reminders_sent" (
	"recurring_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_reminders_sent_recurring_id_occurrence_date_pk" PRIMARY KEY("recurring_id","occurrence_date")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recurring_reminder_emails" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_occurrence_resolutions" ADD COLUMN "reconciled_automatically" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD COLUMN "variable_amount" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD COLUMN "reminder_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD COLUMN "reminder_days_before" smallint DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_reconciliation_dismissals" ADD CONSTRAINT "recurring_reconciliation_dismissals_recurring_id_recurring_transactions_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_reconciliation_dismissals" ADD CONSTRAINT "recurring_reconciliation_dismissals_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_reminders_sent" ADD CONSTRAINT "recurring_reminders_sent_recurring_id_recurring_transactions_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_resolutions_transaction_uidx" ON "recurring_occurrence_resolutions" USING btree ("transaction_id") WHERE "recurring_occurrence_resolutions"."transaction_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_reminder_days_check" CHECK ("recurring_transactions"."reminder_days_before" BETWEEN 0 AND 7);