import { Card, BlockStack, Checkbox, TextField, Select, Text, InlineStack } from "@shopify/polaris";

export type SubscriptionFormValues = {
  subEnabled: boolean;
  subDiscountPercent: string;
  subInterval: "weekly" | "biweekly" | "monthly" | "quarterly";
};

type Props = {
  values: SubscriptionFormValues;
  onChange: (next: SubscriptionFormValues) => void;
};

export const EMPTY_SUBSCRIPTION: SubscriptionFormValues = {
  subEnabled: false,
  subDiscountPercent: "20",
  subInterval: "monthly",
};

const INTERVALS = [
  { label: "Weekly", value: "weekly" },
  { label: "Biweekly", value: "biweekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
];

export function SubscriptionPanel({ values, onChange }: Props) {
  const set = <K extends keyof SubscriptionFormValues>(k: K, v: SubscriptionFormValues[K]) =>
    onChange({ ...values, [k]: v });

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">Subscription (optional)</Text>
        <Text as="p" tone="subdued">
          Offer customers a "Subscribe &amp; save" option on this widget. Requires a Shopify
          subscription provider (Shopify Subscriptions or Recharge) configured on your store
          so the recurring billing actually charges. We attach the subscription intent as a
          cart attribute; your provider reads it and creates the selling plan.
        </Text>
        <Checkbox
          label="Enable subscription"
          checked={values.subEnabled}
          onChange={(c) => set("subEnabled", c)}
        />
        {values.subEnabled && (
          <InlineStack gap="300">
            <div style={{ flex: 1 }}>
              <TextField
                label="Subscribe & save"
                type="number"
                min={0}
                max={50}
                value={values.subDiscountPercent}
                onChange={(v) => set("subDiscountPercent", v)}
                suffix="%"
                autoComplete="off"
              />
            </div>
            <div style={{ flex: 1 }}>
              <Select
                label="Delivery interval"
                options={INTERVALS}
                value={values.subInterval}
                onChange={(v) => set("subInterval", v as SubscriptionFormValues["subInterval"])}
              />
            </div>
          </InlineStack>
        )}
      </BlockStack>
    </Card>
  );
}
