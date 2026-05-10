import {
  BlockStack, Card, FormLayout, TextField, Checkbox, Text,
} from "@shopify/polaris";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import type { StickyAtcConfig } from "../../drizzle/schema";

export const STICKY_ATC_DEFAULTS: StickyAtcConfig = {
  enabled: false,
  showImage: true,
  showQty: true,
  showPrice: true,
  ctaLabel: "Add to cart",
  backgroundColor: "#FFFFFF",
  textColor: "#1A1A1A",
  buttonBg: "#1A1A1A",
  buttonText: "#FFFFFF",
};

type Props = {
  value: StickyAtcConfig;
  onChange: (next: StickyAtcConfig) => void;
};

export function StickyAtcCard({ value, onChange }: Props) {
  const set = <K extends keyof StickyAtcConfig>(k: K, v: StickyAtcConfig[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Sticky add-to-cart bar</Text>
        <Text as="p" tone="subdued">
          When enabled, a fixed bar appears at the bottom of the product page once the customer
          scrolls past the original Add to cart button. Only shows on PDPs that match this
          widget&apos;s visibility rules.
        </Text>
        <Checkbox
          label="Enable sticky add-to-cart bar for this widget"
          checked={value.enabled}
          onChange={(enabled) => set("enabled", enabled)}
        />
        {value.enabled && (
          <BlockStack gap="300">
            <Checkbox
              label="Show product image"
              checked={value.showImage}
              onChange={(showImage) => set("showImage", showImage)}
            />
            <Checkbox
              label="Show quantity selector"
              checked={value.showQty}
              onChange={(showQty) => set("showQty", showQty)}
            />
            <Checkbox
              label="Show price"
              checked={value.showPrice}
              onChange={(showPrice) => set("showPrice", showPrice)}
            />
            <FormLayout>
              <TextField
                label="Button text"
                value={value.ctaLabel}
                onChange={(ctaLabel) => set("ctaLabel", ctaLabel)}
                autoComplete="off"
                maxLength={30}
              />
              <FormLayout.Group>
                <ColorSwatchPicker
                  label="Background"
                  value={value.backgroundColor}
                  onChange={(backgroundColor) => set("backgroundColor", backgroundColor)}
                  placeholder="#FFFFFF"
                />
                <ColorSwatchPicker
                  label="Text"
                  value={value.textColor}
                  onChange={(textColor) => set("textColor", textColor)}
                  placeholder="#1A1A1A"
                />
              </FormLayout.Group>
              <FormLayout.Group>
                <ColorSwatchPicker
                  label="Button background"
                  value={value.buttonBg}
                  onChange={(buttonBg) => set("buttonBg", buttonBg)}
                  placeholder="#1A1A1A"
                />
                <ColorSwatchPicker
                  label="Button text"
                  value={value.buttonText}
                  onChange={(buttonText) => set("buttonText", buttonText)}
                  placeholder="#FFFFFF"
                />
              </FormLayout.Group>
            </FormLayout>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
