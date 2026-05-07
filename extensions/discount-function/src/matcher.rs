use crate::config::{Bundle, QbTier, QuantityBreak};

pub struct CartLine {
    pub id: String,
    pub product_id: String,
    pub variant_id: Option<String>,
    pub quantity: u32,
    pub bundle_attr: Option<String>,
    pub gift_attr: Option<String>,
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

/// Returns target cart line IDs for a Mix & Match bundle: every line tagged with
/// `_pumper_bundle_id == bundle.id`. Match succeeds when the total qty across
/// tagged lines meets or exceeds `bundle.target_qty`.
pub fn match_mix_match_bundle(lines: &[CartLine], bundle: &Bundle) -> Option<Vec<String>> {
    if bundle.mode != "mix_match" { return None; }
    let target_qty = bundle.target_qty? as u32;
    let tagged: Vec<&CartLine> = lines.iter()
        .filter(|l| l.bundle_attr.as_deref() == Some(bundle.id.as_str()))
        .collect();
    let total_qty: u32 = tagged.iter().map(|l| l.quantity).sum();
    if total_qty < target_qty { return None; }
    Some(tagged.iter().map(|l| l.id.clone()).collect())
}

fn variant_matches(required: &Option<String>, actual: &Option<String>) -> bool {
    match required {
        Some(req) => actual.as_ref() == Some(req),
        None => true,
    }
}
