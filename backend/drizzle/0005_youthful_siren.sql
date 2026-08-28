CREATE TYPE "public"."goal_period" AS ENUM('MONTHLY', 'ANNUAL');--> statement-breakpoint
CREATE TYPE "public"."target_type" AS ENUM('AMOUNT', 'PERCENT');--> statement-breakpoint
CREATE TABLE "expense_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"target_type" "target_type" NOT NULL,
	"target_value" numeric(12, 2) NOT NULL,
	"alert_threshold_percent" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period" "goal_period" NOT NULL,
	"target_type" "target_type" NOT NULL,
	"target_value" numeric(12, 2) NOT NULL,
	"alert_threshold_percent" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;