use crate::config::{Bundle, QbTier, QuantityBreak};

pub struct CartLine {
    pub id: String,
    pub product_id: String,
    pub variant_id: Option<String>,
    pub quantity: u32,
}

/// Returns target cart line IDs if every required product is present in the cart with sufficient quantity.
pub fn match_bundle(lines: &[CartLine], bundle: &Bundle) -> Option<Vec<String>> {
    let mut targets = Vec::with_capacity(bundle.products.len());
    for required in &bundle.products {
        let line = lines.iter().find(|line| {
            line.product_id == required.product_id
                && variant_matches(&required.variant_id, &line.variant_id)
                && line.quantity >= required.qty
        })?;
        targets.push(line.id.clone());
    }
    Some(targets)
}

/// For a single cart line, returns the highest tier whose qty threshold is met.
pub fn match_qb_tier<'a>(line: &CartLine, qb: &'a QuantityBreak) -> Option<&'a QbTier> {
    if line.product_id != qb.product_id {
        return None;
    }
    qb.tiers
        .iter()
        .filter(|t| line.quantity >= t.qty)
        .max_by_key(|t| t.qty)
}

fn variant_matches(required: &Option<String>, actual: &Option<String>) -> bool {
    match required {
        Some(req) => actual.as_ref() == Some(req),
        None => true,
    }
}
