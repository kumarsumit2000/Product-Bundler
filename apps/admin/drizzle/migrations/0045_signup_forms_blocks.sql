-- Phase E (visual builder): adds a JSON `blocks` column to signup_forms
-- that holds an ordered list of typed blocks (heading, paragraph,
-- email_input, button, etc) defining the form's visible structure.
--
-- Forms without `blocks` keep working — the storefront renderer falls
-- back to the existing fixed-field layout (headline + subtitle + image +
-- the fields toggled in extras). When `blocks` is non-empty, the
-- renderer iterates the array in order, giving the merchant full
-- control over what appears in what order.
ALTER TABLE signup_forms ADD COLUMN blocks TEXT NOT NULL DEFAULT '[]';
