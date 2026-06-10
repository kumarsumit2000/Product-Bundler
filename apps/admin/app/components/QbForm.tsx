import { Form, useNavigation, useNavigate, useSubmit } from "@remix-run/react";
import {
  BlockStack,
  Box,
  ChoiceList,
  Banner,
  TextField,
  Checkbox,
  Button,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { ProductPicker, type PickedProduct } from "./ProductPicker";
import { VariantPicker, type PickedVariant } from "./VariantPicker";
import { type PickedCollection } from "./CollectionPicker";
import { MultiCollectionPicker } from "./MultiCollectionPicker";
import { QbUpsellsBuilder, EMPTY_UPSELL, type UpsellFormValue } from "./QbUpsellsBuilder";
import { WidgetAddonsCard, DEFAULT_ADDONS_ORDER, type AddonsOrderItem } from "./WidgetAddonsCard";
import { StickyAtcCard, STICKY_ATC_DEFAULTS } from "./StickyAtcCard";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { EMPTY_SUBSCRIPTION } from "~/lib/parse-subscription";
import { QbTierBuilder, type TierFormValue } from "./QbTierBuilder";
import type { StickyAtcConfig, SubscriptionConfig } from "../../drizzle/schema";
import { type StylePanelValues } from "./StylePanel";
import { SimpleQbStylePanel } from "./SimpleQbStylePanel";
import { EMPTY_STYLE_FORM, buildStyleOverrides } from "~/lib/preview-overrides";
import { CollapsibleSection } from "~/components/CollapsibleSection";

// DOM id the route uses to wire a Polaris Page primaryAction "Save"
// button to this form.
export const QB_FORM_ID = "qb-form";

type Status = "draft" | "active" | "paused";
export type QbVisibility = "all" | "all_except" | "specific" | "collections";

export type QbFormValues = StylePanelValues & {
  name: string;
  product: PickedProduct[];
  tiers: TierFormValue[];
  combinable: boolean;
  status: Status;
  headline: string;
  ctaLabel: string;
  textOverrides: Record<string, string>;
  bindToCurrentProduct: boolean;
  sortOrder: string;
  activeStartAt: string;
  activeEndAt: string;
  visibility: QbVisibility;
  visibilityProducts: PickedProduct[];
  visibilityCollections: PickedCollection[];
  checkboxUpsellsEnabled: boolean;
  checkboxUpsells: UpsellFormValue[];
  linkedProgressiveGiftId: string | null;
  addonsOrder: AddonsOrderItem[];
  stickyAtc: StickyAtcConfig;
  subscription: SubscriptionConfig;
  freeGiftEnabled: boolean;
  freeGiftMode: "variant" | "product";
  freeGiftVariant: PickedVariant | null;
  freeGiftProduct: PickedProduct | null;
  freeGiftMinQty: string;
};

type AddonOption = { id: string; name: string };

type Props = {
  initialValues?: Partial<QbFormValues>;
  errors?: Record<string, string>;
  submitLabel: string;
  onValuesChange?: (v: QbFormValues) => void;
  progressiveGiftOptions?: AddonOption[];
};

const DEFAULTS: QbFormValues = {
  ...EMPTY_STYLE_FORM,
  name: "",
  product: [],
  tiers: [{ qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: false }],
  combinable: false,
  status: "draft",
  headline: "",
  ctaLabel: "",
  textOverrides: {
    "qb.tierLabel": "",
    "qb.savingsBadge": "",
    "qb.mostPopular": "",
    "qb.giftBadge": "",
    "qb.freeGiftCallout": "",
    "qb.freeGiftCallout.hidden": "",
  },
  bindToCurrentProduct: false,
  sortOrder: "0",
  activeStartAt: "",
  activeEndAt: "",
  visibility: "all",
  visibilityProducts: [],
  visibilityCollections: [],
  checkboxUpsellsEnabled: false,
  checkboxUpsells: [],
  linkedProgressiveGiftId: null,
  addonsOrder: [...DEFAULT_ADDONS_ORDER],
  stickyAtc: STICKY_ATC_DEFAULTS,
  subscription: EMPTY_SUBSCRIPTION,
  freeGiftEnabled: false,
  freeGiftMode: "product",
  freeGiftVariant: null,
  freeGiftProduct: null,
  freeGiftMinQty: "2",
};

export function QbForm({ initialValues, errors, submitLabel, onValuesChange, progressiveGiftOptions = [] }: Props) {
  const [values, setValues] = useState<QbFormValues>({ ...DEFAULTS, ...initialValues });
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const navigate = useNavigate();
  const submit = useSubmit();
  const update = <K extends keyof QbFormValues>(k: K, v: QbFormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    onValuesChange?.(values);
  }, [values, onValuesChange]);

  // Submit-after-render: the footer buttons set `values.status` then flag a
  // pending submit. We submit inside an effect (post-render) so the hidden
  // `status` input has already re-rendered with the new value — submitting
  // immediately after `update("status", ...)` would post the stale status.
  const [pendingSubmit, setPendingSubmit] = useState<Status | null>(null);
  useEffect(() => {
    if (pendingSubmit === null) return;
    // Only fire once the hidden input reflects the requested status.
    if (values.status !== pendingSubmit) return;
    setPendingSubmit(null);
    const form = document.getElementById(QB_FORM_ID) as HTMLFormElement | null;
    if (form) submit(form);
  }, [pendingSubmit, values.status, submit]);

  const saveWithStatus = (status: Status) => {
    update("status", status);
    setPendingSubmit(status);
  };

  const hasErrors = errors && Object.keys(errors).length > 0;

  return (
    <Form method="post" id={QB_FORM_ID}>
      <input
        type="hidden"
        name="productId"
        value={values.product[0]?.productId ?? values.visibilityProducts[0]?.productId ?? ""}
      />
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
      <input type="hidden" name="freeGiftMinQty" value={values.freeGiftMinQty} />
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
      <input type="hidden" name="headline" value={values.headline} />
      <input type="hidden" name="ctaLabel" value={values.ctaLabel} />
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
      <input
        type="hidden"
        name="tiers"
        value={JSON.stringify(values.tiers.map((t) => ({
          qty: t.qty,
          discountType: t.discountType,
          discountValue: t.discountValue,
          label: t.label,
          isMostPopular: t.isMostPopular,
          freeGiftVariantId: t.freeGiftVariant?.variantId ?? null,
          bogo: t.bogoMode
            ? {
                mode: t.bogoMode,
                targetVariantId: t.bogoTargetVariant?.variantId ?? null,
                bonusQty: t.bogoBonusQty ?? 1,
              }
            : null,
          extraProducts: (t.extraProducts ?? []).map((p) => ({
            productId: p.productId,
            variantId: p.variantId ?? null,
            qty: p.qty,
          })),
        })))}
      />

      <BlockStack gap="500">
        {hasErrors && (
          <Banner tone="critical" title="Fix these issues to save">
            <Text as="p">{Object.values(errors!).join(" • ")}</Text>
          </Banner>
        )}

        <CollapsibleSection title="Select Product & Basic Setup" defaultOpen>
          <BlockStack gap="500">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Deal Name</Text>
              <TextField
                label="Deal Name"
                labelHidden
                name="name"
                value={values.name}
                onChange={(v) => update("name", v)}
                error={errors?.name}
                autoComplete="off"
                maxLength={100}
                placeholder="Internal name (e.g. Holiday QB)"
              />
            </BlockStack>

            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Header Text</Text>
              <Text as="p" tone="subdued">Override the headline shown on this widget. Leave empty to use shop defaults.</Text>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Header Text"
                    labelHidden
                    value={values.headline}
                    onChange={(v) => update("headline", v)}
                    error={errors?.headline}
                    placeholder="Choose your savings"
                    autoComplete="off"
                    maxLength={100}
                  />
                </div>
                <span aria-hidden style={{ color: "#9aa0a6", fontSize: 18 }}>→</span>
                <Text as="span" variant="headingMd">{values.headline || "Choose your savings"}</Text>
              </div>
            </BlockStack>

            {!values.bindToCurrentProduct && (
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Apply Deal on</Text>
                <Text as="p" tone="subdued">Control which product pages this widget shows on.</Text>
                <ChoiceList
                  title="Show on"
                  titleHidden
                  choices={[
                    { label: "All products", value: "all" },
                    { label: "All products except selected", value: "all_except" },
                    { label: "Specific products", value: "specific" },
                    { label: "Products in selected collections", value: "collections" },
                  ]}
                  selected={[values.visibility]}
                  onChange={(s) => update("visibility", s[0] as QbVisibility)}
                />
                {(values.visibility === "all_except" || values.visibility === "specific") && (
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
                {errors?.visibility && <Banner tone="critical">{errors.visibility}</Banner>}
              </BlockStack>
            )}

            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Product</Text>
              <ChoiceList
                title="Apply discount to"
                titleHidden
                choices={[
                  {
                    label: "A specific product",
                    value: "specific",
                    helpText: "The discount always applies to the product you pick below.",
                  },
                  {
                    label: "Whichever product the customer is viewing",
                    value: "current",
                    helpText: "Universal template — works on every product page without binding to one product.",
                  },
                ]}
                selected={[values.bindToCurrentProduct ? "current" : "specific"]}
                onChange={(s) => update("bindToCurrentProduct", s[0] === "current")}
              />
              {!values.bindToCurrentProduct && (
                <>
                  <Text as="p" tone="subdued">
                    Pick the product whose variants get added to the cart when a tier is chosen.
                    Visibility settings (above) independently control which PDPs the widget shows on.
                  </Text>
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
                  The widget will read the current product's variants and prices directly from
                  the PDP. Tier discounts apply as a percentage off whatever the customer is viewing.
                </Banner>
              )}
            </BlockStack>
          </BlockStack>
        </CollapsibleSection>

        <CollapsibleSection title="Edit Tier Deals" defaultOpen>
          <BlockStack gap="400">
            <QbTierBuilder
              tiers={values.tiers}
              onChange={(t) => update("tiers", t)}
              restrictToProductId={values.visibilityProducts[0]?.productId ?? values.product[0]?.productId ?? null}
            />
            {errors?.tiers && <Banner tone="critical">{errors.tiers}</Banner>}
          </BlockStack>
        </CollapsibleSection>

        <BlockStack gap="100">
          <Text as="h2" variant="headingLg">Cherries on Top</Text>
          <Text as="p" tone="subdued" variant="bodySm">Color &amp; style, Subscription, Sticky bar, and more</Text>
        </BlockStack>

        <CollapsibleSection title="Color & style">
          <SimpleQbStylePanel values={values} onChange={(next) => setValues((s) => ({ ...s, ...next }))} />
        </CollapsibleSection>

        <CollapsibleSection title="Free gift">
          <BlockStack gap="400">
            <Checkbox
              label="Include a free gift with this quantity break"
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
                  The gift unlocks once the customer picks a tier whose qty is at least
                  the minimum below — discounted 100% at checkout.
                </Text>
                <TextField
                  label="Minimum quantity to unlock the gift"
                  type="number"
                  min={1}
                  value={values.freeGiftMinQty}
                  onChange={(v) => update("freeGiftMinQty", v)}
                  autoComplete="off"
                  helpText="Tip: set this to your highest tier's qty for the &ldquo;BXGY&rdquo; pattern."
                />
                <ChoiceList
                  title="Pick from"
                  titleHidden
                  choices={[
                    {
                      label: "Any product (customer picks the variant)",
                      value: "product",
                      helpText: "Show every product in your catalog. The shopper chooses which variant to claim.",
                    },
                    {
                      label: "A specific variant",
                      value: "variant",
                      helpText: "Pin one exact variant — useful for one-size or sample SKUs.",
                    },
                  ]}
                  selected={[values.freeGiftMode]}
                  onChange={(s) => {
                    const mode = s[0] as QbFormValues["freeGiftMode"];
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
        </CollapsibleSection>

        <CollapsibleSection title="Checkbox upsells">
          <QbUpsellsBuilder
            enabled={values.checkboxUpsellsEnabled}
            onEnabledChange={(checkboxUpsellsEnabled) => update("checkboxUpsellsEnabled", checkboxUpsellsEnabled)}
            upsells={values.checkboxUpsells}
            onUpsellsChange={(checkboxUpsells) => update("checkboxUpsells", checkboxUpsells)}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Add-ons">
          <WidgetAddonsCard
            progressiveGifts={progressiveGiftOptions}
            linkedProgressiveGiftId={values.linkedProgressiveGiftId}
            widgetLabel="Quantity break widget"
            onChange={(patch) => setValues((s) => ({ ...s, ...patch }))}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Subscription">
          <SubscriptionPanel
            value={values.subscription}
            onChange={(v) => update("subscription", v)}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Sticky bar">
          <StickyAtcCard
            value={values.stickyAtc}
            onChange={(stickyAtc) => update("stickyAtc", stickyAtc)}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Settings">
          <BlockStack gap="400">
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
              helpText="Lower numbers show first when multiple QBs target the same product page."
            />
            <TextField
              label="Active from (optional)"
              type="datetime-local"
              value={values.activeStartAt}
              onChange={(v) => update("activeStartAt", v)}
              autoComplete="off"
              helpText="Widget stays hidden before this. Leave blank for immediate."
            />
            <TextField
              label="Active until (optional)"
              type="datetime-local"
              value={values.activeEndAt}
              onChange={(v) => update("activeEndAt", v)}
              autoComplete="off"
              helpText="Widget hides automatically after this. Leave blank for no expiry."
            />

            <TextField
              label="CTA label (optional)"
              value={values.ctaLabel}
              onChange={(v) => update("ctaLabel", v)}
              error={errors?.ctaLabel}
              placeholder="Add to cart"
              autoComplete="off"
              maxLength={50}
            />

            <Text as="h3" variant="headingSm">Text overrides</Text>
            <Text as="p" tone="subdued">Rename the labels and badges shown on the widget. Leave empty to use defaults.</Text>
            <TextField
              label="Tier label"
              value={values.textOverrides["qb.tierLabel"] ?? ""}
              onChange={(v) => update("textOverrides", { ...values.textOverrides, "qb.tierLabel": v })}
              placeholder="Buy {qty}"
              helpText="Available variables: {qty}"
              autoComplete="off"
              maxLength={120}
            />
            <TextField
              label="Savings badge"
              value={values.textOverrides["qb.savingsBadge"] ?? ""}
              onChange={(v) => update("textOverrides", { ...values.textOverrides, "qb.savingsBadge": v })}
              placeholder="−{savings}"
              helpText="Available variables: {savings}"
              autoComplete="off"
              maxLength={120}
            />
            <TextField
              label='"Most popular" badge'
              value={values.textOverrides["qb.mostPopular"] ?? ""}
              onChange={(v) => update("textOverrides", { ...values.textOverrides, "qb.mostPopular": v })}
              placeholder="MOST POPULAR"
              autoComplete="off"
              maxLength={120}
            />
            <TextField
              label="Free gift badge"
              value={values.textOverrides["qb.giftBadge"] ?? ""}
              onChange={(v) => update("textOverrides", { ...values.textOverrides, "qb.giftBadge": v })}
              placeholder="🎁 + Free {variantTitle}"
              helpText="Available variables: {variantTitle}"
              autoComplete="off"
              maxLength={120}
            />
            <Checkbox
              label="Show free gift callout"
              checked={values.textOverrides["qb.freeGiftCallout.hidden"] !== "1"}
              onChange={(checked) =>
                update("textOverrides", {
                  ...values.textOverrides,
                  "qb.freeGiftCallout.hidden": checked ? "" : "1",
                })
              }
              helpText="Hide this if you don't want any callout shown when a tier unlocks the free gift."
            />
            <TextField
              label="Free gift unlocked callout"
              value={values.textOverrides["qb.freeGiftCallout"] ?? ""}
              onChange={(v) => update("textOverrides", { ...values.textOverrides, "qb.freeGiftCallout": v })}
              placeholder="Unlock Free Gift 🎁"
              helpText="Shown inside the tier card when its quantity unlocks the free gift."
              autoComplete="off"
              maxLength={120}
              disabled={values.textOverrides["qb.freeGiftCallout.hidden"] === "1"}
            />
            {(errors?.styleOverrides || errors?.textOverrides) && (
              <Banner tone="critical">{errors?.styleOverrides || errors?.textOverrides}</Banner>
            )}
          </BlockStack>
        </CollapsibleSection>

        <Box paddingBlockEnd="600">
          <InlineStack align="end" gap="300">
            <Button onClick={() => navigate("/app/quantity-breaks")}>Cancel</Button>
            <Button submit variant="primary" loading={isSubmitting}>
              {submitLabel}
            </Button>
          </InlineStack>
        </Box>
      </BlockStack>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 5,
          display: "flex",
          justifyContent: "flex-end",
          gap: 12,
          padding: "12px 0",
          marginTop: 16,
          background: "rgba(241,241,241,0.9)",
          backdropFilter: "blur(2px)",
        }}
      >
        <Button onClick={() => saveWithStatus("draft")} loading={isSubmitting}>
          Save as draft
        </Button>
        <Button variant="primary" onClick={() => saveWithStatus("active")} loading={isSubmitting}>
          Publish
        </Button>
      </div>
    </Form>
  );
}
