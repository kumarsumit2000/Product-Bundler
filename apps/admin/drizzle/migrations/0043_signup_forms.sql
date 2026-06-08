-- Unified "signup_forms" table replacing newsletter_campaigns. Each row is
-- ONE form with a single, explicit type: embedded (in-page inline form),
-- popup (modal overlay), or flyout (small fixed-corner card). Merging
-- inline + popup config into one row was the root cause of multiple
-- confusing bugs ("popup checkbox hides image", "two forms render at
-- once", "campaign with no popup blocks campaign with popup", etc).
--
-- Styling + extras live in JSON columns so Phase 4/5 features (Klaviyo-
-- style colors/fonts/sizes, countdown, coupon, signup counter, custom
-- form fields) can be added without further migrations.
CREATE TABLE signup_forms (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled signup form',
  -- type: embedded | popup | flyout
  type TEXT NOT NULL DEFAULT 'embedded',
  status TEXT NOT NULL DEFAULT 'draft',
  -- Lower priority sorts first when multiple forms of the same type match
  -- the same visitor — drives "which popup do we show this person" logic.
  priority INTEGER NOT NULL DEFAULT 0,
  active_start_at INTEGER,
  active_end_at INTEGER,
  -- Copy
  headline TEXT NOT NULL DEFAULT 'Get 10% off your first order',
  subtitle TEXT NOT NULL DEFAULT 'Join our newsletter for early access.',
  placeholder TEXT NOT NULL DEFAULT 'you@email.com',
  cta_label TEXT NOT NULL DEFAULT 'Subscribe',
  success_message TEXT NOT NULL DEFAULT 'Thanks! Check your inbox.',
  tags TEXT NOT NULL DEFAULT 'newsletter,prospect',
  -- Image
  image_url TEXT NOT NULL DEFAULT '',
  image_position TEXT NOT NULL DEFAULT 'none',
  -- Audience
  audience_logged_in TEXT NOT NULL DEFAULT 'any',
  audience_cart_state TEXT NOT NULL DEFAULT 'any',
  audience_page TEXT NOT NULL DEFAULT 'any',
  audience_url_pattern TEXT NOT NULL DEFAULT '',
  -- Popup config (type='popup' only; ignored for others)
  popup_trigger TEXT NOT NULL DEFAULT 'delay',
  popup_delay_seconds INTEGER NOT NULL DEFAULT 5,
  popup_scroll_percent INTEGER NOT NULL DEFAULT 50,
  popup_frequency_days INTEGER NOT NULL DEFAULT 7,
  popup_excluded_paths TEXT NOT NULL DEFAULT '',
  -- Flyout config (type='flyout' only)
  flyout_position TEXT NOT NULL DEFAULT 'bottom-right',
  flyout_animation TEXT NOT NULL DEFAULT 'slide',
  -- Klaviyo-style styling. JSON because we keep adding properties — kept
  -- as a serialized blob to avoid 30 new columns and migrations every
  -- time the merchant asks for a new colour picker.
  styling TEXT NOT NULL DEFAULT '{}',
  -- Extras: countdown, signup_counter, coupon code, custom form fields.
  extras TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX signup_forms_shop_status_idx ON signup_forms(shop_id, status);
--> statement-breakpoint
CREATE INDEX signup_forms_shop_type_idx ON signup_forms(shop_id, type);
