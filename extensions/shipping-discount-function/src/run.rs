use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;
use serde::Deserialize;

// Subset of the shop metafield (`pumper.config`) — only the bits we need to
// decide whether free shipping should be applied. Extra fields in the
// metafield are ignored.
#[derive(Deserialize, Debug, Default)]
struct ShopConfig {
    #[serde(rename = "progressiveGifts", default)]
    progressive_gifts: Vec<ProgressiveGift>,
    #[serde(rename = "quantityBreaks", default)]
    quantity_breaks: Vec<QuantityBreak>,
}

#[derive(Deserialize, Debug)]
struct ProgressiveGift {
    status: String,
    #[serde(rename = "shippingThresholds", default)]
    shipping_thresholds: Vec<ShippingThreshold>,
}

#[derive(Deserialize, Debug)]
struct ShippingThreshold {
    #[serde(rename = "minSpendCents")]
    min_spend_cents: u64,
}

#[derive(Deserialize, Debug)]
struct QuantityBreak {
    status: String,
    #[serde(rename = "productId")]
    product_id: String,
    #[serde(default)]
    tiers: Vec<QbTier>,
}

#[derive(Deserialize, Debug)]
struct QbTier {
    qty: u32,
    #[serde(rename = "freeShipping", default)]
    free_shipping: bool,
}

/// True when the active tier (max qty <= line_qty) has free shipping.
fn active_tier_free_ship(tiers: &[QbTier], line_qty: u32) -> bool {
    tiers.iter()
        .filter(|t| line_qty >= t.qty)
        .max_by_key(|t| t.qty)
        .map(|t| t.free_shipping)
        .unwrap_or(false)
}

#[shopify_function]
fn run(input: schema::run::Input) -> Result<schema::FunctionRunResult> {
    let no_discount = schema::FunctionRunResult { discounts: vec![] };

    let config: ShopConfig = match input.shop().metafield() {
        Some(m) => match serde_json::from_str(m.value()) {
            Ok(c) => c,
            Err(_) => return Ok(no_discount),
        },
        None => return Ok(no_discount),
    };

    // Progressive-gift qualification: lowest threshold across all active
    // progressive gifts. If the cart's subtotal clears it, free shipping kicks in.
    let mut lowest: Option<u64> = None;
    for pg in config.progressive_gifts.iter().filter(|p| p.status == "active") {
        for t in &pg.shipping_thresholds {
            lowest = Some(lowest.map_or(t.min_spend_cents, |cur| cur.min(t.min_spend_cents)));
        }
    }
    let pg_qualifies = match lowest {
        Some(threshold_cents) => {
            let subtotal_cents =
                (input.cart().cost().subtotal_amount().amount().as_f64() * 100.0).round() as u64;
            subtotal_cents >= threshold_cents
        }
        None => false,
    };

    // Quantity-break qualification: any active QB whose product appears in the
    // cart with a line whose active tier (max qty <= line.quantity) has
    // `freeShipping: true`.
    let mut qb_qualifies = false;
    'qb: for qb in config.quantity_breaks.iter().filter(|q| q.status == "active") {
        for line in input.cart().lines() {
            use schema::run::input::cart::lines::Merchandise;
            let variant = match line.merchandise() {
                Merchandise::ProductVariant(pv) => pv,
                _ => continue,
            };
            let product_id = variant.product().id().to_string();
            if product_id != qb.product_id {
                continue;
            }
            let quantity = *line.quantity() as u32;
            if active_tier_free_ship(&qb.tiers, quantity) {
                qb_qualifies = true;
                break 'qb;
            }
        }
    }

    if !(pg_qualifies || qb_qualifies) {
        return Ok(no_discount);
    }

    // Target every delivery option in every delivery group with a 100% off
    // discount. Shopify allocates the value across them.
    let mut targets: Vec<schema::Target> = Vec::new();
    for group in input.cart().delivery_groups() {
        for option in group.delivery_options() {
            targets.push(schema::Target::DeliveryOption(schema::DeliveryOptionTarget {
                handle: option.handle().clone(),
            }));
        }
    }
    if targets.is_empty() {
        return Ok(no_discount);
    }

    let discount = schema::Discount {
        message: Some("Free shipping unlocked".to_string()),
        targets,
        value: schema::Value::Percentage(schema::Percentage {
            value: Decimal(100.0),
        }),
    };

    Ok(schema::FunctionRunResult { discounts: vec![discount] })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tier(qty: u32, fs: bool) -> QbTier { QbTier { qty, free_shipping: fs } }
    #[test]
    fn active_tier_qualifies() {
        let tiers = vec![tier(2, false), tier(5, true)];
        assert!(active_tier_free_ship(&tiers, 5));   // active = qty5 (free ship)
        assert!(active_tier_free_ship(&tiers, 7));   // active = qty5
        assert!(!active_tier_free_ship(&tiers, 4));  // active = qty2 (no free ship)
        assert!(!active_tier_free_ship(&tiers, 1));  // no tier reached
    }
}
