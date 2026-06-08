-- "Test connection" feature: per-platform timestamp (unix seconds) the
-- merchant last successfully pushed a test contact via that ESP. The
-- admin form shows a "Verified" badge when > 0. Any API-key change for a
-- platform resets its verified_at to 0 (handled in the action, not here).
ALTER TABLE email_integrations ADD COLUMN klaviyo_verified_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN mailchimp_verified_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN omnisend_verified_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN brevo_verified_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN activecampaign_verified_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN convertkit_verified_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN hubspot_verified_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN sendgrid_verified_at INTEGER NOT NULL DEFAULT 0;
