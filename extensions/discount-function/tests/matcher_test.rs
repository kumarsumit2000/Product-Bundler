use discount_function::config::{Bundle, BundleProduct, QbTier, QuantityBreak};
use discount_function::matcher::{match_bundle, match_mix_match_bundle, match_qb_tier, CartLine};

fn line(id: &str, product: &str, variant: Option<&str>, qty: u32) -> CartLine {
    CartLine {
        id: id.into(),
        product_id: product.into(),
        variant_id: variant.map(String::from),
        quantity: qty,
        bundle_attr: None,
        gift_attr: None,
    }
}

fn bundle(products: Vec<BundleProduct>) -> Bundle {
    Bundle {
        id: "b1".into(),
        name: "B".into(),
        status: "active".into(),
        products,
        discount_type: "percentage".into(),
        discount_value: 20.0,
        combinable: true,
        trigger_product_ids: vec![],
        headline: None,
        mode: "classic".into(),
        collection_id: None,
        target_qty: None,
    }
}

fn line_with_attr(id: &str, product: &str, qty: u32, attr: Option<&str>) -> CartLine {
    CartLine {
        id: id.into(),
        product_id: product.into(),
        variant_id: None,
        quantity: qty,
        bundle_attr: attr.map(String::from),
        gift_attr: None,
    }
}

fn mm_bundle(target_qty: u32) -> Bundle {
    let mut b = bundle(vec![]);
    b.mode = "mix_match".into();
    b.collection_id = Some("gid://shopify/Collection/1".into());
    b.target_qty = Some(target_qty);
    b
}

fn bp(product: &str, variant: Option<&str>, qty: u32) -> BundleProduct {
    BundleProduct {
        product_id: product.into(),
        variant_id: variant.map(String::from),
        qty,
    }
}

#[test]
fn match_bundle_returns_targets_when_all_products_in_cart() {
    let lines = vec![
        line("L1", "P1", None, 1),
        line("L2", "P2", None, 1),
    ];
    let b = bundle(vec![bp("P1", None, 1), bp("P2", None, 1)]);
    let result = match_bundle(&lines, &b);
    assert_eq!(result, Some(vec!["L1".into(), "L2".into()]));
}

#[test]
fn match_bundle_returns_none_when_one_product_missing() {
    let lines = vec![line("L1", "P1", None, 1)];
    let b = bundle(vec![bp("P1", None, 1), bp("P2", None, 1)]);
    assert!(match_bundle(&lines, &b).is_none());
}

#[test]
fn match_bundle_requires_specific_variant_when_set() {
    let lines = vec![
        line("L1", "P1", Some("V_other"), 1),
        line("L2", "P2", None, 1),
    ];
    let b = bundle(vec![
        bp("P1", Some("V_required"), 1),
        bp("P2", None, 1),
    ]);
    assert!(match_bundle(&lines, &b).is_none());
}

#[test]
fn match_bundle_accepts_any_variant_when_required_variant_is_null() {
    let lines = vec![
        line("L1", "P1", Some("V_anything"), 1),
        line("L2", "P2", None, 1),
    ];
    let b = bundle(vec![bp("P1", None, 1), bp("P2", None, 1)]);
    assert!(match_bundle(&lines, &b).is_some());
}

#[test]
fn match_bundle_requires_minimum_qty_per_product() {
    let lines = vec![
        line("L1", "P1", None, 1),
        line("L2", "P2", None, 1),
    ];
    let b = bundle(vec![bp("P1", None, 2), bp("P2", None, 1)]);
    assert!(match_bundle(&lines, &b).is_none());
}

#[test]
fn match_qb_tier_returns_highest_satisfied_tier() {
    let qb = QuantityBreak {
        id: "q".into(),
        name: "Q".into(),
        status: "active".into(),
        product_id: "P1".into(),
        tiers: vec![
            QbTier {
                qty: 1,
                discount_type: "percentage".into(),
                discount_value: 0.0,
                label: "1".into(),
                is_most_popular: false,
                free_gift_variant_id: None,
                bogo: None,
                price_rounding: None,
            },
            QbTier {
                qty: 2,
                discount_type: "percentage".into(),
                discount_value: 10.0,
                label: "2".into(),
                is_most_popular: false,
                free_gift_variant_id: None,
                bogo: None,
                price_rounding: None,
            },
            QbTier {
                qty: 3,
                discount_type: "percentage".into(),
                discount_value: 15.0,
                label: "3".into(),
                is_most_popular: true,
                free_gift_variant_id: None,
                bogo: None,
                price_rounding: None,
            },
        ],
        combinable: true,
    };
    let l = line("L", "P1", None, 3);
    let tier = match_qb_tier(&l, &qb).unwrap();
    assert_eq!(tier.qty, 3);
}

#[test]
fn match_qb_tier_returns_none_for_wrong_product() {
    let qb = QuantityBreak {
        id: "q".into(),
        name: "Q".into(),
        status: "active".into(),
        product_id: "P1".into(),
        tiers: vec![QbTier {
            qty: 1,
            discount_type: "percentage".into(),
            discount_value: 0.0,
            label: "1".into(),
            is_most_popular: false,
            free_gift_variant_id: None,
            bogo: None,
            price_rounding: None,
        }],
        combinable: true,
    };
    let l = line("L", "P_OTHER", None, 5);
    assert!(match_qb_tier(&l, &qb).is_none());
}

#[test]
fn match_qb_tier_returns_none_when_qty_below_lowest_tier() {
    let qb = QuantityBreak {
        id: "q".into(),
        name: "Q".into(),
        status: "active".into(),
        product_id: "P1".into(),
        tiers: vec![QbTier {
            qty: 5,
            discount_type: "percentage".into(),
            discount_value: 10.0,
            label: "5".into(),
            is_most_popular: false,
            free_gift_variant_id: None,
            bogo: None,
            price_rounding: None,
        }],
        combinable: true,
    };
    let l = line("L", "P1", None, 3);
    assert!(match_qb_tier(&l, &qb).is_none());
}

#[test]
fn match_mix_match_returns_targets_when_total_qty_meets_target() {
    let lines = vec![
        line_with_attr("L1", "P1", 2, Some("b1")),
        line_with_attr("L2", "P2", 1, Some("b1")),
    ];
    let b = mm_bundle(3);
    let result = match_mix_match_bundle(&lines, &b);
    assert_eq!(result, Some(vec!["L1".into(), "L2".into()]));
}

#[test]
fn match_mix_match_returns_none_when_total_qty_below_target() {
    let lines = vec![
        line_with_attr("L1", "P1", 1, Some("b1")),
    ];
    let b = mm_bundle(3);
    assert!(match_mix_match_bundle(&lines, &b).is_none());
}

#[test]
fn match_mix_match_ignores_lines_with_wrong_attr() {
    let lines = vec![
        line_with_attr("L1", "P1", 5, Some("other_bundle")),
        line_with_attr("L2", "P2", 5, None),
    ];
    let b = mm_bundle(3);
    assert!(match_mix_match_bundle(&lines, &b).is_none());
}

#[test]
fn match_mix_match_returns_none_for_classic_bundles() {
    let lines = vec![
        line_with_attr("L1", "P1", 5, Some("b1")),
    ];
    let b = bundle(vec![]); // mode="classic"
    assert!(match_mix_match_bundle(&lines, &b).is_none());
}
