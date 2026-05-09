import { useState, useEffect } from "react";
import { Form, useSubmit } from "@remix-run/react";
import {
  BlockStack, Card, FormLayout, TextField, Select, Button, Text, InlineStack, Banner,
} from "@shopify/polaris";
import { VariantPicker, type PickedVariant } from "./VariantPicker";
import { ColorSwatchPicker } from "./ColorSwatchPicker";

export type ProgressiveGiftThresholdValue = {
  minSpend: string;
  variant: PickedVariant | null;
  label: string;
};

export type ProgressiveStyleForm = {
  backgroundColor: string;
  borderColor: string;
  headingColor: string;
  textColor: string;
  progressFill: string;
  progressTrack: string;
  cardBg: string;
  cardBorder: string;
  cardBgInactive: string;
  cardBorderInactive: string;
  badgeBg: string;
  badgeBgInactive: string;
  badgeText: string;
  borderRadius: string;
  paddingX: string;
  paddingY: string;
};

export type ProgressiveGiftFormValues = {
  name: string;
  status: "draft" | "active" | "paused";
  headline: string;
  thresholds: ProgressiveGiftThresholdValue[];
  style: ProgressiveStyleForm;
};

export const EMPTY_PROGRESSIVE_STYLE: ProgressiveStyleForm = {
  backgroundColor: "",
  borderColor: "",
  headingColor: "",
  textColor: "",
  progressFill: "",
  progressTrack: "",
  cardBg: "",
  cardBorder: "",
  cardBgInactive: "",
  cardBorderInactive: "",
  badgeBg: "",
  badgeBgInactive: "",
  badgeText: "",
  borderRadius: "",
  paddingX: "",
  paddingY: "",
};

export function progressiveStyleFromOverrides(so: unknown): ProgressiveStyleForm {
  const s = (so ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
  const num = (k: string) => (typeof s[k] === "number" ? String(s[k] as number) : "");
  return {
    backgroundColor: str("backgroundColor"),
    borderColor: str("borderColor"),
    headingColor: str("headingColor"),
    textColor: str("textColor"),
    progressFill: str("progressFill"),
    progressTrack: str("progressTrack"),
    cardBg: str("cardBg"),
    cardBorder: str("cardBorder"),
    cardBgInactive: str("cardBgInactive"),
    cardBorderInactive: str("cardBorderInactive"),
    badgeBg: str("badgeBg"),
    badgeBgInactive: str("badgeBgInactive"),
    badgeText: str("badgeText"),
    borderRadius: num("borderRadius"),
    paddingX: num("paddingX"),
    paddingY: num("paddingY"),
  };
}

export function progressiveStyleToOverrides(s: ProgressiveStyleForm): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of [
    "backgroundColor", "borderColor", "headingColor", "textColor",
    "progressFill", "progressTrack",
    "cardBg", "cardBorder", "cardBgInactive", "cardBorderInactive",
    "badgeBg", "badgeBgInactive", "badgeText",
  ] as const) {
    if (s[k]) out[k] = s[k];
  }
  for (const k of ["borderRadius", "paddingX", "paddingY"] as const) {
    if (s[k]) {
      const n = parseInt(s[k], 10);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
}

const EMPTY_THRESHOLD: ProgressiveGiftThresholdValue = { minSpend: "50", variant: null, label: "" };

const DEFAULTS: ProgressiveGiftFormValues = {
  name: "",
  status: "draft",
  headline: "Unlock free gifts with your order",
  thresholds: [{ ...EMPTY_THRESHOLD }],
  style: EMPTY_PROGRESSIVE_STYLE,
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
    style: { ...EMPTY_PROGRESSIVE_STYLE, ...(initialValues?.style ?? {}) },
  });
  const setStyle = (patch: Partial<ProgressiveStyleForm>) =>
    setValues((v) => ({ ...v, style: { ...v.style, ...patch } }));

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
    fd.set("styleOverrides", JSON.stringify(progressiveStyleToOverrides(values.style)));
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

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Appearance</Text>
            <Text as="p" tone="subdued">Override colors and shape. Leave any field blank to use defaults.</Text>
            <FormLayout>
              <FormLayout.Group>
                <ColorSwatchPicker
                  label="Background"
                  value={values.style.backgroundColor}
                  onChange={(backgroundColor) => setStyle({ backgroundColor })}
                  placeholder="#FFF7F8"
                />
                <ColorSwatchPicker
                  label="Border"
                  value={values.style.borderColor}
                  onChange={(borderColor) => setStyle({ borderColor })}
                  placeholder="#FBE4E7"
                />
              </FormLayout.Group>
              <FormLayout.Group>
                <ColorSwatchPicker
                  label="Heading text"
                  value={values.style.headingColor}
                  onChange={(headingColor) => setStyle({ headingColor })}
                  placeholder="#1A1A1A"
                />
                <ColorSwatchPicker
                  label="Subtitle text"
                  value={values.style.textColor}
                  onChange={(textColor) => setStyle({ textColor })}
                  placeholder="#666666"
                />
              </FormLayout.Group>
              <FormLayout.Group>
                <ColorSwatchPicker
                  label="Progress bar fill"
                  value={values.style.progressFill}
                  onChange={(progressFill) => setStyle({ progressFill })}
                  placeholder="#D9263A"
                />
                <ColorSwatchPicker
                  label="Progress bar track"
                  value={values.style.progressTrack}
                  onChange={(progressTrack) => setStyle({ progressTrack })}
                  placeholder="#FCE4E7"
                />
              </FormLayout.Group>
              <Text as="h3" variant="headingSm">Unlocked gift cards</Text>
              <FormLayout.Group>
                <ColorSwatchPicker
                  label="Background"
                  value={values.style.cardBg}
                  onChange={(cardBg) => setStyle({ cardBg })}
                  placeholder="#FFFFFF"
                />
                <ColorSwatchPicker
                  label="Border"
                  value={values.style.cardBorder}
                  onChange={(cardBorder) => setStyle({ cardBorder })}
                  placeholder="#D9263A"
                />
                <ColorSwatchPicker
                  label="FREE badge bg"
                  value={values.style.badgeBg}
                  onChange={(badgeBg) => setStyle({ badgeBg })}
                  placeholder="#D9263A"
                />
              </FormLayout.Group>
              <Text as="h3" variant="headingSm">Locked gift cards</Text>
              <FormLayout.Group>
                <ColorSwatchPicker
                  label="Background"
                  value={values.style.cardBgInactive}
                  onChange={(cardBgInactive) => setStyle({ cardBgInactive })}
                  placeholder="#FFFFFF"
                />
                <ColorSwatchPicker
                  label="Border"
                  value={values.style.cardBorderInactive}
                  onChange={(cardBorderInactive) => setStyle({ cardBorderInactive })}
                  placeholder="#FBE4E7"
                />
                <ColorSwatchPicker
                  label="$X badge bg"
                  value={values.style.badgeBgInactive}
                  onChange={(badgeBgInactive) => setStyle({ badgeBgInactive })}
                  placeholder="#CBD5E1"
                />
              </FormLayout.Group>
              <ColorSwatchPicker
                label="Badge text (both states)"
                value={values.style.badgeText}
                onChange={(badgeText) => setStyle({ badgeText })}
                placeholder="#FFFFFF"
              />
              <FormLayout.Group>
                <TextField
                  label="Border radius (px)"
                  type="number"
                  value={values.style.borderRadius}
                  onChange={(borderRadius) => setStyle({ borderRadius })}
                  autoComplete="off"
                  min={0}
                  max={48}
                  placeholder="10"
                />
                <TextField
                  label="Padding horizontal (px)"
                  type="number"
                  value={values.style.paddingX}
                  onChange={(paddingX) => setStyle({ paddingX })}
                  autoComplete="off"
                  min={0}
                  max={64}
                  placeholder="14"
                />
                <TextField
                  label="Padding vertical (px)"
                  type="number"
                  value={values.style.paddingY}
                  onChange={(paddingY) => setStyle({ paddingY })}
                  autoComplete="off"
                  min={0}
                  max={64}
                  placeholder="14"
                />
              </FormLayout.Group>
            </FormLayout>
          </BlockStack>
        </Card>

        <InlineStack align="end">
          <Button submit variant="primary">{submitLabel}</Button>
        </InlineStack>
      </BlockStack>
    </Form>
  );
}
