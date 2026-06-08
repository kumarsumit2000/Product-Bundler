import {
  BlockStack, Banner, Card, Checkbox, FormLayout, Select, TextField, Text,
} from "@shopify/polaris";
import type { SubscriptionConfig } from "../../drizzle/schema";

type Props = {
  value: SubscriptionConfig;
  onChange: (v: SubscriptionConfig) => void;
};

export function SubscriptionPanel({ value, onChange }: Props) {
  const set = <K extends keyof SubscriptionConfig>(k: K, v: SubscriptionConfig[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Subscription</Text>
        <Text as="p" tone="subdued">
          Offer a subscribe &amp; save purchase option alongside one-time purchases.
          Subscription terms are managed by your third-party subscription app.
        </Text>
        <Checkbox
          label="Enable subscription purchase option for this widget"
          checked={value.enabled}
          onChange={(enabled) => set("enabled", enabled)}
        />
        {value.enabled && (
          <BlockStack gap="300">
            <Banner tone="info">
              Subscription app discounts are applied first, followed by other discounts.
              This may slightly affect the final price. To ensure consistent pricing, use
              only discounts created within our app.
            </Banner>
            <Banner tone="info">
              Subscription settings should be set in a third-party subscription app.
            </Banner>
            <FormLayout>
              <Select
                label="Widget Style"
                options={[
                  { label: "Modern", value: "modern" },
                  { label: "Classic", value: "classic" },
                ]}
                value={value.widgetStyle}
                onChange={(v) => set("widgetStyle", v as SubscriptionConfig["widgetStyle"])}
              />
              <TextField
                label="Purchase Options Heading"
                value={value.heading}
                onChange={(v) => set("heading", v)}
                autoComplete="off"
                helpText="The main heading above all purchase options (e.g., 'How would you like to purchase?')."
              />
              <TextField
                label="Subscription Title"
                value={value.title}
                onChange={(v) => set("title", v)}
                autoComplete="off"
              />
              <TextField
                label="Subscription Subtitle"
                value={value.subtitle}
                onChange={(v) => set("subtitle", v)}
                autoComplete="off"
              />
              <TextField
                label="Subscription Details"
                value={value.details}
                onChange={(v) => set("details", v)}
                autoComplete="off"
              />
            </FormLayout>
            <Checkbox
              label="Show subscription discount label"
              checked={value.showDiscountLabel}
              onChange={(showDiscountLabel) => set("showDiscountLabel", showDiscountLabel)}
            />
            <Checkbox
              label="Hide third party subscription Widget"
              checked={value.hideThirdPartyWidget}
              onChange={(hideThirdPartyWidget) => set("hideThirdPartyWidget", hideThirdPartyWidget)}
            />
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
