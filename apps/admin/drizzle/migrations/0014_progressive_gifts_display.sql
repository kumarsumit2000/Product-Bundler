ALTER TABLE `progressive_gifts` ADD `subtitle` text;
--> statement-breakpoint
ALTER TABLE `progressive_gifts` ADD `layout` text DEFAULT 'grid' NOT NULL;
--> statement-breakpoint
ALTER TABLE `progressive_gifts` ADD `hide_locked` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `progressive_gifts` ADD `show_locked_labels` integer DEFAULT 1 NOT NULL;
