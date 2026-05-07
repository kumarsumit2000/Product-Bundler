use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct GroupedLine {
    pub line_id: String,
    pub quantity: i64,
    pub variant_id: String,
    pub product_title: String,
    pub is_gift: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MergeOp {
    pub bundle_id: String,
    pub parent_variant_id: String,
    pub parent_title: String,
    pub child_lines: Vec<(String, i64)>,
}

pub fn build_merge_ops(grouped: HashMap<String, Vec<GroupedLine>>) -> Vec<MergeOp> {
    let mut ops = Vec::new();
    for (bundle_id, lines) in grouped {
        if lines.len() < 2 {
            continue;
        }

        let titles: Vec<String> = lines
            .iter()
            .filter(|l| !l.is_gift)
            .map(|l| l.product_title.clone())
            .collect();
        let mut parent_title = format!("Bundle: {}", titles.join(" + "));
        if lines.iter().any(|l| l.is_gift) {
            parent_title.push_str(" + \u{1F381} Gift");
        }

        let parent_variant_id = lines
            .iter()
            .find(|l| !l.is_gift)
            .or_else(|| lines.first())
            .map(|l| l.variant_id.clone());

        let parent_variant_id = match parent_variant_id {
            Some(v) => v,
            None => continue,
        };

        ops.push(MergeOp {
            bundle_id,
            parent_variant_id,
            parent_title,
            child_lines: lines.iter().map(|l| (l.line_id.clone(), l.quantity)).collect(),
        });
    }
    ops
}

pub fn group_lines<I>(lines: I) -> HashMap<String, Vec<GroupedLine>>
where
    I: IntoIterator<Item = (Option<String>, GroupedLine)>,
{
    let mut groups: HashMap<String, Vec<GroupedLine>> = HashMap::new();
    for (bundle_id_opt, line) in lines {
        if let Some(bundle_id) = bundle_id_opt {
            groups.entry(bundle_id).or_default().push(line);
        }
    }
    groups
}
