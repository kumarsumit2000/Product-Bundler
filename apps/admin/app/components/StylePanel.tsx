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
import { LayoutPresetPicker } from "./LayoutPresetPicker";
import { StyleSections } from "./StyleSections";
import type {
  FontStyle,
  LayoutVariant,
} from "../../drizzle/schema";

// All form fields owned by the Style panel. Mirror of StyleFormFields in
// preview-overrides.ts, kept loose (string everywhere) so React's controlled
// inputs don't fight with us about type coercion.
export type StylePanelValues = {
  layoutVariant: LayoutVariant | "";
  gridColumns: string;
  borderRadius: string;
  spacing: string;
  // Legacy
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  // General
  cardsBg: string;
  tierBg: string;
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
  savingsFontSize: string;
};

type Props = {
  values: StylePanelValues;
  onChange: (next: StylePanelValues) => void;
};

export function StylePanel({ values, onChange }: Props) {
  const [open, setOpen] = useState(true);
  const set = <K extends keyof StylePanelValues>(k: K, v: StylePanelValues[K]) =>
    onChange({ ...values, [k]: v });

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

            {values.layoutVariant === "grid" && (
              <div style={{ maxWidth: 240 }}>
                <Select
                  label="Items per row"
                  options={[
                    { label: "2", value: "2" },
                    { label: "3", value: "3" },
                    { label: "4", value: "4" },
                  ]}
                  value={values.gridColumns || "3"}
                  onChange={(v) => set("gridColumns", v)}
                />
              </div>
            )}

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

            <StyleSections values={values} onChange={onChange} />
          </BlockStack>
        </Collapsible>
      </BlockStack>
    </Card>
  );
}
