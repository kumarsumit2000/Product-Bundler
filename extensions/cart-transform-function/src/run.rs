use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;
use crate::transform::{self, GroupedLine};

#[shopify_function]
fn run(input: schema::run::Input) -> Result<schema::FunctionRunResult> {
    use schema::run::input::cart::lines::Merchandise;

    let pairs: Vec<(Option<String>, GroupedLine)> = input
        .cart()
        .lines()
        .iter()
        .filter_map(|line| {
            let variant = match line.merchandise() {
                Merchandise::ProductVariant(pv) => pv,
                _ => return None,
            };
            let bundle_id = line.bundle_attr().and_then(|a| a.value().map(String::from));
            let is_gift = line.gift_attr().and_then(|a| a.value()).is_some();
            Some((
                bundle_id,
                GroupedLine {
                    line_id: line.id().to_string(),
                    quantity: *line.quantity() as i64,
                    variant_id: variant.id().to_string(),
                    product_title: variant.product().title().to_string(),
                    is_gift,
                },
            ))
        })
        .collect();

    let groups = transform::group_lines(pairs);
    let ops = transform::build_merge_ops(groups);

    let operations: Vec<schema::CartOperation> = ops
        .into_iter()
        .map(|op| {
            schema::CartOperation::Merge(schema::MergeOperation {
                attributes: None,
                cart_lines: op
                    .child_lines
                    .into_iter()
                    .map(|(id, qty)| schema::CartLineInput {
                        cart_line_id: id.into(),
                        quantity: qty as i32,
                    })
                    .collect(),
                image: None,
                parent_variant_id: op.parent_variant_id.into(),
                price: None,
                title: Some(op.parent_title),
            })
        })
        .collect();

    Ok(schema::FunctionRunResult { operations })
}
