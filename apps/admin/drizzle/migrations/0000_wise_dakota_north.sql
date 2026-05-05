CREATE TABLE `shops` (
	`id` text PRIMARY KEY NOT NULL,
	`scopes` text NOT NULL,
	`installed_at` integer NOT NULL,
	`uninstalled_at` integer,
	`plan` text DEFAULT 'free' NOT NULL,
	`plan_activated_at` integer,
	`trial_ends_at` integer,
	`shopify_charge_id` text,
	`shopify_discount_id` text,
	`currency` text DEFAULT 'USD' NOT NULL,
	`primary_locale` text DEFAULT 'en' NOT NULL,
	`attributed_revenue_cents` integer DEFAULT 0 NOT NULL
);
