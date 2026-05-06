use discount_function::config::Config;

#[test]
fn deserializes_empty_config() {
    let json = r#"{"schemaVersion":1,"bundles":[],"quantityBreaks":[]}"#;
    let config: Config = serde_json::from_str(json).unwrap();
    assert_eq!(config.schema_version, 1);
    assert!(config.bundles.is_empty());
    assert!(config.quantity_breaks.is_empty());
}

#[test]
fn deserializes_bundle_with_two_products() {
    let json = r#"{
        "schemaVersion": 1,
        "bundles": [{
            "id": "abc",
            "name": "Test",
            "status": "active",
            "products": [
                {"productId": "gid://shopify/Product/1", "variantId": null, "qty": 2},
                {"productId": "gid://shopify/Product/2", "variantId": "gid://shopify/ProductVariant/9", "qty": 1}
            ],
            "discountType": "percentage",
            "discountValue": 20.0,
            "combinable": true,
            "triggerProductIds": [],
            "headline": "Save 20%"
        }],
        "quantityBreaks": []
    }"#;
    let config: Config = serde_json::from_str(json).unwrap();
    assert_eq!(config.bundles.len(), 1);
    let b = &config.bundles[0];
    assert_eq!(b.id, "abc");
    assert_eq!(b.products.len(), 2);
    assert_eq!(b.products[0].qty, 2);
    assert!(b.products[0].variant_id.is_none());
    assert_eq!(
        b.products[1].variant_id.as_deref(),
        Some("gid://shopify/ProductVariant/9")
    );
    assert!(b.combinable);
    assert_eq!(b.discount_value, 20.0);
}

#[test]
fn deserializes_qb_with_three_tiers() {
    let json = r#"{
        "schemaVersion": 1,
        "bundles": [],
        "quantityBreaks": [{
            "id": "qb1",
            "name": "Tiered",
            "status": "active",
            "productId": "gid://shopify/Product/5",
            "tiers": [
                {"qty": 1, "discountType": "percentage", "discountValue": 0, "label": "Buy 1", "isMostPopular": false},
                {"qty": 2, "discountType": "percentage", "discountValue": 10, "label": "10% off", "isMostPopular": false},
                {"qty": 3, "discountType": "percentage", "discountValue": 15, "label": "15% off", "isMostPopular": true}
            ],
            "combinable": false
        }]
    }"#;
    let config: Config = serde_json::from_str(json).unwrap();
    assert_eq!(config.quantity_breaks.len(), 1);
    let qb = &config.quantity_breaks[0];
    assert_eq!(qb.tiers.len(), 3);
    assert_eq!(qb.tiers[2].discount_value, 15.0);
    assert!(qb.tiers[2].is_most_popular);
    assert!(!qb.combinable);
}
