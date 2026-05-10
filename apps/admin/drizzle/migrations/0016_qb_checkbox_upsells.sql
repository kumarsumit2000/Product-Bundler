ALTER TABLE `quantity_breaks` ADD `checkbox_upsells_enabled` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `quantity_breaks` ADD `checkbox_upsells` text DEFAULT '[]' NOT NULL;
