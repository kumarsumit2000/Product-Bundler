import {
  BlockStack,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import type { StylePanelValues } from "./StylePanel";

const FONT_STYLE_OPTIONS = [
  { label: "Default", value: "" },
  { label: "Regular", value: "regular" },
  { label: "Medium", value: "medium" },
  { label: "Semibold", value: "semibold" },
  { label: "Bold", value: "bold" },
];

type Props = {
  values: StylePanelValues;
  onChange: (next: StylePanelValues) => void;
};

// Shared, presentational colors + typography UI. Extracted from StylePanel so
// both the bundle StylePanel and the QB SimpleQbStylePanel render the identical
// grouped color set + per-element font controls.
export function StyleSections({ values, onChange }: Props) {
  const set = <K extends keyof StylePanelValues>(k: K, v: StylePanelValues[K]) =>
    onChange({ ...values, [k]: v });

  const colorGroup = (
    title: string,
    fields: Array<{ key: keyof StylePanelValues; label: string }>,
  ) => (
    <BlockStack gap="200">
      <Text as="h4" variant="headingSm">{title}</Text>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
        {fields.map((f) => (
          <ColorSwatchPicker
            key={f.key as string}
            label={f.label}
            value={values[f.key] as string}
            onChange={(v) => set(f.key, v as never)}
          />
        ))}
      </div>
    </BlockStack>
  );

  const typographyRow = (
    title: string,
    sizeKey: keyof StylePanelValues,
    styleKey: keyof StylePanelValues,
  ) => (
    <BlockStack gap="100">
      <Text as="h4" variant="headingSm">{title}</Text>
      <InlineStack gap="300">
        <div style={{ flex: 1 }}>
          <TextField
            label="Font size"
            type="number"
            min={10}
            max={48}
            value={values[sizeKey] as string}
            onChange={(v) => set(sizeKey, v as never)}
            suffix="px"
            autoComplete="off"
          />
        </div>
        <div style={{ flex: 1 }}>
          <Select
            label="Font style"
            options={FONT_STYLE_OPTIONS}
            value={values[styleKey] as string}
            onChange={(v) => set(styleKey, v as never)}
          />
        </div>
      </InlineStack>
    </BlockStack>
  );

  return (
    <>
      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">Colors</Text>
        {colorGroup("General", [
          { key: "primaryColor", label: "Primary / button" },
          { key: "cardsBg", label: "Cards bg" },
          { key: "tierBg", label: "Tier bg" },
          { key: "selectedBg", label: "Selected bg" },
          { key: "borderColor", label: "Border color" },
          { key: "blockTitleColor", label: "Block title" },
        ])}
        {colorGroup("Bar texts", [
          { key: "titleColor", label: "Title" },
          { key: "subtitleColor", label: "Subtitle" },
          { key: "priceColor", label: "Price" },
          { key: "fullPriceColor", label: "Full price" },
        ])}
        {colorGroup("Label", [
          { key: "labelBg", label: "Background" },
          { key: "labelText", label: "Text" },
        ])}
        {colorGroup("Badge", [
          { key: "badgeBg", label: "Background" },
          { key: "badgeText", label: "Text" },
        ])}
        {colorGroup("Free gift", [
          { key: "freeGiftBg", label: "Background" },
          { key: "freeGiftText", label: "Text" },
          { key: "freeGiftSelectedBg", label: "Selected bg" },
          { key: "freeGiftSelectedText", label: "Selected text" },
        ])}
        {colorGroup("Upsell", [
          { key: "upsellBg", label: "Background" },
          { key: "upsellText", label: "Text" },
          { key: "upsellSelectedBg", label: "Selected bg" },
          { key: "upsellSelectedText", label: "Selected text" },
        ])}
      </BlockStack>

      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">Typography</Text>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {typographyRow("Block title", "blockTitleFontSize", "blockTitleFontStyle")}
          {typographyRow("Title", "titleFontSize", "titleFontStyle")}
          {typographyRow("Subtitle", "subtitleFontSize", "subtitleFontStyle")}
          {typographyRow("Label", "labelFontSize", "labelFontStyle")}
          {typographyRow("Free gift", "freeGiftFontSize", "freeGiftFontStyle")}
          {typographyRow("Upsell", "upsellFontSize", "upsellFontStyle")}
          {typographyRow("Unit label", "unitLabelFontSize", "unitLabelFontStyle")}
        </div>
      </BlockStack>
    </>
  );
}
