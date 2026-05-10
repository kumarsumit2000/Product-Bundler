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

    // Lowest threshold across all active progressive gifts. If the cart's
    // subtotal clears it, free shipping kicks in.
    let mut lowest: Option<u64> = None;
    for pg in config.progressive_gifts.iter().filter(|p| p.status == "active") {
        for t in &pg.shipping_thresholds {
            lowest = Some(lowest.map_or(t.min_spend_cents, |cur| cur.min(t.min_spend_cents)));
        }
    }
    let threshold_cents = match lowest {
        Some(v) => v,
        None => return Ok(no_discount),
    };

    let subtotal_cents = (input.cart().cost().subtotal_amount().amount().as_f64() * 100.0).round() as u64;
    if subtotal_cents < threshold_cents {
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
