-- Phase 2: multi-campaign newsletter system. The single-row
-- newsletter_settings table becomes the canonical "global default" and
-- newsletter_campaigns holds one row per campaign with its own copy,
-- audience, triggers, and reward. We keep newsletter_settings intact for
-- one release so the legacy single-form code path keeps working while the
-- widget transitions to iterating the campaigns array.
CREATE TABLE newsletter_campaigns (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                          -- internal name shown in admin list
  status TEXT NOT NULL DEFAULT 'draft',         -- draft | active | paused
  sort_order INTEGER NOT NULL DEFAULT 0,        -- tiebreaker when multiple campaigns match
  active_start_at INTEGER,                      -- nullable unix timestamp
  active_end_at INTEGER,
  -- Copy
  headline TEXT NOT NULL DEFAULT 'Get 10% off your first order',
  subtitle TEXT NOT NULL DEFAULT 'Join our newsletter for early access and exclusive deals.',
  placeholder TEXT NOT NULL DEFAULT 'you@email.com',
  cta_label TEXT NOT NULL DEFAULT 'Subscribe',
  success_message TEXT NOT NULL DEFAULT 'Thanks! Check your inbox for the discount code.',
  tags TEXT NOT NULL DEFAULT 'newsletter,prospect',
  -- Popup
  popup_enabled INTEGER NOT NULL DEFAULT 0,
  popup_trigger TEXT NOT NULL DEFAULT 'delay',
  popup_delay_seconds INTEGER NOT NULL DEFAULT 5,
  popup_scroll_percent INTEGER NOT NULL DEFAULT 50,
  popup_frequency_days INTEGER NOT NULL DEFAULT 7,
  popup_image_url TEXT NOT NULL DEFAULT '',
  popup_image_position TEXT NOT NULL DEFAULT 'none',
  excluded_paths TEXT NOT NULL DEFAULT '',
  style_overrides TEXT,                         -- JSON
  -- Reward
  reward_enabled INTEGER NOT NULL DEFAULT 0,
  reward_code TEXT NOT NULL DEFAULT '',
  reward_headline TEXT NOT NULL DEFAULT 'Use this code at checkout',
  reward_image_url TEXT NOT NULL DEFAULT '',
  reward_copy_label TEXT NOT NULL DEFAULT 'Copy',
  -- Audience
  audience_logged_in TEXT NOT NULL DEFAULT 'any',
  audience_cart_state TEXT NOT NULL DEFAULT 'any',
  audience_page TEXT NOT NULL DEFAULT 'any',
  audience_url_pattern TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX newsletter_campaigns_shop_idx ON newsletter_campaigns(shop_id);
--> statement-breakpoint
CREATE INDEX newsletter_campaigns_shop_status_idx ON newsletter_campaigns(shop_id, status);
--> statement-breakpoint

-- Data migration: copy each shop's existing newsletter_settings row into a
-- default campaign so merchants already using Phase 1 don't lose their
-- config. The single-table flow keeps working alongside this new table
-- until the widget migration completes.
INSERT INTO newsletter_campaigns (
  id, shop_id, name, status, sort_order, active_start_at, active_end_at,
  headline, subtitle, placeholder, cta_label, success_message, tags,
  popup_enabled, popup_trigger, popup_delay_seconds, popup_scroll_percent,
  popup_frequency_days, popup_image_url, popup_image_position, excluded_paths,
  style_overrides,
  reward_enabled, reward_code, reward_headline, reward_image_url, reward_copy_label,
  audience_logged_in, audience_cart_state, audience_page, audience_url_pattern,
  created_at, updated_at
)
SELECT
  lower(hex(randomblob(16))),                              -- generated id
  shop_id,
  'Default newsletter',                                     -- name
  CASE WHEN enabled = 1 THEN 'active' ELSE 'draft' END,    -- status
  0,                                                        -- sort_order
  NULL, NULL,                                               -- active dates
  headline, subtitle, placeholder, cta_label, success_message, tags,
  popup_enabled, popup_trigger, popup_delay_seconds, popup_scroll_percent,
  popup_frequency_days, popup_image_url, popup_image_position, excluded_paths,
  style_overrides,
  reward_enabled, reward_code, reward_headline, reward_image_url, reward_copy_label,
  audience_logged_in, audience_cart_state, audience_page, audience_url_pattern,
  unixepoch(), unixepoch()
FROM newsletter_settings;
