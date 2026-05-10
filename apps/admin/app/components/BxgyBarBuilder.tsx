import { Box, BlockStack, Button, Card, Checkbox, InlineStack, Select, Text, TextField } from "@shopify/polaris";

export type BxgyBarValue = {
  id: string;
  buyQty: number;
  buyDiscountPercent: number;
  getQty: number;
  getDiscountPercent: number;
  title: string;
  subtitle: string;
  badgeStyle: "save_percent" | "save_amount" | "custom" | "none";
  badgeText: string;
  label: string;
  isMostPopular: boolean;
};

export const EMPTY_BAR: BxgyBarValue = {
  id: "",
  buyQty: 1,
  buyDiscountPercent: 0,
  getQty: 1,
  getDiscountPercent: 100,
  title: "Buy 1, get 1 free",
  subtitle: "",
  badgeStyle: "save_percent",
  badgeText: "SAVE {{saved_percentage}}",
  label: "",
  isMostPopular: false,
};

type Props = {
  bars: BxgyBarValue[];
  onChange: (bars: BxgyBarValue[]) => void;
  maxBars?: number;
};

export function BxgyBarBuilder({ bars, onChange, maxBars = 8 }: Props) {
  const update = (index: number, patch: Partial<BxgyBarValue>) => {
    onChange(bars.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const togglePopular = (index: number) => {
    onChange(bars.map((b, i) => ({ ...b, isMostPopular: i === index ? !b.isMostPopular : false })));
  };

  const add = () => {
    const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `bar-${Date.now()}`;
    onChange([...bars, { ...EMPTY_BAR, id }]);
  };

  const remove = (index: number) => {
    onChange(bars.filter((_, i) => i !== index));
  };

  return (
    <BlockStack gap="300">
      {bars.map((bar, i) => (
        <Card key={bar.id || i}>
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center" align="space-between">
              <Text as="h3" variant="headingSm">Bar #{i + 1}</Text>
              <InlineStack gap="200">
                <Checkbox
                  label="Most popular"
                  checked={bar.isMostPopular}
                  onChange={() => togglePopular(i)}
                />
                <Button onClick={() => remove(i)} tone="critical" variant="plain">
                  Remove
                </Button>
              </InlineStack>
            </InlineStack>

            <InlineStack gap="300">
              <Box minWidth="6rem">
                <TextField
                  label="Buy qty"
                  type="number"
                  min={1}
                  value={String(bar.buyQty)}
                  onChange={(v) => update(i, { buyQty: Math.max(1, parseInt(v, 10) || 1) })}
                  autoComplete="off"
                />
              </Box>
              <Box minWidth="8rem">
                <TextField
                  label="Buy discount"
                  type="number"
                  min={0}
                  max={100}
                  suffix="%"
                  value={String(bar.buyDiscountPercent)}
                  onChange={(v) => update(i, { buyDiscountPercent: Math.max(0, Math.min(100, parseInt(v, 10) || 0)) })}
                  autoComplete="off"
                  helpText="0% = full price"
                />
              </Box>
              <Box minWidth="6rem">
                <TextField
                  label="Get qty"
                  type="number"
                  min={1}
                  value={String(bar.getQty)}
                  onChange={(v) => update(i, { getQty: Math.max(1, parseInt(v, 10) || 1) })}
                  autoComplete="off"
                />
              </Box>
              <Box minWidth="8rem">
                <TextField
                  label="Get discount"
                  type="number"
                  min={0}
                  max={100}
                  suffix="%"
                  value={String(bar.getDiscountPercent)}
                  onChange={(v) => update(i, { getDiscountPercent: Math.max(0, Math.min(100, parseInt(v, 10) || 0)) })}
                  autoComplete="off"
                  helpText="100% = free"
                />
              </Box>
            </InlineStack>

            <TextField
              label="Title"
              value={bar.title}
              onChange={(v) => update(i, { title: v })}
              autoComplete="off"
              maxLength={120}
              placeholder="Buy 1, get 1 free"
            />
            <TextField
              label="Subtitle"
              value={bar.subtitle}
              onChange={(v) => update(i, { subtitle: v })}
              autoComplete="off"
              maxLength={120}
              placeholder="Optional"
            />

            <InlineStack gap="300">
              <Box minWidth="12rem">
                <Select
                  label="Badge style"
                  options={[
                    { label: "Save percentage", value: "save_percent" },
                    { label: "Save amount", value: "save_amount" },
                    { label: "Custom", value: "custom" },
                    { label: "None", value: "none" },
                  ]}
                  value={bar.badgeStyle}
                  onChange={(v) => update(i, { badgeStyle: v as BxgyBarValue["badgeStyle"] })}
                />
              </Box>
              <div style={{ flex: 1 }}>
                <TextField
                  label="Badge text"
                  value={bar.badgeText}
                  onChange={(v) => update(i, { badgeText: v })}
                  autoComplete="off"
                  helpText="Variables: {{saved_percentage}}, {{saved_amount}}"
                />
              </div>
            </InlineStack>
          </BlockStack>
        </Card>
      ))}
      <Button onClick={add} disabled={bars.length >= maxBars}>
        {bars.length >= maxBars ? `Add bar (max ${maxBars})` : "Add bar"}
      </Button>
    </BlockStack>
  );
}
