import { Button, ButtonGroup, BlockStack, InlineStack, TextField, Select, Checkbox, Text, Collapsible, Box } from "@shopify/polaris";
import { useRef, useState } from "react";
import { VariantPicker, type PickedVariant } from "./VariantPicker";
import { ProductPicker, type PickedProduct } from "./ProductPicker";
import { ShopifyImageField } from "./ShopifyImageField";
import { reorderTiers, duplicateTier, setMostPopular, setTierEnabled } from "~/lib/qb-tier-ops";
import { tierDiscountTab, applyDiscountTab, type DiscountTab } from "~/lib/qb-tier-discount";

export type TierFormValue = {
  qty: number;
  discountType: "percentage" | "flat" | "fixed_per_unit";
  discountValue: number;
  label: string;
  isMostPopular: boolean;
  enabled?: boolean;
  image?: string;
  freeShipping?: boolean;
  soldOut?: boolean;
  priceRounding?: number;
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
  image: undefined,
  freeShipping: false,
  soldOut: false,
  priceRounding: undefined,
  freeGiftVariant: null,
  bogoMode: "",
  bogoTargetVariant: null,
  bogoBonusQty: 1,
  extraProducts: [],
};

export function QbTierBuilder({ tiers, onChange, maxTiers = 10, restrictToProductId }: Props) {
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({});
  // Local visibility for the Free Gift / Image add-on config blocks. A chip is
  // "active" when its data is set OR it's been locally toggled open.
  const [addonOpen, setAddonOpen] = useState<Record<number, { gift?: boolean; image?: boolean }>>({});
  const dragFrom = useRef<number | null>(null);

  const setAddon = (index: number, patch: { gift?: boolean; image?: boolean }) => {
    setAddonOpen((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));
  };

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
                <BlockStack gap="300">
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
                  {(() => {
                    const activeTab = tierDiscountTab(tier);
                    const TABS: { tab: DiscountTab; label: string }[] = [
                      { tab: "percentage", label: "% Off" },
                      { tab: "flat", label: "Flat" },
                      { tab: "fixed_per_unit", label: "Specific" },
                      { tab: "bogo", label: "BOGO" },
                      { tab: "none", label: "None" },
                    ];
                    return (
                      <BlockStack gap="200">
                        <Text as="span" variant="bodySm" tone="subdued">Select discount type</Text>
                        <ButtonGroup variant="segmented">
                          {TABS.map(({ tab, label }) => (
                            <Button key={tab} pressed={activeTab === tab} onClick={() => updateTier(i, applyDiscountTab(tier, tab))}>{label}</Button>
                          ))}
                        </ButtonGroup>
                        {activeTab === "percentage" && (
                          <TextField label="Discount in %" type="number" autoComplete="off" value={String(tier.discountValue)} onChange={(v) => updateTier(i, { discountValue: parseFloat(v) || 0 })} />
                        )}
                        {activeTab === "flat" && (
                          <TextField label="Discount amount" type="number" autoComplete="off" value={String(tier.discountValue)} onChange={(v) => updateTier(i, { discountValue: parseFloat(v) || 0 })} />
                        )}
                        {activeTab === "fixed_per_unit" && (
                          <TextField label="Price per unit" type="number" autoComplete="off" value={String(tier.discountValue)} onChange={(v) => updateTier(i, { discountValue: parseFloat(v) || 0 })} />
                        )}
                        {activeTab === "none" && (
                          <Text as="p" tone="subdued" variant="bodySm">This tier sells at standard price.</Text>
                        )}
                        {activeTab === "bogo" && (
                          <BlockStack gap="200">
                            <Select
                              label="BOGO type"
                              options={[
                                { label: "Add same product free", value: "add_same" },
                                { label: "Add a different product free", value: "add_different" },
                                { label: "Every Nth free", value: "nth_free" },
                              ]}
                              value={tier.bogoMode || "add_same"}
                              onChange={(v) => updateTier(i, { bogoMode: v as TierFormValue["bogoMode"] })}
                            />
                            {tier.bogoMode === "add_different" && (
                              <BlockStack gap="100">
                                <Text as="span" variant="bodySm" tone="subdued">Free product</Text>
                                <VariantPicker
                                  variant={tier.bogoTargetVariant ?? null}
                                  onChange={(pv) => updateTier(i, { bogoTargetVariant: pv })}
                                />
                              </BlockStack>
                            )}
                            <TextField label="Bonus quantity" type="number" autoComplete="off" value={String(tier.bogoBonusQty ?? 1)} onChange={(v) => updateTier(i, { bogoBonusQty: Math.max(1, parseInt(v, 10) || 1) })} />
                          </BlockStack>
                        )}
                      </BlockStack>
                    );
                  })()}
                  {(() => {
                    const giftActive = !!tier.freeGiftVariant || !!addonOpen[i]?.gift;
                    const imageActive = !!tier.image || !!addonOpen[i]?.image;
                    const shipActive = tier.freeShipping === true;
                    return (
                      <BlockStack gap="200">
                        <Text as="span" variant="bodySm" tone="subdued">Add-Ons</Text>
                        <ButtonGroup>
                          <Button
                            pressed={giftActive}
                            onClick={() => {
                              if (giftActive) {
                                setAddon(i, { gift: false });
                                updateTier(i, { freeGiftVariant: null });
                              } else {
                                setAddon(i, { gift: true });
                              }
                            }}
                          >
                            + Free Gift
                          </Button>
                          <Button
                            pressed={imageActive}
                            onClick={() => {
                              if (imageActive) {
                                setAddon(i, { image: false });
                                updateTier(i, { image: undefined });
                              } else {
                                setAddon(i, { image: true });
                              }
                            }}
                          >
                            + Image
                          </Button>
                          <Button
                            pressed={shipActive}
                            onClick={() => updateTier(i, { freeShipping: !tier.freeShipping })}
                          >
                            + Free Ship
                          </Button>
                        </ButtonGroup>
                        {giftActive && (
                          <BlockStack gap="100">
                            <Text as="span" variant="bodySm" tone="subdued">Free gift</Text>
                            <VariantPicker
                              variant={tier.freeGiftVariant ?? null}
                              onChange={(pv) => updateTier(i, { freeGiftVariant: pv })}
                            />
                          </BlockStack>
                        )}
                        {imageActive && (
                          <ShopifyImageField
                            label="Tier image"
                            value={tier.image ?? ""}
                            onChange={(url) => updateTier(i, { image: url || undefined })}
                          />
                        )}
                      </BlockStack>
                    );
                  })()}
                </BlockStack>
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
