ALTER TABLE "order_items" ADD COLUMN "mark_codes" text[];--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "discount_eligible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fiscal_receipt_id" text;