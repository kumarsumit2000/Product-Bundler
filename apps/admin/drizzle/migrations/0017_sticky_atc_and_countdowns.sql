CREATE TABLE `sticky_atc_settings` (
	`shop_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`show_image` integer DEFAULT 1 NOT NULL,
	`show_qty` integer DEFAULT 1 NOT NULL,
	`show_price` integer DEFAULT 1 NOT NULL,
	`cta_label` text DEFAULT 'Add to cart' NOT NULL,
	`background_color` text DEFAULT '#FFFFFF' NOT NULL,
	`text_color` text DEFAULT '#1A1A1A' NOT NULL,
	`button_bg` text DEFAULT '#1A1A1A' NOT NULL,
	`button_text` text DEFAULT '#FFFFFF' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `countdown_timers` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`end_at` integer NOT NULL,
	`headline` text DEFAULT 'Sale ends in' NOT NULL,
	`expired_headline` text DEFAULT 'This deal has ended' NOT NULL,
	`layout` text DEFAULT 'inline' NOT NULL,
	`style_overrides` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ct_shop_idx` ON `countdown_timers` (`shop_id`);
