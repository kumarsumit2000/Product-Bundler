import { Button, BlockStack, InlineStack, TextField, Select, Checkbox, Text, Collapsible, Box } from "@shopify/polaris";
import { useState } from "react";
import { VariantPicker, type PickedVariant } from "./VariantPicker";

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
};

type Props = {
  tiers: TierFormValue[];
  onChange: (tiers: TierFormValue[]) => void;
  maxTiers?: number;
  restrictToProductId?: string | null;
};

function AdvancedSection({ id, children }: { id: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
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
          <AdvancedSection id={String(i)}>
            <BlockStack gap="300" inlineAlign="stretch">
              <BlockStack gap="100">
                <Text as="h4" variant="headingSm">Free gift</Text>
                <VariantPicker
                  variant={tier.freeGiftVariant ?? null}
                  onChange={(v) => updateTier(i, { freeGiftVariant: v })}
                />
              </BlockStack>

              <BlockStack gap="100">
                <Text as="h4" variant="headingSm">BOGO</Text>
                <Select
                  label="Mode"
                  options={[
                    { label: "None", value: "" },
                    { label: "Add 1 free of the same variant", value: "add_same" },
                    { label: "Add a different variant free", value: "add_different" },
                    { label: "Make the Nth unit free", value: "nth_free" },
                  ]}
                  value={tier.bogoMode ?? ""}
                  onChange={(v) => updateTier(i, { bogoMode: v as TierFormValue["bogoMode"] })}
                />

                {tier.bogoMode === "add_same" && (
                  <BlockStack gap="200">
                    <VariantPicker
                      variant={tier.bogoTargetVariant ?? null}
                      onChange={(v) => updateTier(i, { bogoTargetVariant: v })}
                      restrictToProductId={restrictToProductId ?? null}
                    />
                    <TextField
                      label="Bonus units"
                      type="number"
                      value={String(tier.bogoBonusQty ?? 1)}
                      onChange={(v) => updateTier(i, { bogoBonusQty: parseInt(v, 10) || 1 })}
                      autoComplete="off"
                      min={1}
                    />
                  </BlockStack>
                )}

                {tier.bogoMode === "add_different" && (
                  <BlockStack gap="200">
                    <VariantPicker
                      variant={tier.bogoTargetVariant ?? null}
                      onChange={(v) => updateTier(i, { bogoTargetVariant: v })}
                    />
                    <TextField
                      label="Bonus units"
                      type="number"
                      value={String(tier.bogoBonusQty ?? 1)}
                      onChange={(v) => updateTier(i, { bogoBonusQty: parseInt(v, 10) || 1 })}
                      autoComplete="off"
                      min={1}
                    />
                  </BlockStack>
                )}

                {tier.bogoMode === "nth_free" && (
                  <BlockStack gap="100">
                    <TextField
                      label="Free units (must be < tier qty)"
                      type="number"
                      value={String(tier.bogoBonusQty ?? 1)}
                      onChange={(v) => updateTier(i, { bogoBonusQty: parseInt(v, 10) || 1 })}
                      autoComplete="off"
                      min={1}
                      max={Math.max(1, tier.qty - 1)}
                    />
                    <Text as="p" variant="bodySm" tone="subdued">
                      Customer pays for {Math.max(0, tier.qty - (tier.bogoBonusQty ?? 1))} of {tier.qty} units
                      (~{Math.round(((tier.bogoBonusQty ?? 1) / Math.max(1, tier.qty)) * 100)}% off).
                    </Text>
                  </BlockStack>
                )}
              </BlockStack>
            </BlockStack>
          </AdvancedSection>
        </BlockStack>
      ))}
      <Button onClick={addTier} disabled={tiers.length >= maxTiers}>
        {tiers.length >= maxTiers ? `Add tier (max ${maxTiers})` : "Add tier"}
      </Button>
    </BlockStack>
  );
}
