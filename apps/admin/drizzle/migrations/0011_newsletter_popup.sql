ALTER TABLE `newsletter_settings` ADD `popup_enabled` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `newsletter_settings` ADD `popup_trigger` text DEFAULT 'delay' NOT NULL;
--> statement-breakpoint
ALTER TABLE `newsletter_settings` ADD `popup_delay_seconds` integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE `newsletter_settings` ADD `popup_scroll_percent` integer DEFAULT 50 NOT NULL;
--> statement-breakpoint
ALTER TABLE `newsletter_settings` ADD `popup_frequency_days` integer DEFAULT 7 NOT NULL;
--> statement-breakpoint
ALTER TABLE `newsletter_settings` ADD `excluded_paths` text DEFAULT '' NOT NULL;
