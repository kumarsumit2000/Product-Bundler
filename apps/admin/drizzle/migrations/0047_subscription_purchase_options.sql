-- Subscribe & Save: per-offer display/config for surfacing third-party
-- selling plans. JSON shape SubscriptionConfig (NOT the removed intent shape).
ALTER TABLE bundles ADD COLUMN subscription text;
--> statement-breakpoint
ALTER TABLE quantity_breaks ADD COLUMN subscription text;
--> statement-breakpoint
ALTER TABLE bxgy_offers ADD COLUMN subscription text;
