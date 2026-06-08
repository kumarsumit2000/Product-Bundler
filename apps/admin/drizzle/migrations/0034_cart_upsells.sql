-- Cart-page upsell widget: a small "add this discounted product" card the
-- merchant places on the cart page or in their cart drawer (via shortcode).
-- Shows the first matching active offer when cart has items. Future versions
-- will add richer trigger rules (cart contains X, min subtotal, etc).
CREATE TABLE cart_upsells (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active_start_at INTEGER,
  active_end_at INTEGER,
  -- The product the merchant wants to upsell
  product_id TEXT NOT NULL DEFAULT '',
  variant_id TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  -- Discount applied to the recommended product
  discount_type TEXT NOT NULL DEFAULT 'percentage',  -- percentage | flat
  discount_value REAL NOT NULL DEFAULT 0,
  -- Trigger: when this widget should show. v1 supports only "any items in cart".
  trigger_type TEXT NOT NULL DEFAULT 'any_cart',     -- any_cart | min_subtotal | contains_product
  trigger_min_cents INTEGER NOT NULL DEFAULT 0,
  trigger_product_id TEXT NOT NULL DEFAULT '',
  -- Copy + styling
  headline TEXT NOT NULL DEFAULT 'You might also like',
  subtitle TEXT NOT NULL DEFAULT '',
  cta_label TEXT NOT NULL DEFAULT 'Add to cart',
  style_overrides TEXT,   -- JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX cart_upsells_shop_idx ON cart_upsells(shop_id);
--> statement-breakpoint
CREATE INDEX cart_upsells_shop_status_idx ON cart_upsells(shop_id, status);
