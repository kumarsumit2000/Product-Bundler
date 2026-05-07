CREATE TABLE `bundle_daily` (
	`shop_id` text NOT NULL,
	`date` text NOT NULL,
	`bundle_id` text NOT NULL,
	`widget_type` text NOT NULL,
	`application_count` integer DEFAULT 0 NOT NULL,
	`revenue_cents` integer DEFAULT 0 NOT NULL,
	`orders` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`shop_id`, `date`, `bundle_id`),
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bundle_daily_shop_date_idx` ON `bundle_daily` (`shop_id`,`date`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`type` text NOT NULL,
	`widget_type` text NOT NULL,
	`widget_id` text NOT NULL,
	`product_id` text,
	`tier_qty` integer,
	`value_cents` integer DEFAULT 0 NOT NULL,
	`ts` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_shop_ts_idx` ON `events` (`shop_id`,`ts`);--> statement-breakpoint
CREATE INDEX `events_shop_widget_ts_idx` ON `events` (`shop_id`,`widget_id`,`ts`);--> statement-breakpoint
CREATE TABLE `revenue_daily` (
	`shop_id` text NOT NULL,
	`date` text NOT NULL,
	`total_revenue_cents` integer DEFAULT 0 NOT NULL,
	`total_orders` integer DEFAULT 0 NOT NULL,
	`bundle_revenue_cents` integer DEFAULT 0 NOT NULL,
	`bundle_orders` integer DEFAULT 0 NOT NULL,
	`qb_revenue_cents` integer DEFAULT 0 NOT NULL,
	`qb_orders` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`shop_id`, `date`),
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
