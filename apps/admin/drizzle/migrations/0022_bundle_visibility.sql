ALTER TABLE `bundles` ADD `visibility` text DEFAULT 'same_as_members' NOT NULL;
--> statement-breakpoint
ALTER TABLE `bundles` ADD `visibility_collection_ids` text DEFAULT '[]' NOT NULL;
