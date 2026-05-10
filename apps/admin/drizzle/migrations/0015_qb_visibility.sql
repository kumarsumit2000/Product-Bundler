ALTER TABLE `quantity_breaks` ADD `visibility` text DEFAULT 'specific' NOT NULL;
--> statement-breakpoint
ALTER TABLE `quantity_breaks` ADD `visibility_product_ids` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `quantity_breaks` ADD `visibility_collection_ids` text DEFAULT '[]' NOT NULL;
