import { Button, BlockStack, InlineStack, TextField, Select, Checkbox, Text, Collapsible, Box } from "@shopify/polaris";
import { useRef, useState } from "react";
import { VariantPicker, type PickedVariant } from "./VariantPicker";
import { ProductPicker, type PickedProduct } from "./ProductPicker";
import { reorderTiers, duplicateTier, setMostPopular, setTierEnabled } from "~/lib/qb-tier-ops";

export type TierFormValue = {
  qty: number;
  discountType: "percentage" | "flat" | "fixed_per_unit";
  discountValue: number;
  label: string;
  isMostPopular: boolean;
  enabled?: boolean;
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
  enabled: true,
  freeGiftVariant: null,
  bogoMode: "",
  bogoTargetVariant: null,
  bogoBonusQty: 1,
  extraProducts: [],
};

export function QbTierBuilder({ tiers, onChange, maxTiers = 10, restrictToProductId }: Props) {
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({});
  const dragFrom = useRef<number | null>(null);

  const updateTier = (index: number, patch: Partial<TierFormValue>) => {
    onChange(tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const addTier = () => {
    const lastQty = tiers.length > 0 ? tiers[tiers.length - 1]!.qty : 0;
    const newIndex = tiers.length;
    onChange([...tiers, { ...DEFAULT_TIER, qty: lastQty + 1 }]);
    setOpenRows((prev) => ({ ...prev, [newIndex]: true }));
  };

  const removeTier = (index: number) => {
    onChange(tiers.filter((_, i) => i !== index));
  };

  return (
    <BlockStack gap="300">
      {tiers.map((tier, i) => {
        const isOpen = !!openRows[i];
        const isEnabled = tier.enabled !== false;
        return (
          <Box
            key={i}
            borderWidth="025"
            borderColor="border"
            borderRadius="200"
            padding="200"
          >
            <div
              draggable
              onDragStart={() => {
                dragFrom.current = i;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom.current !== null) {
                  onChange(reorderTiers(tiers, dragFrom.current, i));
                  dragFrom.current = null;
                }
              }}
            >
              <InlineStack gap="200" blockAlign="center" align="space-between">
                <InlineStack gap="200" blockAlign="center">
                  <span
                    aria-hidden="true"
                    style={{ cursor: "grab", userSelect: "none", fontSize: "1.1rem", lineHeight: 1 }}
                    title="Drag to reorder"
                  >
                    ⠿
                  </span>
                  <Checkbox
                    label="Enabled"
                    labelHidden
                    checked={isEnabled}
                    onChange={(checked) => onChange(setTierEnabled(tiers, i, checked))}
                  />
                  <Text as="span" variant="bodyMd" fontWeight="medium">
                    {`Tier ${i + 1}: Buy ${tier.qty}`}
                  </Text>
                </InlineStack>
                <InlineStack gap="100" blockAlign="center">
                  <Button variant="tertiary" onClick={() => onChange(duplicateTier(tiers, i))}>
                    Duplicate
                  </Button>
                  <Button
                    variant="tertiary"
                    onClick={() => onChange(setMostPopular(tiers, tier.isMostPopular ? -1 : i))}
                    aria-pressed={tier.isMostPopular}
                    accessibilityLabel="Mark as most popular"
                  >
                    {tier.isMostPopular ? "★" : "☆"}
                  </Button>
                  <Button
                    variant="tertiary"
                    disclosure={isOpen ? "up" : "down"}
                    onClick={() => setOpenRows((prev) => ({ ...prev, [i]: !prev[i] }))}
                    accessibilityLabel={isOpen ? "Collapse tier" : "Expand tier"}
                  >
                    {""}
                  </Button>
                </InlineStack>
              </InlineStack>
            </div>
            <Collapsible open={isOpen} id={`qb-tier-body-${i}`}>
              <Box paddingBlockStart="300">
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
                  <Button onClick={() => removeTier(i)} tone="critical" variant="plain">
                    Remove
                  </Button>
                </InlineStack>
              </Box>
            </Collapsible>
          </Box>
        );
      })}
      <Button onClick={addTier} disabled={tiers.length >= maxTiers}>
        {tiers.length >= maxTiers ? `Add tier (max ${maxTiers})` : "Add tier"}
      </Button>
    </BlockStack>
  );
}
