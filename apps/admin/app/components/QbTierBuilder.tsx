import { Button, BlockStack, InlineStack, TextField, Select, Checkbox, Text, Collapsible, Box } from "@shopify/polaris";
import { useState } from "react";
import { VariantPicker, type PickedVariant } from "./VariantPicker";
import { ProductPicker, type PickedProduct } from "./ProductPicker";

export type TierFormValue = {
  qty: number;
  discountType: "percentage" | "flat" | "fixed_per_unit";
  discountValue: number;
  label: string;
  isMostPopular: boolean;
  freeGiftVariant?: PickedVariant | null;
  bogoMode?: "" | "add_same" | "add_different" | "nth_free";
  bogoTargetVariant?: PickedVariant | null;
  bogoBonusQty?: number;
  // Pack QB ("different products" pattern): extra products bundled into the
  // tier — added to cart when this tier is chosen.
  extraProducts?: PickedProduct[];
};

type Props = {
  tiers: TierFormValue[];
  onChange: (tiers: TierFormValue[]) => void;
  maxTiers?: number;
  restrictToProductId?: string | null;
};

function AdvancedSection({ id, initialOpen, children }: { id: string; initialOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!initialOpen);
  return (
    <Box paddingInlineStart="200">
      <Button variant="plain" onClick={() => setOpen(o => !o)} disclosure={open ? "up" : "down"}>
        Advanced
      </Button>
      <Collapsible open={open} id={`advanced-${id}`}>
        {children}
      </Collapsible>
    </Box>
  );
}

const DEFAULT_TIER: TierFormValue = {
  qty: 1,
  discountType: "percentage",
  discountValue: 0,
  label: "",
  isMostPopular: false,
  freeGiftVariant: null,
  bogoMode: "",
  bogoTargetVariant: null,
  bogoBonusQty: 1,
  extraProducts: [],
};

export function QbTierBuilder({ tiers, onChange, maxTiers = 10, restrictToProductId }: Props) {
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
        <BlockStack key={i} gap="200">
          <InlineStack gap="200" blockAlign="end">
            <Box minWidth="5rem">
              <TextField
                label="Qty"
                type="number"
                value={String(tier.qty)}
                onChange={(v) => updateTier(i, { qty: parseInt(v, 10) || 0 })}
                autoComplete="off"
                min={1}
              />
            </Box>
            <Box minWidth="10rem">
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
            </Box>
            <Box minWidth="6.25rem">
              <TextField
                label="Value"
                type="number"
                value={String(tier.discountValue)}
                onChange={(v) => updateTier(i, { discountValue: parseFloat(v) || 0 })}
                autoComplete="off"
                min={0}
                step={0.01}
              />
            </Box>
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
        </BlockStack>
      ))}
      <Button onClick={addTier} disabled={tiers.length >= maxTiers}>
        {tiers.length >= maxTiers ? `Add tier (max ${maxTiers})` : "Add tier"}
      </Button>
    </BlockStack>
  );
}
