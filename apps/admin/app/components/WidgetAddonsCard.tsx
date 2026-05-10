import { BlockStack, Card, FormLayout, Select, Text, Button, InlineStack } from "@shopify/polaris";

type Option = { id: string; name: string };

export type AddonsOrderItem = "countdown" | "widget" | "progressive";
export const DEFAULT_ADDONS_ORDER: AddonsOrderItem[] = ["countdown", "widget", "progressive"];

type Props = {
  countdowns: Option[];
  progressiveGifts: Option[];
  linkedCountdownId: string | null;
  linkedProgressiveGiftId: string | null;
  addonsOrder: AddonsOrderItem[];
  widgetLabel?: string;
  onChange: (patch: {
    linkedCountdownId?: string | null;
    linkedProgressiveGiftId?: string | null;
    addonsOrder?: AddonsOrderItem[];
  }) => void;
};

const NONE = "__none__";

const ITEM_LABELS: Record<AddonsOrderItem, string> = {
  countdown: "Countdown timer",
  widget: "Bundle / quantity break",
  progressive: "Progressive gift bar",
};

export function WidgetAddonsCard({
  countdowns, progressiveGifts,
  linkedCountdownId, linkedProgressiveGiftId,
  addonsOrder,
  widgetLabel,
  onChange,
}: Props) {
  const safeOrder = normalizeOrder(addonsOrder);
  const showOrder = !!linkedCountdownId || !!linkedProgressiveGiftId;
  const itemLabels: Record<AddonsOrderItem, string> = {
    ...ITEM_LABELS,
    widget: widgetLabel ?? ITEM_LABELS.widget,
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...safeOrder];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange({ addonsOrder: next });
  };

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
          />
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
        {showOrder && (
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Display order</Text>
            <Text as="p" tone="subdued">
              Drag with the arrows to reorder how these blocks stack on the storefront.
            </Text>
            <BlockStack gap="100">
              {safeOrder.map((item, i) => {
                const dimmed = (item === "countdown" && !linkedCountdownId)
                  || (item === "progressive" && !linkedProgressiveGiftId);
                return (
                  <div
                    key={item}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: dimmed ? "#f6f6f7" : "#fff",
                      border: "1px solid #e3e3e3",
                      borderRadius: 6,
                      opacity: dimmed ? 0.5 : 1,
                    }}
                  >
                    <Text as="span" variant="bodyMd">
                      {i + 1}. {itemLabels[item]}{dimmed ? " (not selected)" : ""}
                    </Text>
                    <InlineStack gap="100">
                      <Button
                        size="micro"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        accessibilityLabel="Move up"
                      >
                        ↑
                      </Button>
                      <Button
                        size="micro"
                        disabled={i === safeOrder.length - 1}
                        onClick={() => move(i, 1)}
                        accessibilityLabel="Move down"
                      >
                        ↓
                      </Button>
                    </InlineStack>
                  </div>
                );
              })}
            </BlockStack>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

function normalizeOrder(input: AddonsOrderItem[] | null | undefined): AddonsOrderItem[] {
  const valid = new Set<AddonsOrderItem>(["countdown", "widget", "progressive"]);
  const seen = new Set<AddonsOrderItem>();
  const out: AddonsOrderItem[] = [];
  for (const item of input ?? []) {
    if (valid.has(item) && !seen.has(item)) {
      out.push(item);
      seen.add(item);
    }
  }
  for (const item of DEFAULT_ADDONS_ORDER) {
    if (!seen.has(item)) out.push(item);
  }
  return out;
}
