ALTER TABLE `shops` ADD `monthly_order_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `shops` ADD `lifetime_order_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `shops` ADD `monthly_order_reset_at` integer;
