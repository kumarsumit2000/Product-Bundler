use crate::config::{Bundle, QbTier};

#[derive(Debug, PartialEq)]
pub enum DiscountValue {
    Percentage(f64),
    FixedAmount(f64),
}

pub fn compute_bundle_value(bundle: &Bundle, line_subtotal: f64) -> DiscountValue {
    match bundle.discount_type.as_str() {
        "percentage" => DiscountValue::Percentage(bundle.discount_value),
        "flat" => DiscountValue::FixedAmount(bundle.discount_value),
        "fixed_total" => {
            let off = (line_subtotal - bundle.discount_value).max(0.0);
            DiscountValue::FixedAmount(off)
        }
        _ => DiscountValue::Percentage(0.0),
    }
}

pub fn compute_qb_tier_value(tier: &QbTier, line_amount_per_unit: f64) -> DiscountValue {
    match tier.discount_type.as_str() {
        "percentage" => DiscountValue::Percentage(tier.discount_value),
        "flat" => DiscountValue::FixedAmount(tier.discount_value),
        "fixed_per_unit" => {
            let per_unit_off = (line_amount_per_unit - tier.discount_value).max(0.0);
            DiscountValue::FixedAmount(per_unit_off)
        }
        _ => DiscountValue::Percentage(0.0),
    }
}
