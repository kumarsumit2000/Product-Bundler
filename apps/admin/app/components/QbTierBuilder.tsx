import { Button, BlockStack, InlineStack, TextField, Select, Checkbox } from "@shopify/polaris";

export type TierFormValue = {
  qty: number;
  discountType: "percentage" | "flat" | "fixed_per_unit";
  discountValue: number;
  label: string;
  isMostPopular: boolean;
};

type Props = {
  tiers: TierFormValue[];
  onChange: (tiers: TierFormValue[]) => void;
  maxTiers?: number;
};

const DEFAULT_TIER: TierFormValue = {
  qty: 1,
  discountType: "percentage",
  discountValue: 0,
  label: "",
  isMostPopular: false,
};

export function QbTierBuilder({ tiers, onChange, maxTiers = 10 }: Props) {
  const updateTier = (index: number, patch: Partial<TierFormValue>) => {
    onChange(tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const togglePopular = (index: number) => {
    onChange(
      tiers.map((t, i) => ({
        ...t,
        isMostPopular: i === index ? !t.isMostPopular : false,
      })),
    );
  };

  const addTier = () => {
    const lastQty = tiers.length > 0 ? tiers[tiers.length - 1]!.qty : 0;
    onChange([...tiers, { ...DEFAULT_TIER, qty: lastQty + 1 }]);
  };

  const removeTier = (index: number) => {
    onChange(tiers.filter((_, i) => i !== index));
  };

  return (
    <BlockStack gap="300">
      {tiers.map((tier, i) => (
        <InlineStack key={i} gap="200" blockAlign="end">
          <div style={{ width: 80 }}>
            <TextField
              label="Qty"
              type="number"
              value={String(tier.qty)}
              onChange={(v) => updateTier(i, { qty: parseInt(v, 10) || 0 })}
              autoComplete="off"
              min={1}
            />
          </div>
          <div style={{ width: 160 }}>
            <Select
              label="Discount type"
              options={[
                { label: "Percentage", value: "percentage" },
                { label: "Flat", value: "flat" },
                { label: "Fixed per unit", value: "fixed_per_unit" },
              ]}
              value={tier.discountType}
              onChange={(v) => {
                if (typeof v === "string") {
                  updateTier(i, { discountType: v as TierFormValue["discountType"] });
                }
              }}
            />
          </div>
          <div style={{ width: 100 }}>
            <TextField
              label="Value"
              type="number"
              value={String(tier.discountValue)}
              onChange={(v) => updateTier(i, { discountValue: parseFloat(v) || 0 })}
              autoComplete="off"
              min={0}
              step={0.01}
            />
          </div>
          <div style={{ flex: 1 }}>
            <TextField
              label="Label"
              value={tier.label}
              onChange={(v) => updateTier(i, { label: v })}
              autoComplete="off"
              maxLength={50}
            />
          </div>
          <Checkbox
            label="Popular"
            checked={tier.isMostPopular}
            onChange={() => togglePopular(i)}
          />
          <Button onClick={() => removeTier(i)} tone="critical" variant="plain">
            Remove
          </Button>
        </InlineStack>
      ))}
      <Button onClick={addTier} disabled={tiers.length >= maxTiers}>
        {tiers.length >= maxTiers ? `Add tier (max ${maxTiers})` : "Add tier"}
      </Button>
    </BlockStack>
  );
}
