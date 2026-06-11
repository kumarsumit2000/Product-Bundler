-- Per-QB toggles for the widget Add-to-cart / Buy-now buttons.
ALTER TABLE quantity_breaks ADD COLUMN show_add_to_cart integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE quantity_breaks ADD COLUMN show_buy_now integer NOT NULL DEFAULT 0;
