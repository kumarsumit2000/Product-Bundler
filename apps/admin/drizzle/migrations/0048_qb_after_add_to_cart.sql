-- QB editor Phase D: per-QB "after add to cart" behavior.
-- Controls what happens once a customer adds a quantity-break offer to cart:
--   drawer   -> open the cart drawer (current behavior, default — no regression)
--   cart     -> redirect to the /cart page
--   checkout -> redirect straight to checkout
ALTER TABLE quantity_breaks ADD COLUMN after_add_to_cart text NOT NULL DEFAULT 'drawer';
