ALTER TABLE `bxgy_offers` ADD `checkbox_upsells_enabled` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `bxgy_offers` ADD `checkbox_upsells` text DEFAULT '[]' NOT NULL;
