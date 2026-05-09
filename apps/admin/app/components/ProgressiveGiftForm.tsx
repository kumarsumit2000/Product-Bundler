import { useState, useEffect } from "react";
import { Form, useSubmit } from "@remix-run/react";
import {
  BlockStack, Card, FormLayout, TextField, Select, Button, Text, InlineStack, Banner,
} from "@shopify/polaris";
import { VariantPicker, type PickedVariant } from "./VariantPicker";

export type ProgressiveGiftThresholdValue = {
  minSpend: string;
  variant: PickedVariant | null;
  label: string;
};

export type ProgressiveGiftFormValues = {
  name: string;
  status: "draft" | "active" | "paused";
  headline: string;
  thresholds: ProgressiveGiftThresholdValue[];
};

const EMPTY_THRESHOLD: ProgressiveGiftThresholdValue = { minSpend: "50", variant: null, label: "" };

const DEFAULTS: ProgressiveGiftFormValues = {
  name: "",
  status: "draft",
  headline: "Unlock free gifts with your order",
  thresholds: [{ ...EMPTY_THRESHOLD }],
};

type Props = {
  submitLabel: string;
  initialValues?: Partial<ProgressiveGiftFormValues>;
  errors?: Record<string, string>;
  onValuesChange?: (v: ProgressiveGiftFormValues) => void;
};

export function ProgressiveGiftForm({ submitLabel, initialValues, errors, onValuesChange }: Props) {
  const submit = useSubmit();
  const [values, setValues] = useState<ProgressiveGiftFormValues>({
    ...DEFAULTS,
    ...initialValues,
    thresholds: initialValues?.thresholds ?? DEFAULTS.thresholds,
  });

  useEffect(() => { onValuesChange?.(values); }, [values, onValuesChange]);

  const updateThreshold = (idx: number, patch: Partial<ProgressiveGiftThresholdValue>) => {
    setValues((v) => ({
      ...v,
      thresholds: v.thresholds.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  };
  const addThreshold = () =>
    setValues((v) => ({ ...v, thresholds: [...v.thresholds, { ...EMPTY_THRESHOLD }] }));
  const removeThreshold = (idx: number) =>
    setValues((v) => ({ ...v, thresholds: v.thresholds.filter((_, i) => i !== idx) }));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("name", values.name);
    fd.set("status", values.status);
    fd.set("headline", values.headline);
    fd.set(
      "thresholds",
      JSON.stringify(
        values.thresholds.map((t) => ({
          minSpendCents: Math.round(parseFloat(t.minSpend || "0") * 100),
          giftVariantId: t.variant?.variantId ?? "",
          label: t.label,
        })),
      ),
    );
    submit(fd, { method: "post" });
  };

  return (
    <Form onSubmit={handleSubmit}>
      <BlockStack gap="400">
        {errors?._form && <Banner tone="critical">{errors._form}</Banner>}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Details</Text>
            <FormLayout>
              <TextField
                label="Name"
                value={values.name}
                onChange={(name) => setValues((v) => ({ ...v, name }))}
                autoComplete="off"
                error={errors?.name}
              />
              <TextField
                label="Bar headline"
                value={values.headline}
                onChange={(headline) => setValues((v) => ({ ...v, headline }))}
                autoComplete="off"
                error={errors?.headline}
                helpText="Shown above the unlocked gifts on the storefront"
              />
              <Select
                label="Status"
                options={[
                  { label: "Draft", value: "draft" },
                  { label: "Active", value: "active" },
                  { label: "Paused", value: "paused" },
                ]}
                value={values.status}
                onChange={(status) => setValues((v) => ({ ...v, status: status as ProgressiveGiftFormValues["status"] }))}
                error={errors?.status}
              />
            </FormLayout>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Gift thresholds</Text>
            <Text as="p" tone="subdued">
              Each threshold unlocks a free gift once the customer's cart subtotal hits the minimum spend.
            </Text>
            {errors?.thresholds && <Banner tone="critical">{errors.thresholds}</Banner>}
            {values.thresholds.map((t, i) => (
              <Card key={i}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">Threshold {i + 1}</Text>
                    {values.thresholds.length > 1 && (
                      <Button variant="plain" tone="critical" onClick={() => removeThreshold(i)}>
                        Remove
                      </Button>
                    )}
                  </InlineStack>
                  <FormLayout>
                    <TextField
                      label="Minimum cart spend ($)"
                      type="number"
                      value={t.minSpend}
                      onChange={(minSpend) => updateThreshold(i, { minSpend })}
                      autoComplete="off"
                      min={0}
                    />
                    <TextField
                      label="Label"
                      value={t.label}
                      onChange={(label) => updateThreshold(i, { label })}
                      autoComplete="off"
                      helpText="e.g. Free shipping, Free socks"
                    />
                    <BlockStack gap="100">
                      <Text as="span" variant="bodyMd">Gift variant</Text>
                      <VariantPicker
                        variant={t.variant}
                        onChange={(variant) => updateThreshold(i, { variant })}
                      />
                    </BlockStack>
                  </FormLayout>
                </BlockStack>
              </Card>
            ))}
            <InlineStack>
              <Button onClick={addThreshold}>Add threshold</Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <InlineStack align="end">
          <Button submit variant="primary">{submitLabel}</Button>
        </InlineStack>
      </BlockStack>
    </Form>
  );
}
