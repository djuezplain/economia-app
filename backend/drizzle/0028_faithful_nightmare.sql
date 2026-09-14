CREATE TYPE "public"."schedule_destination" AS ENUM('LOCAL', 'DRIVE');--> statement-breakpoint
CREATE TYPE "public"."schedule_frequency" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');--> statement-breakpoint
CREATE TABLE "scheduled_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"frequency" "schedule_frequency" NOT NULL,
	"day_of_week" smallint,
	"day_of_month" smallint,
	"time_of_day" varchar(5) NOT NULL,
	"destination" "schedule_destination" NOT NULL,
	"local_subfolder" varchar(100),
	"last_run_at" timestamp with time zone,
	"last_run_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_exports_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "scheduled_exports" ADD CONSTRAINT "scheduled_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;