import { Form } from "@remix-run/react";
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
};

export function QbForm({ initialValues, errors, submitLabel, onValuesChange }: Props) {
  const [values, setValues] = useState<QbFormValues>({ ...DEFAULTS, ...initialValues });
  const update = <K extends keyof QbFormValues>(k: K, v: QbFormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    onValuesChange?.(values);
  }, [values, onValuesChange]);

  const hasErrors = errors && Object.keys(errors).length > 0;

  return (
    <Form method="post">
      <input type="hidden" name="productId" value={values.product[0]?.productId ?? ""} />
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

        <Box paddingBlockEnd="600">
          <InlineStack align="end" gap="300">
            <Button url="/app/quantity-breaks">Cancel</Button>
            <Button submit variant="primary">
              {submitLabel}
            </Button>
          </InlineStack>
        </Box>
      </BlockStack>
    </Form>
  );
}
