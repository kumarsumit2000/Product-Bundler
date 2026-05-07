use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
pub struct Config {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub bundles: Vec<Bundle>,
    #[serde(rename = "quantityBreaks")]
    pub quantity_breaks: Vec<QuantityBreak>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Bundle {
    pub id: String,
    pub name: String,
    pub status: String,
    pub products: Vec<BundleProduct>,
    #[serde(rename = "discountType")]
    pub discount_type: String,
    #[serde(rename = "discountValue")]
    pub discount_value: f64,
    pub combinable: bool,
    #[serde(rename = "triggerProductIds")]
    pub trigger_product_ids: Vec<String>,
    #[serde(default)]
    pub headline: Option<String>,
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(rename = "collectionId", default)]
    pub collection_id: Option<String>,
    #[serde(rename = "targetQty", default)]
    pub target_qty: Option<u32>,
}

fn default_mode() -> String { "classic".to_string() }

#[derive(Deserialize, Debug, Clone)]
pub struct BundleProduct {
    #[serde(rename = "productId")]
    pub product_id: String,
    #[serde(rename = "variantId")]
    pub variant_id: Option<String>,
    pub qty: u32,
}

#[derive(Deserialize, Debug, Clone)]
pub struct QuantityBreak {
    pub id: String,
    pub name: String,
    pub status: String,
    #[serde(rename = "productId")]
    pub product_id: String,
    pub tiers: Vec<QbTier>,
    pub combinable: bool,
}

#[derive(Deserialize, Debug, Clone)]
pub struct QbTier {
    pub qty: u32,
    #[serde(rename = "discountType")]
    pub discount_type: String,
    #[serde(rename = "discountValue")]
    pub discount_value: f64,
    pub label: String,
    #[serde(rename = "isMostPopular")]
    pub is_most_popular: bool,
}
