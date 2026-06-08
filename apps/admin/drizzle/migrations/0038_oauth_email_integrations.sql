-- Replace API-key-based email integrations with OAuth-based ones.
-- Drops Omnisend entirely (no public OAuth support), drops legacy API key
-- columns, and adds OAuth access/refresh tokens (encrypted) plus metadata
-- captured during the OAuth flow (account name, Mailchimp server prefix).
-- "Enabled" is implicit: a row with a non-empty access_token_enc is connected.
--
-- SQLite can't ALTER TABLE DROP COLUMN cleanly, so use the standard
-- recreate-and-copy pattern. Existing API keys are intentionally wiped
-- (per session decision) — merchants reconnect via OAuth on next visit.
CREATE TABLE email_integrations_v2 (
  shop_id TEXT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  klaviyo_access_token_enc TEXT NOT NULL DEFAULT '',
  klaviyo_refresh_token_enc TEXT NOT NULL DEFAULT '',
  klaviyo_token_expires_at INTEGER NOT NULL DEFAULT 0,
  klaviyo_account_id TEXT NOT NULL DEFAULT '',
  klaviyo_account_name TEXT NOT NULL DEFAULT '',
  klaviyo_list_id TEXT NOT NULL DEFAULT '',
  mailchimp_access_token_enc TEXT NOT NULL DEFAULT '',
  mailchimp_server_prefix TEXT NOT NULL DEFAULT '',
  mailchimp_account_id TEXT NOT NULL DEFAULT '',
  mailchimp_account_name TEXT NOT NULL DEFAULT '',
  mailchimp_list_id TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
-- Copy only the shop_id + timestamp from the old rows. All API keys are
-- intentionally discarded — merchants reconnect via OAuth.
INSERT INTO email_integrations_v2 (shop_id, updated_at)
SELECT shop_id, updated_at FROM email_integrations;
--> statement-breakpoint
DROP TABLE email_integrations;
--> statement-breakpoint
ALTER TABLE email_integrations_v2 RENAME TO email_integrations;
