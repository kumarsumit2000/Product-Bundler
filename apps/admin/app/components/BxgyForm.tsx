import { Form, useNavigation, useNavigate } from "@remix-run/react";
import {
  BlockStack, Box, Card, ChoiceList, Banner, TextField, Checkbox, Button, InlineStack, Text,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { ProductPicker, type PickedProduct } from "./ProductPicker";
import { VariantPicker, type PickedVariant } from "./VariantPicker";
import { type PickedCollection } from "./CollectionPicker";
import { MultiCollectionPicker } from "./MultiCollectionPicker";
import { BxgyBarBuilder, EMPTY_BAR, type BxgyBarValue } from "./BxgyBarBuilder";
import { QbUpsellsBuilder, type UpsellFormValue } from "./QbUpsellsBuilder";
import { WidgetAddonsCard, DEFAULT_ADDONS_ORDER, type AddonsOrderItem } from "./WidgetAddonsCard";
import { StickyAtcCard, STICKY_ATC_DEFAULTS } from "./StickyAtcCard";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { EMPTY_SUBSCRIPTION } from "~/lib/parse-subscription";
import { SimpleQbStylePanel } from "./SimpleQbStylePanel";
import { type StylePanelValues } from "./StylePanel";
import { EMPTY_STYLE_FORM, buildStyleOverrides } from "~/lib/preview-overrides";
import type { StickyAtcConfig, SubscriptionConfig } from "../../drizzle/schema";

type Status = "draft" | "active" | "paused";
// DOM id the route uses to wire a Polaris Page primaryAction "Save"
// button to this form.
export const BXGY_FORM_ID = "bxgy-form";

export type BxgyVisibility = "all" | "all_except" | "specific" | "collections";

export type BxgyFormValues = StylePanelValues & {
  name: string;
  status: Status;
  product: PickedProduct[];
  headline: string;
  ctaLabel: string;
  bars: BxgyBarValue[];
  combinable: boolean;
  visibility: BxgyVisibility;
  visibilityProducts: PickedProduct[];
  visibilityCollections: PickedCollection[];
  linkedProgressiveGiftId: string | null;
  addonsOrder: AddonsOrderItem[];
  stickyAtc: StickyAtcConfig;
  subscription: SubscriptionConfig;
  freeGiftEnabled: boolean;
  freeGiftMode: "variant" | "product";
  freeGiftVariant: PickedVariant | null;
  freeGiftProduct: PickedProduct | null;
  freeGiftMinBuyQty: string;
  checkboxUpsellsEnabled: boolean;
  checkboxUpsells: UpsellFormValue[];
  textOverrides: Record<string, string>;
  bindToCurrentProduct: boolean;
  sortOrder: string;
  activeStartAt: string;
  activeEndAt: string;
};

type AddonOption = { id: string; name: string };

type Props = {
  submitLabel: string;
  initialValues?: Partial<BxgyFormValues>;
  errors?: Record<string, string>;
  onValuesChange?: (v: BxgyFormValues) => void;
  progressiveGiftOptions?: AddonOption[];
};

const DEFAULTS: BxgyFormValues = {
  ...EMPTY_STYLE_FORM,
  name: "",
  status: "draft",
  product: [],
  headline: "Pick your deal",
  ctaLabel: "",
  bars: [
    { ...EMPTY_BAR, id: "bar-1", buyQty: 1, getQty: 1, title: "Buy 1, get 1 free" },
  ],
  combinable: false,
  visibility: "specific",
  visibilityProducts: [],
  visibilityCollections: [],
  linkedProgressiveGiftId: null,
  addonsOrder: [...DEFAULT_ADDONS_ORDER],
  stickyAtc: STICKY_ATC_DEFAULTS,
  subscription: EMPTY_SUBSCRIPTION,
  freeGiftEnabled: false,
  freeGiftMode: "product",
  freeGiftVariant: null,
  freeGiftProduct: null,
  freeGiftMinBuyQty: "1",
  checkboxUpsellsEnabled: false,
  checkboxUpsells: [],
  textOverrides: { "bxgy.freeGiftCallout": "", "bxgy.freeGiftCallout.hidden": "" },
  bindToCurrentProduct: false,
  sortOrder: "0",
  activeStartAt: "",
  activeEndAt: "",
};

export function BxgyForm({
  submitLabel, initialValues, errors, onValuesChange,
  progressiveGiftOptions = [],
}: Props) {
  const [values, setValues] = useState<BxgyFormValues>({ ...DEFAULTS, ...initialValues });
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSubmitting = navigation.state === "submitting";

  const update = <K extends keyof BxgyFormValues>(k: K, v: BxgyFormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  useEffect(() => { onValuesChange?.(values); }, [values, onValuesChange]);

  const hasErrors = errors && Object.keys(errors).length > 0;

  return (
    <Form method="post" id={BXGY_FORM_ID}>
      <input type="hidden" name="bars" value={JSON.stringify(values.bars)} />
      <input type="hidden" name="productId" value={values.product[0]?.productId ?? ""} />
      <input type="hidden" name="visibility" value={values.visibility} />
      <input
        type="hidden"
        name="visibilityProductIds"
        value={JSON.stringify(values.visibilityProducts.map((p) => p.productId))}
      />
      <input
        type="hidden"
        name="visibilityCollectionIds"
        value={JSON.stringify(values.visibilityCollections.map((c) => c.collectionId))}
      />
      <input type="hidden" name="linkedProgressiveGiftId" value={values.linkedProgressiveGiftId ?? ""} />
      <input type="hidden" name="addonsOrder" value={JSON.stringify(values.addonsOrder)} />
      <input type="hidden" name="stickyAtc" value={JSON.stringify(values.stickyAtc)} />
      <input type="hidden" name="subscription" value={JSON.stringify(values.subscription)} />
      <input
        type="hidden"
        name="freeGiftVariantId"
        value={values.freeGiftEnabled && values.freeGiftMode === "variant" ? values.freeGiftVariant?.variantId ?? "" : ""}
      />
      <input
        type="hidden"
        name="freeGiftProductId"
        value={values.freeGiftEnabled && values.freeGiftMode === "product" ? values.freeGiftProduct?.productId ?? "" : ""}
      />
      <input type="hidden" name="freeGiftMinBuyQty" value={values.freeGiftMinBuyQty} />
      <input type="hidden" name="checkboxUpsellsEnabled" value={values.checkboxUpsellsEnabled ? "on" : ""} />
      <input
        type="hidden"
        name="checkboxUpsells"
        value={JSON.stringify(values.checkboxUpsells.map((u) => ({
          id: u.id,
          mode: u.mode,
          productId: u.product?.productId ?? "",
          variantId: u.product?.variantId ?? null,
          productTitle: u.product?.title ?? "",
          productImage: u.product?.image ?? null,
          productPriceCents: u.product?.priceCents ?? null,
          discountType: u.discountType,
          discountValue: parseFloat(u.discountValue) || 0,
          title: u.title,
          subtitle: u.subtitle,
          selectedByDefault: u.selectedByDefault,
        })))}
      />
      <input
        type="hidden"
        name="styleOverrides"
        value={JSON.stringify(buildStyleOverrides(values) ?? {})}
      />
      <input
        type="hidden"
        name="textOverrides"
        value={JSON.stringify(
          Object.fromEntries(Object.entries(values.textOverrides).filter(([, v]) => v.length > 0)),
        )}
      />
      <input type="hidden" name="status" value={values.status} />
      <input type="hidden" name="combinable" value={values.combinable ? "on" : ""} />
      <input type="hidden" name="bindToCurrentProduct" value={values.bindToCurrentProduct ? "on" : ""} />
      <input type="hidden" name="sortOrder" value={values.sortOrder} />
      <input type="hidden" name="activeStartAt" value={values.activeStartAt} />
      <input type="hidden" name="activeEndAt" value={values.activeEndAt} />

      <BlockStack gap="500">
        {hasErrors && (
          <Banner tone="critical" title="Fix these issues to save">
            <Text as="p">{Object.values(errors!).join(" • ")}</Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Name + product</Text>
            <TextField
              label="Name"
              name="name"
              value={values.name}
              onChange={(v) => update("name", v)}
              error={errors?.name}
              autoComplete="off"
              maxLength={100}
              placeholder="Internal name (e.g. Spring BOGO)"
            />
            <ChoiceList
              title="Apply offer to"
              titleHidden
              choices={[
                {
                  label: "A specific product",
                  value: "specific",
                  helpText: "Bars buy/get units of the product you pick below.",
                },
                {
                  label: "Whichever product the customer is viewing",
                  value: "current",
                  helpText: "Universal template — works on every product page (e.g. 'Buy 2 of anything, get 1 free').",
                },
              ]}
              selected={[values.bindToCurrentProduct ? "current" : "specific"]}
              onChange={(s) => update("bindToCurrentProduct", s[0] === "current")}
            />
            {!values.bindToCurrentProduct && (
              <>
                <ProductPicker
                  products={values.product}
                  onChange={(p) => update("product", p)}
                  showQty={false}
                />
                {errors?.productId && <Banner tone="critical">{errors.productId}</Banner>}
              </>
            )}
            {values.bindToCurrentProduct && (
              <Banner tone="info">
                Bars will buy and get units of whatever product the customer is currently viewing,
                using that product's variants and prices.
              </Banner>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Bars</Text>
            <Text as="p" tone="subdued">
              Each bar is one offer the customer can pick. Buy block stays at full price by default;
              the Get block is discounted (100% = free).
            </Text>
            <BxgyBarBuilder bars={values.bars} onChange={(bars) => update("bars", bars)} />
            {errors?.bars && <Banner tone="critical">{errors.bars}</Banner>}
          </BlockStack>
        </Card>

        {!values.bindToCurrentProduct && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Visibility</Text>
              <Text as="p" tone="subdued">Control which product pages this offer shows on.</Text>
              <ChoiceList
                title="Show on"
                titleHidden
                choices={[
                  { label: "Same as picked product", value: "specific" },
                  { label: "All products", value: "all" },
                  { label: "All products except selected", value: "all_except" },
                  { label: "Products in selected collections", value: "collections" },
                ]}
                selected={[values.visibility]}
                onChange={(s) => update("visibility", s[0] as BxgyVisibility)}
              />
              {values.visibility === "all_except" && (
                <ProductPicker
                  products={values.visibilityProducts}
                  onChange={(p) => update("visibilityProducts", p)}
                  multiple
                  showQty={false}
                />
              )}
              {values.visibility === "collections" && (
                <MultiCollectionPicker
                  collections={values.visibilityCollections}
                  onChange={(c) => update("visibilityCollections", c)}
                />
              )}
            </BlockStack>
          </Card>
        )}

        <WidgetAddonsCard
          progressiveGifts={progressiveGiftOptions}
          linkedProgressiveGiftId={values.linkedProgressiveGiftId}
          widgetLabel="BXGY widget"
          onChange={(patch) => setValues((s) => ({ ...s, ...patch }))}
        />

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Free gift</Text>
            <Checkbox
              label="Include a free gift with this offer"
              checked={values.freeGiftEnabled}
              onChange={(enabled) => {
                update("freeGiftEnabled", enabled);
                if (!enabled) {
                  update("freeGiftVariant", null);
                  update("freeGiftProduct", null);
                }
              }}
            />
            {values.freeGiftEnabled && (
              <BlockStack gap="300">
                <Text as="p" tone="subdued">
                  The gift unlocks once the customer picks a bar with buy qty ≥ the minimum below —
                  discounted 100% at checkout.
                </Text>
                <TextField
                  label="Minimum buy qty to unlock the gift"
                  type="number"
                  min={1}
                  value={values.freeGiftMinBuyQty}
                  onChange={(v) => update("freeGiftMinBuyQty", v)}
                  autoComplete="off"
                />
                <ChoiceList
                  title="Pick from"
                  titleHidden
                  choices={[
                    {
                      label: "Any product (customer picks the variant)",
                      value: "product",
                      helpText: "Show every product. The shopper chooses which variant to claim.",
                    },
                    {
                      label: "A specific variant",
                      value: "variant",
                      helpText: "Pin one exact variant.",
                    },
                  ]}
                  selected={[values.freeGiftMode]}
                  onChange={(s) => {
                    const mode = s[0] as BxgyFormValues["freeGiftMode"];
                    update("freeGiftMode", mode);
                    if (mode === "product") update("freeGiftVariant", null);
                    else update("freeGiftProduct", null);
                  }}
                />
                {values.freeGiftMode === "product" ? (
                  <ProductPicker
                    products={values.freeGiftProduct ? [values.freeGiftProduct] : []}
                    onChange={(p) => update("freeGiftProduct", p[0] ?? null)}
                    showQty={false}
                  />
                ) : (
                  <VariantPicker
                    variant={values.freeGiftVariant}
                    onChange={(v) => update("freeGiftVariant", v)}
                  />
                )}
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <QbUpsellsBuilder
          enabled={values.checkboxUpsellsEnabled}
          onEnabledChange={(checkboxUpsellsEnabled) => update("checkboxUpsellsEnabled", checkboxUpsellsEnabled)}
          upsells={values.checkboxUpsells}
          onUpsellsChange={(checkboxUpsells) => update("checkboxUpsells", checkboxUpsells)}
        />

        <StickyAtcCard
          value={values.stickyAtc}
          onChange={(stickyAtc) => update("stickyAtc", stickyAtc)}
        />

        <SubscriptionPanel
          value={values.subscription}
          onChange={(v) => update("subscription", v)}
        />

        <SimpleQbStylePanel values={values} onChange={(next) => setValues((s) => ({ ...s, ...next }))} />

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Text overrides</Text>
            <Text as="p" tone="subdued">Rename labels shown on the widget. Leave empty to use defaults.</Text>
            <Checkbox
              label="Show free gift callout"
              checked={values.textOverrides["bxgy.freeGiftCallout.hidden"] !== "1"}
              onChange={(checked) =>
                update("textOverrides", {
                  ...values.textOverrides,
                  "bxgy.freeGiftCallout.hidden": checked ? "" : "1",
                })
              }
              helpText="Hide this if you don't want any callout shown when a bar unlocks the free gift."
            />
            <TextField
              label="Free gift unlocked callout"
              value={values.textOverrides["bxgy.freeGiftCallout"] ?? ""}
              onChange={(v) => update("textOverrides", { ...values.textOverrides, "bxgy.freeGiftCallout": v })}
              placeholder="Unlock Free Gift 🎁"
              helpText="Shown inside a bar card when its buy quantity unlocks the free gift."
              autoComplete="off"
              maxLength={120}
              disabled={values.textOverrides["bxgy.freeGiftCallout.hidden"] === "1"}
            />
            {errors?.textOverrides && <Banner tone="critical">{errors.textOverrides}</Banner>}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Settings</Text>
            <ChoiceList
              title="Status"
              choices={[
                { label: "Draft", value: "draft" },
                { label: "Active", value: "active" },
                { label: "Paused", value: "paused" },
              ]}
              selected={[values.status]}
              onChange={(s) => update("status", s[0] as Status)}
            />
            <Checkbox
              label="Combinable with other discounts"
              checked={values.combinable}
              onChange={(c) => update("combinable", c)}
            />
            <TextField
              label="Sort order"
              type="number"
              value={values.sortOrder}
              onChange={(v) => update("sortOrder", v)}
              autoComplete="off"
              helpText="Lower numbers show first when multiple BXGY offers target the same product page."
            />
            <TextField
              label="Active from (optional)"
              type="datetime-local"
              value={values.activeStartAt}
              onChange={(v) => update("activeStartAt", v)}
              autoComplete="off"
              helpText="Offer stays hidden before this. Leave blank for immediate."
            />
            <TextField
              label="Active until (optional)"
              type="datetime-local"
              value={values.activeEndAt}
              onChange={(v) => update("activeEndAt", v)}
              autoComplete="off"
              helpText="Offer hides automatically after this. Leave blank for no expiry."
            />
            <TextField
              label="Headline (optional)"
              name="headline"
              value={values.headline}
              onChange={(v) => update("headline", v)}
              autoComplete="off"
              maxLength={120}
            />
            <TextField
              label="CTA label (optional)"
              name="ctaLabel"
              value={values.ctaLabel}
              onChange={(v) => update("ctaLabel", v)}
              autoComplete="off"
              maxLength={50}
              placeholder="Add to cart"
            />
          </BlockStack>
        </Card>

        <Box paddingBlockEnd="600">
          <InlineStack align="end" gap="300">
            <Button onClick={() => navigate("/app/bxgy-offers")}>Cancel</Button>
            <Button submit variant="primary" loading={isSubmitting}>
              {submitLabel}
            </Button>
          </InlineStack>
        </Box>
      </BlockStack>
    </Form>
  );
}
