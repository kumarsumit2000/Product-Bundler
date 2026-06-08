-- Remove the "subscription discount intent" feature. The column held an
-- optional recurring-billing intent (interval + discount %) attached to a
-- bundle or quantity break. The feature is being cut entirely; the storefront
-- widget never consumed it. No indexes/constraints reference these columns.
ALTER TABLE bundles DROP COLUMN subscription;
--> statement-breakpoint
ALTER TABLE quantity_breaks DROP COLUMN subscription;
