-- Storefront event counters aggregated into bundle_daily.
ALTER TABLE bundle_daily ADD COLUMN impression_count INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE bundle_daily ADD COLUMN click_count INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE bundle_daily ADD COLUMN atc_count INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE event_aggregation_state (
  shop_id TEXT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  last_aggregated_ts INTEGER NOT NULL DEFAULT 0
);
