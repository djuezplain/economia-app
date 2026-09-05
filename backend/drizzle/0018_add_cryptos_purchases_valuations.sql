CREATE TABLE "crypto_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crypto_id" uuid NOT NULL,
	"quantity" numeric(28, 8) NOT NULL,
	"purchase_price" numeric(18, 8) NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crypto_id" uuid NOT NULL,
	"price_per_unit" numeric(18, 8) NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cryptos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exchange" varchar(100) NOT NULL,
	"crypto" varchar(150) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crypto_purchases" ADD CONSTRAINT "crypto_purchases_crypto_id_cryptos_id_fk" FOREIGN KEY ("crypto_id") REFERENCES "public"."cryptos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_valuations" ADD CONSTRAINT "crypto_valuations_crypto_id_cryptos_id_fk" FOREIGN KEY ("crypto_id") REFERENCES "public"."cryptos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cryptos" ADD CONSTRAINT "cryptos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crypto_purchases_crypto_idx" ON "crypto_purchases" USING btree ("crypto_id");--> statement-breakpoint
CREATE INDEX "crypto_purchases_crypto_date_idx" ON "crypto_purchases" USING btree ("crypto_id","date");--> statement-breakpoint
CREATE INDEX "crypto_valuations_crypto_date_idx" ON "crypto_valuations" USING btree ("crypto_id","date");--> statement-breakpoint
CREATE INDEX "cryptos_user_idx" ON "cryptos" USING btree ("user_id");