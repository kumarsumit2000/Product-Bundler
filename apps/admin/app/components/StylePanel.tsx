import {
  BlockStack,
  Card,
  Collapsible,
  InlineStack,
  RangeSlider,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { LayoutPresetPicker } from "./LayoutPresetPicker";
import type {
  FontStyle,
  LayoutVariant,
} from "../../drizzle/schema";

// All form fields owned by the Style panel. Mirror of StyleFormFields in
// preview-overrides.ts, kept loose (string everywhere) so React's controlled
// inputs don't fight with us about type coercion.
export type StylePanelValues = {
  layoutVariant: LayoutVariant | "";
  borderRadius: string;
  spacing: string;
  // Legacy
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  // General
  cardsBg: string;
  selectedBg: string;
  borderColor: string;
  blockTitleColor: string;
  // Bar texts
  titleColor: string;
  subtitleColor: string;
  priceColor: string;
  fullPriceColor: string;
  // Label
  labelBg: string;
  labelText: string;
  // Badge
  badgeBg: string;
  badgeText: string;
  // Free gift
  freeGiftBg: string;
  freeGiftText: string;
  freeGiftSelectedBg: string;
  freeGiftSelectedText: string;
  // Upsell
  upsellBg: string;
  upsellText: string;
  upsellSelectedBg: string;
  upsellSelectedText: string;
  // Typography
  blockTitleFontSize: string;
  blockTitleFontStyle: FontStyle | "";
  titleFontSize: string;
  titleFontStyle: FontStyle | "";
  subtitleFontSize: string;
  subtitleFontStyle: FontStyle | "";
  labelFontSize: string;
  labelFontStyle: FontStyle | "";
  freeGiftFontSize: string;
  freeGiftFontStyle: FontStyle | "";
  upsellFontSize: string;
  upsellFontStyle: FontStyle | "";
  unitLabelFontSize: string;
  unitLabelFontStyle: FontStyle | "";
};

type Props = {
  values: StylePanelValues;
  onChange: (next: StylePanelValues) => void;
};

const FONT_STYLE_OPTIONS = [
  { label: "Default", value: "" },
  { label: "Regular", value: "regular" },
  { label: "Medium", value: "medium" },
  { label: "Semibold", value: "semibold" },
  { label: "Bold", value: "bold" },
];

export function StylePanel({ values, onChange }: Props) {
  const [open, setOpen] = useState(true);
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
    <Card>
      <BlockStack gap="400">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
          }}
          aria-expanded={open}
        >
          <span style={{ fontSize: 18, transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}>⌄</span>
          <Text as="h2" variant="headingMd">Style</Text>
        </button>

        <Collapsible open={open} id="style-panel" transition={{ duration: "150ms", timingFunction: "ease" }}>
          <BlockStack gap="400">
            <LayoutPresetPicker
              value={values.layoutVariant}
              onChange={(v) => set("layoutVariant", v)}
            />

            <InlineStack gap="400" align="start">
              <div style={{ flex: 1, minWidth: 220 }}>
                <RangeSlider
                  label="Corner radius"
                  min={0}
                  max={48}
                  value={parseInt(values.borderRadius, 10) || 0}
                  onChange={(v) => set("borderRadius", String(v))}
                  output
                  suffix={
                    <TextField
                      label=""
                      labelHidden
                      type="number"
                      min={0}
                      max={48}
                      value={values.borderRadius}
                      onChange={(v) => set("borderRadius", v)}
                      suffix="px"
                      autoComplete="off"
                    />
                  }
                />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <RangeSlider
                  label="Spacing"
                  min={0}
                  max={64}
                  value={parseInt(values.spacing, 10) || 0}
                  onChange={(v) => set("spacing", String(v))}
                  output
                  suffix={
                    <TextField
                      label=""
                      labelHidden
                      type="number"
                      min={0}
                      max={64}
                      value={values.spacing}
                      onChange={(v) => set("spacing", v)}
                      suffix="px"
                      autoComplete="off"
                    />
                  }
                />
              </div>
            </InlineStack>

            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">Colors</Text>
              {colorGroup("General", [
                { key: "cardsBg", label: "Cards bg" },
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
          </BlockStack>
        </Collapsible>
      </BlockStack>
    </Card>
  );
}
