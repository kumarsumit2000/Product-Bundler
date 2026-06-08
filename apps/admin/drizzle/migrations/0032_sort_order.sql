-- Tiebreaker when multiple widgets target the same PDP. Lower numbers win.
ALTER TABLE bundles ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE quantity_breaks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE bxgy_offers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
