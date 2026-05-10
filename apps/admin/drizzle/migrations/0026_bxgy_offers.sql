CREATE TABLE `bxgy_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`product_id` text NOT NULL,
	`headline` text,
	`cta_label` text,
	`bars` text NOT NULL,
	`combinable` integer DEFAULT false NOT NULL,
	`visibility` text DEFAULT 'all' NOT NULL,
	`visibility_product_ids` text DEFAULT '[]' NOT NULL,
	`visibility_collection_ids` text DEFAULT '[]' NOT NULL,
	`style_overrides` text,
	`text_overrides` text,
	`linked_countdown_id` text,
	`linked_progressive_gift_id` text,
	`sticky_atc` text,
	`addons_order` text,
	`free_gift_variant_id` text,
	`free_gift_product_id` text,
	`free_gift_min_buy_qty` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bxgy_shop_idx` ON `bxgy_offers` (`shop_id`);
