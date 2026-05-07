use discount_function::config::{Bundle, QbTier};
use discount_function::discount::{compute_bundle_value, compute_qb_tier_value, DiscountValue};

fn bundle(discount_type: &str, value: f64) -> Bundle {
    Bundle {
        id: "b".into(),
        name: "B".into(),
        status: "active".into(),
        products: vec![],
        discount_type: discount_type.into(),
        discount_value: value,
        combinable: true,
        trigger_product_ids: vec![],
        headline: None,
        mode: "classic".into(),
        collection_id: None,
        target_qty: None,
    }
}

fn tier(discount_type: &str, value: f64) -> QbTier {
    QbTier {
        qty: 2,
        discount_type: discount_type.into(),
        discount_value: value,
        label: "L".into(),
        is_most_popular: false,
    }
}

#[test]
fn bundle_percentage_returns_pct_value() {
    let b = bundle("percentage", 20.0);
    match compute_bundle_value(&b, 100.0) {
        DiscountValue::Percentage(p) => assert_eq!(p, 20.0),
        _ => panic!("expected Percentage"),
    }
}

#[test]
fn bundle_flat_returns_fixed_amount() {
    let b = bundle("flat", 5.0);
    match compute_bundle_value(&b, 100.0) {
        DiscountValue::FixedAmount(a) => assert_eq!(a, 5.0),
        _ => panic!("expected FixedAmount"),
    }
}

#[test]
fn bundle_fixed_total_returns_subtotal_minus_target() {
    let b = bundle("fixed_total", 30.0);
    match compute_bundle_value(&b, 100.0) {
        DiscountValue::FixedAmount(off) => assert_eq!(off, 70.0),
        _ => panic!("expected FixedAmount"),
    }
}

#[test]
fn bundle_fixed_total_clamps_to_zero_when_target_exceeds_subtotal() {
    let b = bundle("fixed_total", 200.0);
    match compute_bundle_value(&b, 100.0) {
        DiscountValue::FixedAmount(off) => assert_eq!(off, 0.0),
        _ => panic!("expected FixedAmount"),
    }
}

#[test]
fn bundle_unknown_type_returns_zero_percentage() {
    let b = bundle("bogus", 50.0);
    match compute_bundle_value(&b, 100.0) {
        DiscountValue::Percentage(p) => assert_eq!(p, 0.0),
        _ => panic!("expected Percentage"),
    }
}

#[test]
fn qb_percentage_tier() {
    let t = tier("percentage", 15.0);
    match compute_qb_tier_value(&t, 50.0) {
        DiscountValue::Percentage(p) => assert_eq!(p, 15.0),
        _ => panic!("expected Percentage"),
    }
}

#[test]
fn qb_flat_tier() {
    let t = tier("flat", 5.0);
    match compute_qb_tier_value(&t, 50.0) {
        DiscountValue::FixedAmount(a) => assert_eq!(a, 5.0),
        _ => panic!("expected FixedAmount"),
    }
}

#[test]
fn qb_fixed_per_unit_returns_per_unit_offset() {
    let t = tier("fixed_per_unit", 18.0);
    match compute_qb_tier_value(&t, 25.0) {
        DiscountValue::FixedAmount(off) => assert_eq!(off, 7.0),
        _ => panic!("expected FixedAmount"),
    }
}

#[test]
fn qb_fixed_per_unit_clamps_to_zero() {
    let t = tier("fixed_per_unit", 100.0);
    match compute_qb_tier_value(&t, 25.0) {
        DiscountValue::FixedAmount(off) => assert_eq!(off, 0.0),
        _ => panic!("expected FixedAmount"),
    }
}
