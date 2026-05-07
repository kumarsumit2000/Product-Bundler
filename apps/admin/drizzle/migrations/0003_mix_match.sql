ALTER TABLE `bundles` ADD `mode` text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE `bundles` ADD `collection_id` text;--> statement-breakpoint
ALTER TABLE `bundles` ADD `target_qty` integer;