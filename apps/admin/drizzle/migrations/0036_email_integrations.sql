-- Per-shop email service integrations. When a customer signs up via any
-- newsletter (campaign or legacy), we forward the email to whichever ESPs
-- the merchant has configured. API keys stored encrypted at rest via
-- DATABASE_ENCRYPTION_KEY — the worker decrypts on demand.
CREATE TABLE email_integrations (
  shop_id TEXT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  klaviyo_enabled INTEGER NOT NULL DEFAULT 0,
  klaviyo_api_key_enc TEXT NOT NULL DEFAULT '',
  klaviyo_list_id TEXT NOT NULL DEFAULT '',
  mailchimp_enabled INTEGER NOT NULL DEFAULT 0,
  mailchimp_api_key_enc TEXT NOT NULL DEFAULT '',
  mailchimp_server_prefix TEXT NOT NULL DEFAULT '',
  mailchimp_list_id TEXT NOT NULL DEFAULT '',
  omnisend_enabled INTEGER NOT NULL DEFAULT 0,
  omnisend_api_key_enc TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
