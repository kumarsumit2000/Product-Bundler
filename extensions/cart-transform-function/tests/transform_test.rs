use cart_transform_function::transform::{build_merge_ops, group_lines, GroupedLine};

fn line(id: &str, qty: i64, variant: &str, product: &str, gift: bool) -> GroupedLine {
    GroupedLine {
        line_id: id.into(),
        quantity: qty,
        variant_id: variant.into(),
        product_title: product.into(),
        is_gift: gift,
    }
}

#[test]
fn empty_cart_emits_no_ops() {
    let groups = group_lines(std::iter::empty());
    let ops = build_merge_ops(groups);
    assert!(ops.is_empty());
}

#[test]
fn single_line_group_is_skipped() {
    let groups = group_lines(vec![
        (Some("b1".into()), line("L1", 1, "V1", "Snowboard", false)),
    ]);
    let ops = build_merge_ops(groups);
    assert!(ops.is_empty());
}

#[test]
fn two_line_group_merges_into_one_op() {
    let groups = group_lines(vec![
        (Some("b1".into()), line("L1", 1, "V1", "Snowboard", false)),
        (Some("b1".into()), line("L2", 1, "V2", "Bindings", false)),
    ]);
    let ops = build_merge_ops(groups);
    assert_eq!(ops.len(), 1);
    assert_eq!(ops[0].bundle_id, "b1");
    assert_eq!(ops[0].parent_title, "Bundle: Snowboard + Bindings");
    assert_eq!(ops[0].child_lines.len(), 2);
}

#[test]
fn three_line_group_with_gift_appends_gift_suffix() {
    let groups = group_lines(vec![
        (Some("b1".into()), line("L1", 3, "V1", "Snowboard", false)),
        (Some("b1".into()), line("L2", 1, "V2", "Bindings", false)),
        (Some("b1".into()), line("L3", 1, "V_GIFT", "Hat", true)),
    ]);
    let ops = build_merge_ops(groups);
    assert_eq!(ops.len(), 1);
    assert_eq!(
        ops[0].parent_title,
        "Bundle: Snowboard + Bindings + \u{1F381} Gift"
    );
    assert_eq!(ops[0].child_lines.len(), 3);
    // Parent variant should be the first non-gift variant
    assert_eq!(ops[0].parent_variant_id, "V1");
}

#[test]
fn two_parallel_groups_emit_two_ops() {
    let groups = group_lines(vec![
        (Some("b1".into()), line("L1", 1, "V1", "A", false)),
        (Some("b1".into()), line("L2", 1, "V2", "B", false)),
        (Some("b2".into()), line("L3", 1, "V3", "C", false)),
        (Some("b2".into()), line("L4", 1, "V4", "D", false)),
    ]);
    let ops = build_merge_ops(groups);
    assert_eq!(ops.len(), 2);
    let mut bundles: Vec<&str> = ops.iter().map(|o| o.bundle_id.as_str()).collect();
    bundles.sort();
    assert_eq!(bundles, vec!["b1", "b2"]);
}

#[test]
fn lines_without_bundle_id_are_excluded() {
    let groups = group_lines(vec![
        (Some("b1".into()), line("L1", 1, "V1", "A", false)),
        (Some("b1".into()), line("L2", 1, "V2", "B", false)),
        (None, line("L3", 1, "V3", "Loose", false)),
    ]);
    let ops = build_merge_ops(groups);
    assert_eq!(ops.len(), 1);
    assert_eq!(ops[0].child_lines.len(), 2);
}
