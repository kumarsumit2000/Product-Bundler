import { Form, useNavigation, useNavigate } from "@remix-run/react";
import {
  BlockStack, Box, Card, ChoiceList, Banner, TextField, Checkbox, Button, InlineStack, Text,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { ProductPicker, type PickedProduct } from "./ProductPicker";
import { BxgyBarBuilder, EMPTY_BAR, type BxgyBarValue } from "./BxgyBarBuilder";

type Status = "draft" | "active" | "paused";

export type BxgyFormValues = {
  name: string;
  status: Status;
  product: PickedProduct[];
  headline: string;
  ctaLabel: string;
  bars: BxgyBarValue[];
  combinable: boolean;
};

const DEFAULTS: BxgyFormValues = {
  name: "",
  status: "draft",
  product: [],
  headline: "Pick your deal",
  ctaLabel: "",
  bars: [
    { ...EMPTY_BAR, id: "bar-1", buyQty: 1, getQty: 1, title: "Buy 1, get 1 free" },
  ],
  combinable: false,
};

type Props = {
  submitLabel: string;
  initialValues?: Partial<BxgyFormValues>;
  errors?: Record<string, string>;
  onValuesChange?: (v: BxgyFormValues) => void;
};

export function BxgyForm({ submitLabel, initialValues, errors, onValuesChange }: Props) {
  const [values, setValues] = useState<BxgyFormValues>({ ...DEFAULTS, ...initialValues });
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSubmitting = navigation.state === "submitting";

  const update = <K extends keyof BxgyFormValues>(k: K, v: BxgyFormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  useEffect(() => { onValuesChange?.(values); }, [values, onValuesChange]);

  const hasErrors = errors && Object.keys(errors).length > 0;

  return (
    <Form method="post">
      <input type="hidden" name="bars" value={JSON.stringify(values.bars)} />
      <input type="hidden" name="productId" value={values.product[0]?.productId ?? ""} />

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
            <Text as="p" tone="subdued">
              Pick the product this offer applies to — bars buy / get N units of it.
            </Text>
            <ProductPicker
              products={values.product}
              onChange={(p) => update("product", p)}
              showQty={false}
            />
            {errors?.productId && <Banner tone="critical">{errors.productId}</Banner>}
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
