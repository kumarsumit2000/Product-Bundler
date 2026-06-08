-- Scheduling for bundles / QB / BXGY: optional start + end timestamps so
-- merchants can run seasonal campaigns without manually toggling status.
ALTER TABLE bundles ADD COLUMN active_start_at INTEGER;
--> statement-breakpoint
ALTER TABLE bundles ADD COLUMN active_end_at INTEGER;
--> statement-breakpoint
ALTER TABLE quantity_breaks ADD COLUMN active_start_at INTEGER;
--> statement-breakpoint
ALTER TABLE quantity_breaks ADD COLUMN active_end_at INTEGER;
--> statement-breakpoint
ALTER TABLE bxgy_offers ADD COLUMN active_start_at INTEGER;
--> statement-breakpoint
ALTER TABLE bxgy_offers ADD COLUMN active_end_at INTEGER;
