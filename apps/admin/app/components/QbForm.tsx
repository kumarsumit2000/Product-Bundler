import { Form, useNavigation, useNavigate } from "@remix-run/react";
import {
  BlockStack,
  Box,
  Card,
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
import { type PickedCollection } from "./CollectionPicker";
import { MultiCollectionPicker } from "./MultiCollectionPicker";
import { QbUpsellsBuilder, EMPTY_UPSELL, type UpsellFormValue } from "./QbUpsellsBuilder";
import { QbTierBuilder, type TierFormValue } from "./QbTierBuilder";
import { type StylePanelValues } from "./StylePanel";
import { SimpleQbStylePanel } from "./SimpleQbStylePanel";
import { EMPTY_STYLE_FORM, buildStyleOverrides } from "~/lib/preview-overrides";

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
  visibility: QbVisibility;
  visibilityProducts: PickedProduct[];
  visibilityCollections: PickedCollection[];
  checkboxUpsellsEnabled: boolean;
  checkboxUpsells: UpsellFormValue[];
};

type Props = {
  initialValues?: Partial<QbFormValues>;
  errors?: Record<string, string>;
  submitLabel: string;
  onValuesChange?: (v: QbFormValues) => void;
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
  },
  visibility: "all",
  visibilityProducts: [],
  visibilityCollections: [],
  checkboxUpsellsEnabled: false,
  checkboxUpsells: [],
};

export function QbForm({ initialValues, errors, submitLabel, onValuesChange }: Props) {
  const [values, setValues] = useState<QbFormValues>({ ...DEFAULTS, ...initialValues });
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const navigate = useNavigate();
  const update = <K extends keyof QbFormValues>(k: K, v: QbFormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    onValuesChange?.(values);
  }, [values, onValuesChange]);

  const hasErrors = errors && Object.keys(errors).length > 0;

  return (
    <Form method="post">
      <input
        type="hidden"
        name="productId"
        value={values.visibilityProducts[0]?.productId ?? values.product[0]?.productId ?? ""}
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
      <input type="hidden" name="subscription" value="null" />
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

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Name</Text>
            <TextField
              label="Name"
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
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Tiers</Text>
            <QbTierBuilder
              tiers={values.tiers}
              onChange={(t) => update("tiers", t)}
              restrictToProductId={values.visibilityProducts[0]?.productId ?? values.product[0]?.productId ?? null}
            />
            {errors?.tiers && <Banner tone="critical">{errors.tiers}</Banner>}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Visibility</Text>
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
        </Card>

        <QbUpsellsBuilder
          enabled={values.checkboxUpsellsEnabled}
          onEnabledChange={(checkboxUpsellsEnabled) => update("checkboxUpsellsEnabled", checkboxUpsellsEnabled)}
          upsells={values.checkboxUpsells}
          onUpsellsChange={(checkboxUpsells) => update("checkboxUpsells", checkboxUpsells)}
        />

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
              name="status"
            />
            <Checkbox
              label="Combinable with other discounts"
              checked={values.combinable}
              onChange={(c) => update("combinable", c)}
              name="combinable"
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Headline & CTA</Text>
            <Text as="p" tone="subdued">Override the headline and CTA shown on this widget. Leave empty to use shop defaults.</Text>
            <TextField
              label="Headline (optional)"
              value={values.headline}
              onChange={(v) => update("headline", v)}
              error={errors?.headline}
              placeholder="Choose your savings"
              autoComplete="off"
              maxLength={100}
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
          </BlockStack>
        </Card>

        <SimpleQbStylePanel values={values} onChange={(next) => setValues((s) => ({ ...s, ...next }))} />

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Text overrides</Text>
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
            {(errors?.styleOverrides || errors?.textOverrides) && (
              <Banner tone="critical">{errors?.styleOverrides || errors?.textOverrides}</Banner>
            )}
          </BlockStack>
        </Card>

        <Box paddingBlockEnd="600">
          <InlineStack align="end" gap="300">
            <Button onClick={() => navigate("/app/quantity-breaks")}>Cancel</Button>
            <Button submit variant="primary" loading={isSubmitting}>
              {submitLabel}
            </Button>
          </InlineStack>
        </Box>
      </BlockStack>
    </Form>
  );
}
