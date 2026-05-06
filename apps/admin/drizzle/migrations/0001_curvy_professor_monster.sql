CREATE TABLE `bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`products` text NOT NULL,
	`discount_type` text NOT NULL,
	`discount_value` real NOT NULL,
	`combinable` integer DEFAULT false NOT NULL,
	`trigger_product_ids` text NOT NULL,
	`style_overrides` text,
	`headline` text,
	`cta_label` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bundles_shop_idx` ON `bundles` (`shop_id`);--> statement-breakpoint
CREATE INDEX `bundles_status_idx` ON `bundles` (`shop_id`,`status`);--> statement-breakpoint
CREATE TABLE `quantity_breaks` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`product_id` text NOT NULL,
	`collection_id` text,
	`tiers` text NOT NULL,
	`combinable` integer DEFAULT false NOT NULL,
	`style_overrides` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `qb_shop_idx` ON `quantity_breaks` (`shop_id`);--> statement-breakpoint
CREATE INDEX `qb_product_idx` ON `quantity_breaks` (`shop_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `shop_settings` (
	`shop_id` text PRIMARY KEY NOT NULL,
	`primary_color` text DEFAULT '#7B1E2A' NOT NULL,
	`text_color` text DEFAULT '#1A1A1A' NOT NULL,
	`background_color` text DEFAULT '#FFFFFF' NOT NULL,
	`border_radius` integer DEFAULT 8 NOT NULL,
	`font_family` text DEFAULT 'inherit' NOT NULL,
	`bundle_headline` text DEFAULT 'Frequently bought together' NOT NULL,
	`qb_headline` text DEFAULT 'Choose your savings' NOT NULL,
	`show_compare_at_price` integer DEFAULT true NOT NULL,
	`enable_bogo` integer DEFAULT true NOT NULL,
	`custom_css` text,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `shops` ADD `shopify_shop_gid` text;