use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;
use crate::config::Config;
use crate::matcher::{self, CartLine};
use crate::discount::{self, DiscountValue};

#[derive(Deserialize, Default)]
#[shopify_function(rename_all = "camelCase")]
pub struct Configuration {
    pub node_kind: String,
}

#[shopify_function]
fn run(input: schema::run::Input) -> Result<schema::FunctionRunResult> {
    let no_discount = schema::FunctionRunResult {
        discounts: vec![],
        discount_application_strategy: schema::DiscountApplicationStrategy::First,
    };

    // Read node_kind from the discount node's metafield
    let node_kind = match input.discount_node().metafield() {
        Some(metafield) => metafield.json_value().node_kind.clone(),
        None => "combinable".to_string(),
    };

    // Read shop config metafield (value is a plain String in the schema)
    let shop_metafield = input.shop().metafield();
    let config: Config = match shop_metafield {
        Some(m) => match serde_json::from_str(m.value()) {
            Ok(c) => c,
            Err(_) => return Ok(no_discount),
        },
        None => return Ok(no_discount),
    };

    let want_combinable = node_kind != "non_combinable";

    // Convert input cart lines to our internal CartLine
    let lines: Vec<CartLine> = input
        .cart()
        .lines()
        .iter()
        .filter_map(|l| {
            use schema::run::input::cart::lines::Merchandise;
            let variant = match l.merchandise() {
                Merchandise::ProductVariant(pv) => pv,
                _ => return None,
            };
            let bundle_attr = l.attribute().and_then(|a| a.value().map(|v| v.to_string()));
            let gift_attr = l.gift_attr().and_then(|a| a.value().map(|v| v.to_string()));
            Some(CartLine {
                id: l.id().to_string(),
                product_id: variant.product().id().to_string(),
                variant_id: Some(variant.id().to_string()),
                quantity: *l.quantity() as u32,
                bundle_attr,
                gift_attr,
            })
        })
        .collect();

    let mut discounts: Vec<schema::Discount> = Vec::new();

    // Classic bundle matching (skip mix_match)
    for bundle in config.bundles.iter()
        .filter(|b| b.status == "active" && b.mode != "mix_match")
    {
        if !matches_combinable(bundle.combinable, want_combinable) {
            continue;
        }
        if let Some(target_line_ids) = matcher::match_bundle(&lines, bundle) {
            let line_subtotal: f64 = target_line_ids.iter().filter_map(|tid| {
                input.cart().lines().iter()
                    .find(|l| l.id() == tid.as_str())
                    .map(|l| l.cost().amount_per_quantity().amount().as_f64())
            }).sum();
            let value = discount::compute_bundle_value(bundle, line_subtotal);
            discounts.push(build_discount(&bundle.name, &target_line_ids, value));
        }
    }

    // Mix & Match matching
    for bundle in config.bundles.iter().filter(|b| b.status == "active" && b.mode == "mix_match") {
        if !matches_combinable(bundle.combinable, want_combinable) {
            continue;
        }
        if let Some(target_line_ids) = matcher::match_mix_match_bundle(&lines, bundle) {
            let line_subtotal: f64 = target_line_ids.iter().filter_map(|tid| {
                input.cart().lines().iter()
                    .find(|l| l.id() == tid.as_str())
                    .map(|l| l.cost().amount_per_quantity().amount().as_f64() * (*l.quantity() as f64))
            }).sum();
            let value = discount::compute_bundle_value(bundle, line_subtotal);
            discounts.push(build_discount(&bundle.name, &target_line_ids, value));
        }
    }

    // QB matching
    for qb in config.quantity_breaks.iter()
        .filter(|q| q.status == "active")
    {
        if !matches_combinable(qb.combinable, want_combinable) {
            continue;
        }
        for line in &lines {
            if let Some(tier) = matcher::match_qb_tier(line, qb) {
                let amount_per_unit = input.cart().lines().iter()
                    .find(|l| l.id() == line.id.as_str())
                    .map(|l| l.cost().amount_per_quantity().amount().as_f64())
                    .unwrap_or(0.0);
                let value = discount::compute_qb_tier_value(tier, amount_per_unit);
                discounts.push(build_discount(&qb.name, &[line.id.clone()], value));
            }
        }
    }

    // Free gift / BOGO add_* lines: 100% off any line tagged with _pumper_gift_id
    for line in &lines {
        if line.gift_attr.is_some() {
            discounts.push(build_discount(
                "Free gift",
                &[line.id.clone()],
                DiscountValue::Percentage(100.0),
            ));
        }
    }

    Ok(schema::FunctionRunResult {
        discounts,
        discount_application_strategy: schema::DiscountApplicationStrategy::First,
    })
}

fn matches_combinable(rule_combinable: bool, want_combinable: bool) -> bool {
    rule_combinable == want_combinable
}

fn build_discount(message: &str, line_ids: &[String], value: DiscountValue) -> schema::Discount {
    let targets: Vec<schema::Target> = line_ids.iter().map(|id| {
        schema::Target::CartLine(schema::CartLineTarget {
            id: id.clone(),
            quantity: None,
        })
    }).collect();

    let value = match value {
        DiscountValue::Percentage(p) => schema::Value::Percentage(schema::Percentage {
            value: Decimal(p),
        }),
        DiscountValue::FixedAmount(a) => schema::Value::FixedAmount(schema::FixedAmount {
            amount: Decimal(a),
            applies_to_each_item: None,
        }),
    };

    schema::Discount {
        message: Some(message.to_string()),
        targets,
        value,
    }
}
