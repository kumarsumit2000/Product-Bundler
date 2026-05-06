use discount_function::config::{Bundle, BundleProduct, QbTier, QuantityBreak};
use discount_function::matcher::{match_bundle, match_qb_tier, CartLine};

fn line(id: &str, product: &str, variant: Option<&str>, qty: u32) -> CartLine {
    CartLine {
        id: id.into(),
        product_id: product.into(),
        variant_id: variant.map(String::from),
        quantity: qty,
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
    }
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
            },
            QbTier {
                qty: 2,
                discount_type: "percentage".into(),
                discount_value: 10.0,
                label: "2".into(),
                is_most_popular: false,
            },
            QbTier {
                qty: 3,
                discount_type: "percentage".into(),
                discount_value: 15.0,
                label: "3".into(),
                is_most_popular: true,
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
        }],
        combinable: true,
    };
    let l = line("L", "P1", None, 3);
    assert!(match_qb_tier(&l, &qb).is_none());
}
