import { Form } from "@remix-run/react";
import {
  BlockStack,
  Card,
  ChoiceList,
  Banner,
  TextField,
  Checkbox,
  Button,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { useState } from "react";
import { ProductPicker, type PickedProduct } from "./ProductPicker";
import { DiscountValueInput } from "./DiscountValueInput";

type DiscountType = "percentage" | "flat" | "fixed_total";
type Status = "draft" | "active" | "paused";
type TriggerMode = "same_as_members" | "specific";

export type BundleFormValues = {
  name: string;
  products: PickedProduct[];
  discountType: DiscountType;
  discountValue: string;
  combinable: boolean;
  triggerMode: TriggerMode;
  triggerProducts: PickedProduct[];
  status: Status;
  headline: string;
  ctaLabel: string;
};

type Props = {
  initialValues?: Partial<BundleFormValues>;
  errors?: Record<string, string>;
  submitLabel: string;
};

const DEFAULTS: BundleFormValues = {
  name: "",
  products: [],
  discountType: "percentage",
  discountValue: "10",
  combinable: false,
  triggerMode: "same_as_members",
  triggerProducts: [],
  status: "draft",
  headline: "",
  ctaLabel: "",
};

export function BundleForm({ initialValues, errors, submitLabel }: Props) {
  const [values, setValues] = useState<BundleFormValues>({ ...DEFAULTS, ...initialValues });

  const update = <K extends keyof BundleFormValues>(key: K, val: BundleFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  const hasErrors = errors && Object.keys(errors).length > 0;

  return (
    <Form method="post">
      <input type="hidden" name="products" value={JSON.stringify(values.products)} />
      <input type="hidden" name="triggerProducts" value={JSON.stringify(values.triggerProducts)} />

      <BlockStack gap="500">
        {hasErrors && (
          <Banner tone="critical" title="Fix these issues to save the bundle">
            <Text as="p">{Object.values(errors!).join(" • ")}</Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              1. Products in this bundle
            </Text>
            <TextField
              label="Bundle name"
              name="name"
              value={values.name}
              onChange={(v) => update("name", v)}
              error={errors?.name}
              autoComplete="off"
              maxLength={100}
            />
            <ProductPicker
              products={values.products}
              onChange={(p) => update("products", p)}
              multiple
            />
            {errors?.products && <Banner tone="critical">{errors.products}</Banner>}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              2. Discount
            </Text>
            <ChoiceList
              title="Discount type"
              choices={[
                { label: "Percentage off", value: "percentage" },
                { label: "Flat amount off", value: "flat" },
                { label: "Fixed total price", value: "fixed_total" },
              ]}
              selected={[values.discountType]}
              onChange={(s) => update("discountType", s[0] as DiscountType)}
              name="discountType"
            />
            <DiscountValueInput
              type={values.discountType}
              value={values.discountValue}
              onChange={(v) => update("discountValue", v)}
              error={errors?.discountValue}
            />
            <input type="hidden" name="discountValue" value={values.discountValue} />
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
            <Text as="h2" variant="headingMd">
              3. Trigger products
            </Text>
            <Text as="p" variant="bodyMd">
              Choose which product pages show this bundle.
            </Text>
            <ChoiceList
              title="Trigger mode"
              titleHidden
              choices={[
                { label: "Same as bundle members", value: "same_as_members" },
                { label: "Specific products", value: "specific" },
              ]}
              selected={[values.triggerMode]}
              onChange={(s) => update("triggerMode", s[0] as TriggerMode)}
              name="triggerMode"
            />
            {values.triggerMode === "specific" && (
              <ProductPicker
                products={values.triggerProducts}
                onChange={(p) => update("triggerProducts", p)}
                multiple
                showQty={false}
              />
            )}
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
            <TextField
              label="Headline (optional)"
              name="headline"
              value={values.headline}
              onChange={(v) => update("headline", v)}
              error={errors?.headline}
              autoComplete="off"
              maxLength={100}
            />
            <TextField
              label="CTA label (optional)"
              name="ctaLabel"
              value={values.ctaLabel}
              onChange={(v) => update("ctaLabel", v)}
              error={errors?.ctaLabel}
              autoComplete="off"
              maxLength={50}
            />
          </BlockStack>
        </Card>

        <InlineStack align="end" gap="300">
          <Button url="/app/bundles">Cancel</Button>
          <Button submit variant="primary">
            {submitLabel}
          </Button>
        </InlineStack>
      </BlockStack>
    </Form>
  );
}
