-- One-shot data move from newsletter_campaigns into the new signup_forms
-- table. Each campaign becomes a single form whose type is derived from
-- popup_enabled: any campaign that had popup_enabled=1 lands as a popup,
-- everything else as embedded. Image config carries straight over (the
-- old `popup_image_url` was already shared between inline and popup, so
-- semantics are preserved).
--
-- The newsletter_campaigns table is intentionally left in place — the
-- application code stops referencing it after this migration, but the
-- data sticks around so a rollback (or a sanity check) is still possible.
INSERT INTO signup_forms (
  id, shop_id, name, type, status, priority,
  active_start_at, active_end_at,
  headline, subtitle, placeholder, cta_label, success_message, tags,
  image_url, image_position,
  audience_logged_in, audience_cart_state, audience_page, audience_url_pattern,
  popup_trigger, popup_delay_seconds, popup_scroll_percent,
  popup_frequency_days, popup_excluded_paths,
  flyout_position, flyout_animation, styling, extras,
  created_at, updated_at
)
SELECT
  id, shop_id, name,
  CASE WHEN popup_enabled = 1 THEN 'popup' ELSE 'embedded' END,
  status, sort_order,
  active_start_at, active_end_at,
  headline, subtitle, placeholder, cta_label, success_message, tags,
  popup_image_url, popup_image_position,
  audience_logged_in, audience_cart_state, audience_page, audience_url_pattern,
  popup_trigger, popup_delay_seconds, popup_scroll_percent,
  popup_frequency_days, excluded_paths,
  'bottom-right', 'slide', '{}', '{}',
  created_at, updated_at
FROM newsletter_campaigns;
