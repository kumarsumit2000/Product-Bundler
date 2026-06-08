-- Add Omnisend (popular for Shopify merchants) to the API-key-based
-- email integrations. Same shape as the existing platforms: encrypted
-- API key + enabled toggle. No list ID column — Omnisend's contacts API
-- doesn't require a list reference at create time; lists are managed in
-- the Omnisend UI and contacts get tagged from there.
ALTER TABLE email_integrations ADD COLUMN omnisend_enabled INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE email_integrations ADD COLUMN omnisend_api_key_enc TEXT NOT NULL DEFAULT '';
