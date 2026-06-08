-- Post-purchase upsell offers. Shown by a Shopify Checkout UI Extension
-- after the customer clicks "Pay now" but before the thank-you page —
-- highest-converting upsell surface in the funnel (5-12% AOV lift per
-- competitor reviews). The extension fetches eligible offers via
-- /api/storefront/post-purchase/:shop, filtered by order total + cart
-- contents. Schema mirrors cart_upsells for UX consistency.
CREATE TABLE post_purchase_offers (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active_start_at INTEGER,
  active_end_at INTEGER,
  product_id TEXT NOT NULL DEFAULT '',
  variant_id TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  discount_type TEXT NOT NULL DEFAULT 'percentage',
  discount_value REAL NOT NULL DEFAULT 0,
  -- Trigger: when this offer should appear
  trigger_type TEXT NOT NULL DEFAULT 'any_order',     -- any_order | min_total | contains_product
  trigger_min_cents INTEGER NOT NULL DEFAULT 0,
  trigger_product_id TEXT NOT NULL DEFAULT '',
  -- Copy
  headline TEXT NOT NULL DEFAULT 'One last offer',
  subtitle TEXT NOT NULL DEFAULT 'Get this discount before you go',
  accept_label TEXT NOT NULL DEFAULT 'Add to my order',
  decline_label TEXT NOT NULL DEFAULT 'No thanks',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX post_purchase_offers_shop_idx ON post_purchase_offers(shop_id);
--> statement-breakpoint
CREATE INDEX post_purchase_offers_shop_status_idx ON post_purchase_offers(shop_id, status);
