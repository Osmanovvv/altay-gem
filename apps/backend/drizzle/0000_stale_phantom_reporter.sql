CREATE TYPE "public"."delivery_method" AS ENUM('pickup_leningradskaya', 'pickup_titova', 'courier_nsk', 'russia');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('web', 'max');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('new', 'awaiting_payment', 'paid', 'assembling', 'ready_for_pickup', 'shipped', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('online', 'cash_on_pickup', 'card_on_pickup');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('active', 'released', 'committed');--> statement-breakpoint
CREATE TYPE "public"."sync_direction" AS ENUM('import', 'export');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."webhook_source" AS ENUM('evotor', 'payment');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('received', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "evotor_products" (
	"store_id" uuid NOT NULL,
	"evotor_uuid" uuid NOT NULL,
	"name" text NOT NULL,
	"price_kopecks" integer DEFAULT 0 NOT NULL,
	"cost_price_kopecks" integer,
	"quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"measure" text DEFAULT 'шт' NOT NULL,
	"group_uuid" uuid,
	"group_name" text,
	"barcodes" text[] DEFAULT '{}' NOT NULL,
	"article" text,
	"code" text,
	"evotor_type" text DEFAULT 'NORMAL' NOT NULL,
	"is_marked" boolean DEFAULT false NOT NULL,
	"allow_to_sell" boolean DEFAULT true NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"match_key" text NOT NULL,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evotor_products_store_id_evotor_uuid_pk" PRIMARY KEY("store_id","evotor_uuid")
);
--> statement-breakpoint
CREATE TABLE "evotor_stores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"store_id" uuid,
	"evotor_uuid" uuid,
	"name" text NOT NULL,
	"price_kopecks" integer NOT NULL,
	"old_price_kopecks" integer,
	"quantity" integer NOT NULL,
	"portion_mass_g" integer,
	"unit" text DEFAULT 'шт' NOT NULL,
	"is_marked" boolean DEFAULT false NOT NULL,
	"sum_kopecks" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"access_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" "order_status" DEFAULT 'new' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" text,
	"delivery_method" "delivery_method" NOT NULL,
	"delivery_address" text,
	"delivery_cost_kopecks" integer DEFAULT 0 NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payment_external_id" text,
	"promo_code" text,
	"promo_discount_kopecks" integer DEFAULT 0 NOT NULL,
	"items_subtotal_kopecks" integer NOT NULL,
	"total_kopecks" integer NOT NULL,
	"source" "order_source" DEFAULT 'web' NOT NULL,
	"comment" text,
	"cancel_reason" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promocode_usages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"order_id" integer NOT NULL,
	"discount_kopecks" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"store_id" uuid NOT NULL,
	"evotor_uuid" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"status" "reservation_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"direction" "sync_direction" NOT NULL,
	"entity" text NOT NULL,
	"store_id" uuid,
	"evotor_uuid" uuid,
	"status" "sync_status" NOT NULL,
	"payload" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" "webhook_source" NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_status" DEFAULT 'received' NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "evotor_products" ADD CONSTRAINT "evotor_products_store_id_evotor_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."evotor_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promocode_usages" ADD CONSTRAINT "promocode_usages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evotor_products_match_key_idx" ON "evotor_products" USING btree ("match_key");--> statement-breakpoint
CREATE INDEX "evotor_products_group_idx" ON "evotor_products" USING btree ("group_uuid");--> statement-breakpoint
CREATE INDEX "evotor_products_updated_idx" ON "evotor_products" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idempotency_created_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_access_token_idx" ON "orders" USING btree ("access_token");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_phone_idx" ON "orders" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "promocode_usages_code_idx" ON "promocode_usages" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "promocode_usages_order_idx" ON "promocode_usages" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "reservations_order_idx" ON "stock_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "reservations_product_idx" ON "stock_reservations" USING btree ("store_id","evotor_uuid");--> statement-breakpoint
CREATE INDEX "reservations_active_idx" ON "stock_reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "sync_log_created_idx" ON "sync_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sync_log_entity_idx" ON "sync_log" USING btree ("entity","status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_dedup_idx" ON "webhook_events" USING btree ("source","event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_received_idx" ON "webhook_events" USING btree ("received_at");