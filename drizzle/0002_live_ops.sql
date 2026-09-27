CREATE SEQUENCE "public"."order_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "login_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"live_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "invoice_deadline" text DEFAULT 'em até 5 dias úteis' NOT NULL;--> statement-breakpoint
ALTER TABLE "login_links" ADD CONSTRAINT "login_links_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_links" ADD CONSTRAINT "login_links_live_id_lives_id_fk" FOREIGN KEY ("live_id") REFERENCES "public"."lives"("id") ON DELETE cascade ON UPDATE no action;