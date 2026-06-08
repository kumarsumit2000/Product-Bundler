-- Add Brevo, ActiveCampaign, ConvertKit, HubSpot, and SendGrid to the
-- API-key-based email integrations. Each follows the same pattern as
-- Klaviyo / Mailchimp / Omnisend: enabled boolean, encrypted API key,
-- platform-specific extras (list/form IDs, account-URL for ActiveCampaign).
-- HubSpot needs only a Private App access token — list membership is
-- managed via HubSpot workflows on contact properties.
ALTER TABLE email_integrations ADD COLUMN brevo_enabled INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN brevo_api_key_enc TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN brevo_list_id TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN activecampaign_enabled INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN activecampaign_api_key_enc TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
-- ActiveCampaign accounts have unique base URLs (e.g.
-- https://account.api-us1.com) — the merchant copies this from
-- Settings → Developer alongside the API key.
ALTER TABLE email_integrations ADD COLUMN activecampaign_api_url TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN activecampaign_list_id TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN convertkit_enabled INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN convertkit_api_key_enc TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
-- ConvertKit (now "Kit") subscriptions target a Form, not a List —
-- form_id is the destination.
ALTER TABLE email_integrations ADD COLUMN convertkit_form_id TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN hubspot_enabled INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN hubspot_api_key_enc TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN sendgrid_enabled INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN sendgrid_api_key_enc TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
-- SendGrid Marketing list IDs are UUIDs.
ALTER TABLE email_integrations ADD COLUMN sendgrid_list_id TEXT NOT NULL DEFAULT '';
