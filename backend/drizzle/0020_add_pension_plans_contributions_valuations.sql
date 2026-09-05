CREATE TABLE "pension_plan_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pension_plan_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pension_plan_valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pension_plan_id" uuid NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pension_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"managing_entity" varchar(100) NOT NULL,
	"plan" varchar(150) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pension_plan_contributions" ADD CONSTRAINT "pension_plan_contributions_pension_plan_id_pension_plans_id_fk" FOREIGN KEY ("pension_plan_id") REFERENCES "public"."pension_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_plan_valuations" ADD CONSTRAINT "pension_plan_valuations_pension_plan_id_pension_plans_id_fk" FOREIGN KEY ("pension_plan_id") REFERENCES "public"."pension_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_plans" ADD CONSTRAINT "pension_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pension_plan_contributions_plan_idx" ON "pension_plan_contributions" USING btree ("pension_plan_id");--> statement-breakpoint
CREATE INDEX "pension_plan_contributions_plan_date_idx" ON "pension_plan_contributions" USING btree ("pension_plan_id","date");--> statement-breakpoint
CREATE INDEX "pension_plan_valuations_plan_date_idx" ON "pension_plan_valuations" USING btree ("pension_plan_id","date");--> statement-breakpoint
CREATE INDEX "pension_plans_user_idx" ON "pension_plans" USING btree ("user_id");