import { BlockStack, Card, FormLayout, Select, Text } from "@shopify/polaris";

type Option = { id: string; name: string };

// Countdown was dropped in the Pumper-parity strip-down; "widget" and
// "progressive" are the only meaningful items left. Kept as an enum
// to preserve the addonsOrder JSON shape on existing rows.
export type AddonsOrderItem = "widget" | "progressive";
export const DEFAULT_ADDONS_ORDER: AddonsOrderItem[] = ["widget", "progressive"];

type Props = {
  progressiveGifts: Option[];
  linkedProgressiveGiftId: string | null;
  widgetLabel?: string;
  // Accept the legacy `linkedCountdownId` + `addonsOrder` patches so
  // existing form actions continue to compile without changes — both
  // are silently dropped on save.
  onChange: (patch: {
    linkedCountdownId?: string | null;
    linkedProgressiveGiftId?: string | null;
    addonsOrder?: AddonsOrderItem[];
  }) => void;
};

const NONE = "__none__";

export function WidgetAddonsCard({
  progressiveGifts,
  linkedProgressiveGiftId,
  onChange,
}: Props) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Add-ons</Text>
        <Text as="p" tone="subdued">
          Pair this widget with a progressive gift / free-shipping bar.
          Leave blank to skip.
        </Text>
        <FormLayout>
          <Select
            label="Progressive gift bar"
            options={[
              { label: "None", value: NONE },
              ...progressiveGifts.map((p) => ({ label: p.name, value: p.id })),
            ]}
            value={linkedProgressiveGiftId ?? NONE}
            onChange={(v) => onChange({ linkedProgressiveGiftId: v === NONE ? null : v })}
          />
        </FormLayout>
      </BlockStack>
    </Card>
  );
}

// Kept exported because forms still import it when they hydrate
// `addonsOrder` on initial render — the runtime call returns a stable
// default array that ignores any legacy "countdown" entries.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function normalizeOrder(_input: AddonsOrderItem[] | null | undefined): AddonsOrderItem[] {
  return [...DEFAULT_ADDONS_ORDER];
}
