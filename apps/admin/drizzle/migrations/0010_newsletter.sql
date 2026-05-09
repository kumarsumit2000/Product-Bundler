CREATE TABLE `newsletter_settings` (
	`shop_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`headline` text DEFAULT 'Get 10% off your first order' NOT NULL,
	`subtitle` text DEFAULT 'Join our newsletter for early access and exclusive deals.' NOT NULL,
	`placeholder` text DEFAULT 'you@email.com' NOT NULL,
	`cta_label` text DEFAULT 'Subscribe' NOT NULL,
	`success_message` text DEFAULT 'Thanks! Check your inbox for the discount code.' NOT NULL,
	`tags` text DEFAULT 'newsletter,prospect' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
