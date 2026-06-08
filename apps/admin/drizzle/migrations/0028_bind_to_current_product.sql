-- Adds "follow the current PDP product" mode to QB and BXGY widgets.
-- When bind_to_current_product = 1, the widget ignores the bound product_id
-- and uses whichever product the shopper is currently viewing. Enables
-- universal "5/10/15% off at 2/3/5 units" templates that work across the
-- whole catalog without one row per product.
ALTER TABLE quantity_breaks ADD COLUMN bind_to_current_product INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE bxgy_offers ADD COLUMN bind_to_current_product INTEGER NOT NULL DEFAULT 0;
