import { BlockStack, Card, FormLayout, Select, Text } from "@shopify/polaris";

type Option = { id: string; name: string };

type Props = {
  countdowns: Option[];
  progressiveGifts: Option[];
  linkedCountdownId: string | null;
  linkedProgressiveGiftId: string | null;
  onChange: (patch: { linkedCountdownId?: string | null; linkedProgressiveGiftId?: string | null }) => void;
};

const NONE = "__none__";

export function WidgetAddonsCard({
  countdowns, progressiveGifts,
  linkedCountdownId, linkedProgressiveGiftId,
  onChange,
}: Props) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Add-ons</Text>
        <Text as="p" tone="subdued">
          Show another feature on top of this widget on the storefront. Pick from saved
          countdowns or progressive gifts — leave blank to skip.
        </Text>
        <FormLayout>
          <Select
            label="Countdown timer"
            options={[
              { label: "None", value: NONE },
              ...countdowns.map((c) => ({ label: c.name, value: c.id })),
            ]}
            value={linkedCountdownId ?? NONE}
            onChange={(v) => onChange({ linkedCountdownId: v === NONE ? null : v })}
            helpText="Renders the timer above this widget"
          />
          <Select
            label="Progressive gift bar"
            options={[
              { label: "None", value: NONE },
              ...progressiveGifts.map((p) => ({ label: p.name, value: p.id })),
            ]}
            value={linkedProgressiveGiftId ?? NONE}
            onChange={(v) => onChange({ linkedProgressiveGiftId: v === NONE ? null : v })}
            helpText="Renders the unlock bar above this widget"
          />
        </FormLayout>
      </BlockStack>
    </Card>
  );
}
