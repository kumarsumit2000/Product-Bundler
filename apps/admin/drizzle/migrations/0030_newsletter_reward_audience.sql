-- Phase 1 of the campaign system: post-signup reward (static discount code
-- + Copy button shown to the subscriber on success) and three audience
-- filters that gate whether the form even renders to a given visitor.
-- All flags default to "off" / "any" so existing rows behave unchanged.
ALTER TABLE newsletter_settings ADD COLUMN reward_enabled INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE newsletter_settings ADD COLUMN reward_code TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE newsletter_settings ADD COLUMN reward_headline TEXT NOT NULL DEFAULT 'Use this code at checkout';
--> statement-breakpoint
ALTER TABLE newsletter_settings ADD COLUMN reward_image_url TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE newsletter_settings ADD COLUMN reward_copy_label TEXT NOT NULL DEFAULT 'Copy';
--> statement-breakpoint
ALTER TABLE newsletter_settings ADD COLUMN audience_logged_in TEXT NOT NULL DEFAULT 'any';
--> statement-breakpoint
ALTER TABLE newsletter_settings ADD COLUMN audience_cart_state TEXT NOT NULL DEFAULT 'any';
--> statement-breakpoint
ALTER TABLE newsletter_settings ADD COLUMN audience_page TEXT NOT NULL DEFAULT 'any';
--> statement-breakpoint
ALTER TABLE newsletter_settings ADD COLUMN audience_url_pattern TEXT NOT NULL DEFAULT '';
