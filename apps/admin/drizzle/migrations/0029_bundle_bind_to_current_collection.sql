-- Mix & match bundle counterpart to QB/BXGY bind_to_current_product: when on,
-- the widget pulls items from whichever collection the current PDP product
-- belongs to (its primary collection), instead of a hardcoded collection_id.
-- Enables universal "Pick any 3 from this product's collection" templates.
ALTER TABLE bundles ADD COLUMN bind_to_current_collection INTEGER NOT NULL DEFAULT 0;
