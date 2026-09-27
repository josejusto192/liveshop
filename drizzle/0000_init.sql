CREATE TYPE "public"."admin_role" AS ENUM('owner', 'operator', 'finance');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('queued', 'on_air', 'presented');--> statement-breakpoint
CREATE TYPE "public"."live_format" AS ENUM('horizontal', 'vertical');--> statement-breakpoint
CREATE TYPE "public"."live_status" AS ENUM('draft', 'scheduled', 'live', 'ended');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'invoicing', 'invoiced', 'delivered', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."switch_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'answered', 'closed');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "admin_role" DEFAULT 'operator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"segment" text,
	"orders_email" text,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"whatsapp" text NOT NULL,
	"cnpj" text,
	"contact_name" text,
	"cep" text,
	"address" text,
	"city" text,
	"notify_email" boolean DEFAULT true NOT NULL,
	"notify_whatsapp" boolean DEFAULT true NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "live_attendance" (
	"live_id" uuid,
	"company_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_attendance_live_id_company_id_pk" PRIMARY KEY("live_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "live_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"live_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"duration_s" integer DEFAULT 900 NOT NULL,
	"status" "item_status" DEFAULT 'queued' NOT NULL,
	"first_aired_at" timestamp with time zone,
	CONSTRAINT "live_items_live_product" UNIQUE("live_id","product_id"),
	CONSTRAINT "live_items_duration_s" CHECK ("live_items"."duration_s" between 300 and 3600)
);
--> statement-breakpoint
CREATE TABLE "lives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"format" "live_format" DEFAULT 'horizontal' NOT NULL,
	"status" "live_status" DEFAULT 'draft' NOT NULL,
	"mode" "switch_mode" DEFAULT 'auto' NOT NULL,
	"video_delay_s" integer DEFAULT 6 NOT NULL,
	"show_timer" boolean DEFAULT true NOT NULL,
	"show_activity" boolean DEFAULT true NOT NULL,
	"stream_key" text NOT NULL,
	"current_item_id" uuid,
	"item_started_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"extra_ms" integer DEFAULT 0 NOT NULL,
	"item_hidden" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lives_slug_unique" UNIQUE("slug"),
	CONSTRAINT "lives_stream_key_unique" UNIQUE("stream_key"),
	CONSTRAINT "lives_video_delay_s" CHECK ("lives"."video_delay_s" between 0 and 15)
);
--> statement-breakpoint
CREATE TABLE "order_item_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"qty_before" integer,
	"qty_after" integer,
	"live_offset_s" integer,
	"by_company" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_item_events_kind" CHECK ("order_item_events"."kind" in ('registered', 'added', 'changed', 'canceled'))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"live_item_id" uuid,
	"qty" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"live_offset_s" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"canceled_at" timestamp with time zone,
	CONSTRAINT "order_items_order_product" UNIQUE("order_id","product_id"),
	CONSTRAINT "order_items_qty" CHECK ("order_items"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"live_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"invoice_url" text,
	"sent_to_brand_at" timestamp with time zone,
	"invoicing_at" timestamp with time zone,
	"invoiced_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_code_unique" UNIQUE("code"),
	CONSTRAINT "orders_live_company" UNIQUE("live_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"subject" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" "inet",
	CONSTRAINT "otp_codes_subject" CHECK ("otp_codes"."subject" in ('company', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"description" text,
	"image_url" text,
	"price_cents" integer NOT NULL,
	"stock_total" integer NOT NULL,
	"min_qty" integer DEFAULT 10 NOT NULL,
	"step_qty" integer DEFAULT 10 NOT NULL,
	"block_over_stock" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_brand_sku" UNIQUE("brand_id","sku"),
	CONSTRAINT "products_price_cents" CHECK ("products"."price_cents" >= 0),
	CONSTRAINT "products_stock_total" CHECK ("products"."stock_total" >= 0),
	CONSTRAINT "products_min_qty" CHECK ("products"."min_qty" > 0),
	CONSTRAINT "products_step_qty" CHECK ("products"."step_qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"company_id" uuid,
	"admin_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_one_owner" CHECK (("sessions"."company_id" is null) <> ("sessions"."admin_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"platform_name" text DEFAULT 'Live Shop' NOT NULL,
	"accent_color" text DEFAULT '#D6F35B' NOT NULL,
	"logo_url" text,
	"default_video_delay_s" integer DEFAULT 6 NOT NULL,
	"otp_ttl_min" integer DEFAULT 10 NOT NULL,
	"mail_from_name" text,
	"mail_from_email" text,
	"mail_subject" text,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "stock_alerts" (
	"product_id" uuid,
	"company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_alerts_product_id_company_id_pk" PRIMARY KEY("product_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "live_attendance" ADD CONSTRAINT "live_attendance_live_id_lives_id_fk" FOREIGN KEY ("live_id") REFERENCES "public"."lives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_attendance" ADD CONSTRAINT "live_attendance_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_items" ADD CONSTRAINT "live_items_live_id_lives_id_fk" FOREIGN KEY ("live_id") REFERENCES "public"."lives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_items" ADD CONSTRAINT "live_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lives" ADD CONSTRAINT "lives_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lives" ADD CONSTRAINT "lives_current_item_id_live_items_id_fk" FOREIGN KEY ("current_item_id") REFERENCES "public"."live_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_events" ADD CONSTRAINT "order_item_events_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_live_item_id_live_items_id_fk" FOREIGN KEY ("live_item_id") REFERENCES "public"."live_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_live_id_lives_id_fk" FOREIGN KEY ("live_id") REFERENCES "public"."lives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_codes_email_created_at_idx" ON "otp_codes" USING btree ("email","created_at" DESC NULLS LAST);