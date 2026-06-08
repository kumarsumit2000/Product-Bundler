-- Roll back from OAuth-based email integrations to the original API-key
-- approach. OAuth proved unworkable inside the Shopify admin iframe — the
-- post-OAuth bounce-back kept 404ing on Shopify Admin's outer chrome
-- regardless of which redirect strategy we tried. API keys are simpler:
-- merchant pastes them once, we encrypt at rest, done. Omnisend stays
-- dropped (no API surface we want to support right now).
--
-- All existing OAuth tokens are intentionally wiped — merchants reconnect
-- via the API-key form. SQLite can't drop columns directly, so use the
-- standard recreate-and-copy pattern.
CREATE TABLE email_integrations_v3 (
  shop_id TEXT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  klaviyo_enabled INTEGER NOT NULL DEFAULT 0,
  klaviyo_api_key_enc TEXT NOT NULL DEFAULT '',
  klaviyo_list_id TEXT NOT NULL DEFAULT '',
  mailchimp_enabled INTEGER NOT NULL DEFAULT 0,
  mailchimp_api_key_enc TEXT NOT NULL DEFAULT '',
  mailchimp_server_prefix TEXT NOT NULL DEFAULT '',
  mailchimp_list_id TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
-- Only the shop_id + timestamp carry over; OAuth tokens + account
-- metadata are intentionally discarded.
INSERT INTO email_integrations_v3 (shop_id, updated_at)
SELECT shop_id, updated_at FROM email_integrations;
--> statement-breakpoint
DROP TABLE email_integrations;
--> statement-breakpoint
ALTER TABLE email_integrations_v3 RENAME TO email_integrations;
