use crate::config::{Bundle, QbTier};

#[derive(Debug, PartialEq)]
pub enum DiscountValue {
    Percentage(f64),
    FixedAmount(f64),
    FixedAmountPerItem(f64),
}

/// Round a price (cents) to the nearest value whose cents-part == ending (0..=99).
/// Nearest wins, ties to lower, never < 0. Mirrors the widget's roundCharmCents.
pub fn round_charm_cents(price_cents: i64, ending: u32) -> i64 {
    let ending = ending as i64;
    let dollars = price_cents.div_euclid(100);
    let candidates = [(dollars - 1) * 100 + ending, dollars * 100 + ending, (dollars + 1) * 100 + ending];
    candidates.iter().copied().filter(|c| *c >= 0)
        .min_by_key(|c| (*c - price_cents).abs())
        .unwrap_or(0)
}

/// Discounted unit price in cents BEFORE charm rounding — matches the widget's
/// tierUnitCents exactly.
fn discounted_unit_cents(tier: &QbTier, base_cents: i64) -> i64 {
    match tier.discount_type.as_str() {
        "percentage" => ((base_cents as f64) * (1.0 - tier.discount_value / 100.0)).round() as i64,
        "flat" => (base_cents - (tier.discount_value * 100.0).round() as i64).max(0),
        "fixed_per_unit" => ((tier.discount_value * 100.0).round() as i64).max(0),
        _ => base_cents,
    }
}

/// Per-item FixedAmount (in dollars) to land the unit on the charm price.
/// Clamped >= 0 so checkout never upcharges.
pub fn rounded_per_item_off(tier: &QbTier, line_amount_per_unit: f64, ending: u32) -> f64 {
    let base_cents = (line_amount_per_unit * 100.0).round() as i64;
    let target = round_charm_cents(discounted_unit_cents(tier, base_cents), ending);
    ((base_cents - target).max(0)) as f64 / 100.0
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
    if let Some(bogo) = &tier.bogo {
        if bogo.mode == "nth_free" && bogo.bonus_qty > 0 && bogo.bonus_qty < tier.qty {
            let pct = (bogo.bonus_qty as f64 / tier.qty as f64) * 100.0;
            return DiscountValue::Percentage(pct);
        }
    }
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

#[cfg(test)]
mod charm_tests {
    use super::*;
    #[test]
    fn rounds_nearest() {
        assert_eq!(round_charm_cents(1996, 99), 1999);
        assert_eq!(round_charm_cents(1940, 99), 1899);
        assert_eq!(round_charm_cents(1996, 0), 2000);
    }
    #[test]
    fn per_item_off_lands_on_charm() {
        // base $24.95, percentage 20 → discounted 1996 → charm 1999 → off = 2495-1999 = 4.96
        let tier = QbTier {
            qty: 2,
            discount_type: "percentage".into(),
            discount_value: 20.0,
            label: String::new(),
            is_most_popular: false,
            free_gift_variant_id: None,
            bogo: None,
            price_rounding: Some(99),
        };
        assert!((rounded_per_item_off(&tier, 24.95, 99) - 4.96).abs() < 1e-6);
    }
}
