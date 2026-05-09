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
import { QbTierBuilder, type TierFormValue } from "./QbTierBuilder";

type Status = "draft" | "active" | "paused";

export type QbFormValues = {
  name: string;
  product: PickedProduct[];
  tiers: TierFormValue[];
  combinable: boolean;
  status: Status;
  headline: string;
  ctaLabel: string;
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: string;
  textOverrides: Record<string, string>;
};

type Props = {
  initialValues?: Partial<QbFormValues>;
  errors?: Record<string, string>;
  submitLabel: string;
  onValuesChange?: (v: QbFormValues) => void;
};

const DEFAULTS: QbFormValues = {
  name: "",
  product: [],
  tiers: [{ qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: false }],
  combinable: false,
  status: "draft",
  headline: "",
  ctaLabel: "",
  primaryColor: "",
  textColor: "",
  backgroundColor: "",
  borderRadius: "",
  textOverrides: {
    "qb.tierLabel": "",
    "qb.savingsBadge": "",
    "qb.mostPopular": "",
    "qb.giftBadge": "",
  },
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
      <input type="hidden" name="productId" value={values.product[0]?.productId ?? ""} />
      <input type="hidden" name="headline" value={values.headline} />
      <input type="hidden" name="ctaLabel" value={values.ctaLabel} />
      <input type="hidden" name="styleOverrides" value={JSON.stringify({
        primaryColor: values.primaryColor || undefined,
        textColor: values.textColor || undefined,
        backgroundColor: values.backgroundColor || undefined,
        borderRadius: values.borderRadius ? parseInt(values.borderRadius, 10) : undefined,
      })} />
      <input type="hidden" name="textOverrides" value={JSON.stringify(
        Object.fromEntries(Object.entries(values.textOverrides).filter(([, v]) => v.length > 0))
      )} />
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
            <Text as="h2" variant="headingMd">
              1. Product
            </Text>
            <TextField
              label="Name"
              name="name"
              value={values.name}
              onChange={(v) => update("name", v)}
              error={errors?.name}
              autoComplete="off"
              maxLength={100}
            />
            <ProductPicker
              products={values.product}
              onChange={(p) => update("product", p)}
              multiple={false}
              showQty={false}
            />
            {errors?.productId && <Banner tone="critical">{errors.productId}</Banner>}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              2. Tiers
            </Text>
            <QbTierBuilder
              tiers={values.tiers}
              onChange={(t) => update("tiers", t)}
              restrictToProductId={values.product[0]?.productId ?? null}
            />
            {errors?.tiers && <Banner tone="critical">{errors.tiers}</Banner>}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Settings
            </Text>
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
            <Text as="h2" variant="headingMd">Style &amp; Text</Text>
            <Text as="p" tone="subdued">Override how this quantity break looks and reads. Leave fields empty to use shop defaults.</Text>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Headline &amp; CTA</Text>
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

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Colors</Text>
              <InlineStack gap="300">
                <TextField
                  label="Primary color"
                  value={values.primaryColor}
                  onChange={(v) => update("primaryColor", v)}
                  placeholder="#7B1E2A"
                  helpText="6-digit hex like #FF0000"
                  autoComplete="off"
                  maxLength={7}
                />
                <TextField
                  label="Text color"
                  value={values.textColor}
                  onChange={(v) => update("textColor", v)}
                  placeholder="#1A1A1A"
                  autoComplete="off"
                  maxLength={7}
                />
                <TextField
                  label="Background color"
                  value={values.backgroundColor}
                  onChange={(v) => update("backgroundColor", v)}
                  placeholder="#FFFFFF"
                  autoComplete="off"
                  maxLength={7}
                />
              </InlineStack>
              <TextField
                label="Border radius (px)"
                type="number"
                min={0}
                max={24}
                value={values.borderRadius}
                onChange={(v) => update("borderRadius", v)}
                placeholder="8"
                autoComplete="off"
              />
            </BlockStack>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Text overrides</Text>
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
            </BlockStack>

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
