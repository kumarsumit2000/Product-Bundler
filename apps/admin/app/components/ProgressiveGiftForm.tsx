import { useState, useEffect } from "react";
import { Form, useSubmit } from "@remix-run/react";
import {
  BlockStack, Card, FormLayout, TextField, Select, Button, Text, InlineStack, Banner, Checkbox,
} from "@shopify/polaris";
import type { PickedVariant } from "./VariantPicker";
import { ProductPicker, type PickedProduct } from "./ProductPicker";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { ShopifyImagePicker } from "./ShopifyImagePicker";

export type ProgressiveGiftKind = "free_gift" | "free_shipping";

export type ProgressiveGiftThresholdValue = {
  minSpend: string;
  variant: PickedVariant | null;
  product: PickedProduct | null;
  label: string;
  title: string;
  lockedTitle: string;
  labelCrossedOut: string;
  lockedLabel: string;
  kind: ProgressiveGiftKind;
  iconUrl: string;
};

export type ProgressiveLayout = "stacked" | "grid" | "inline";

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
  subtitle: string;
  layout: ProgressiveLayout;
  hideLocked: boolean;
  showLockedLabels: boolean;
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

const EMPTY_THRESHOLD: ProgressiveGiftThresholdValue = {
  minSpend: "50",
  variant: null,
  product: null,
  label: "FREE",
  title: "",
  lockedTitle: "",
  labelCrossedOut: "",
  lockedLabel: "",
  kind: "free_gift",
  iconUrl: "",
};

const DEFAULTS: ProgressiveGiftFormValues = {
  name: "",
  status: "draft",
  headline: "🎁 Unlock free gifts with your order",
  subtitle: "",
  layout: "grid",
  hideLocked: false,
  showLockedLabels: true,
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
  const moveThreshold = (idx: number, direction: -1 | 1) =>
    setValues((v) => {
      const next = [...v.thresholds];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return v;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return { ...v, thresholds: next };
    });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("name", values.name);
    fd.set("status", values.status);
    fd.set("headline", values.headline);
    fd.set("subtitle", values.subtitle);
    fd.set("layout", values.layout);
    fd.set("hideLocked", values.hideLocked ? "on" : "");
    fd.set("showLockedLabels", values.showLockedLabels ? "on" : "");
    fd.set(
      "thresholds",
      JSON.stringify(
        values.thresholds.map((t) => ({
          minSpendCents: Math.round(parseFloat(t.minSpend || "0") * 100),
          giftVariantId: t.kind === "free_gift" ? (t.variant?.variantId ?? "") : "",
          giftProductId: t.kind === "free_gift" ? (t.product?.productId ?? "") : "",
          label: t.label,
          title: t.title,
          lockedTitle: t.lockedTitle,
          labelCrossedOut: t.labelCrossedOut,
          lockedLabel: t.lockedLabel,
          kind: t.kind,
          iconUrl: t.kind === "free_shipping" ? t.iconUrl : "",
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
              <BlockStack gap="100">
                <Text as="span" variant="bodyMd">Layout</Text>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {([
                    {
                      value: "stacked" as const,
                      label: "Stacked",
                      mock: (
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: 6, height: 50, justifyContent: "center" }}>
                          <div style={{ height: 7, background: "#cbd5e1", borderRadius: 2 }} />
                          <div style={{ height: 7, background: "#cbd5e1", borderRadius: 2 }} />
                          <div style={{ height: 7, background: "#cbd5e1", borderRadius: 2 }} />
                        </div>
                      ),
                    },
                    {
                      value: "grid" as const,
                      label: "Grid",
                      mock: (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 6, height: 50, alignContent: "center" }}>
                          <div style={{ height: 14, background: "#cbd5e1", borderRadius: 2 }} />
                          <div style={{ height: 14, background: "#cbd5e1", borderRadius: 2 }} />
                          <div style={{ height: 14, background: "#cbd5e1", borderRadius: 2 }} />
                          <div style={{ height: 14, background: "#cbd5e1", borderRadius: 2 }} />
                        </div>
                      ),
                    },
                    {
                      value: "inline" as const,
                      label: "Inline",
                      mock: (
                        <div style={{ display: "flex", gap: 3, padding: 6, height: 50, alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: 18, height: 18, background: "#cbd5e1", borderRadius: 2 }} />
                          <div style={{ width: 18, height: 18, background: "#cbd5e1", borderRadius: 2 }} />
                          <div style={{ width: 18, height: 18, background: "#cbd5e1", borderRadius: 2 }} />
                        </div>
                      ),
                    },
                  ]).map((opt) => {
                    const selected = values.layout === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setValues((v) => ({ ...v, layout: opt.value }))}
                        style={{
                          background: "#fff",
                          border: `2px solid ${selected ? "#008060" : "#d1d5db"}`,
                          borderRadius: 8,
                          padding: 0,
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          overflow: "hidden",
                        }}
                        aria-pressed={selected}
                      >
                        {opt.mock}
                        <div
                          style={{
                            background: selected ? "#e3f1ec" : "#f6f6f7",
                            color: selected ? "#008060" : "#6b7280",
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "4px 6px",
                            textAlign: "center",
                          }}
                        >
                          {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </BlockStack>
              <FormLayout.Group>
                <TextField
                  label="Title"
                  value={values.headline}
                  onChange={(headline) => setValues((v) => ({ ...v, headline }))}
                  autoComplete="off"
                  error={errors?.headline}
                  placeholder="🎁 Unlock free gifts with your order"
                />
                <TextField
                  label="Subtitle"
                  value={values.subtitle}
                  onChange={(subtitle) => setValues((v) => ({ ...v, subtitle }))}
                  autoComplete="off"
                  placeholder="Spend more to unlock"
                />
              </FormLayout.Group>
              <Checkbox
                label="Hide gifts until they're unlocked"
                checked={values.hideLocked}
                onChange={(hideLocked) => setValues((v) => ({ ...v, hideLocked }))}
                helpText="Show only the gifts the customer has earned"
              />
              <Checkbox
                label="Show labels for locked gifts"
                checked={values.showLockedLabels}
                onChange={(showLockedLabels) => setValues((v) => ({ ...v, showLockedLabels }))}
                helpText="Display the dollar amount needed under each locked gift"
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
                    <Text as="h3" variant="headingSm">Gift #{i + 1}</Text>
                    <InlineStack gap="200">
                      <Button
                        variant="plain"
                        disabled={i === 0}
                        onClick={() => moveThreshold(i, -1)}
                        accessibilityLabel="Move up"
                      >
                        ↑
                      </Button>
                      <Button
                        variant="plain"
                        disabled={i === values.thresholds.length - 1}
                        onClick={() => moveThreshold(i, 1)}
                        accessibilityLabel="Move down"
                      >
                        ↓
                      </Button>
                      {values.thresholds.length > 1 && (
                        <Button variant="plain" tone="critical" onClick={() => removeThreshold(i)}>
                          Remove
                        </Button>
                      )}
                    </InlineStack>
                  </InlineStack>
                  <FormLayout>
                    <InlineStack gap="0" wrap={false}>
                      <Button
                        variant={t.kind === "free_gift" ? "primary" : "secondary"}
                        onClick={() => updateThreshold(i, { kind: "free_gift" })}
                        fullWidth
                      >
                        🎁 Free gift
                      </Button>
                      <Button
                        variant={t.kind === "free_shipping" ? "primary" : "secondary"}
                        onClick={() => updateThreshold(i, { kind: "free_shipping" })}
                        fullWidth
                      >
                        🚚 Free shipping
                      </Button>
                    </InlineStack>
                    {t.kind === "free_shipping" ? (
                      <>
                        <Banner tone="info">
                          We&apos;ll apply a 100% discount to shipping when the cart subtotal hits this threshold.
                        </Banner>
                        <BlockStack gap="100">
                          <Text as="span" variant="bodyMd">Icon</Text>
                          <ShopifyImagePicker
                            url={t.iconUrl}
                            onChange={(iconUrl) => updateThreshold(i, { iconUrl })}
                          />
                          <Text as="p" tone="subdued" variant="bodySm">
                            Defaults to a 🚚 truck icon. Pick any image from Shopify Files (recommended: 80×80 transparent PNG).
                          </Text>
                        </BlockStack>
                      </>
                    ) : (
                      <BlockStack gap="100">
                        <Text as="span" variant="bodyMd">Gift product</Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Any variant of this product qualifies as the free gift.
                        </Text>
                        <ProductPicker
                          products={t.product ? [t.product] : []}
                          onChange={(products) => updateThreshold(i, {
                            product: products[0] ?? null,
                            variant: null,
                          })}
                          multiple={false}
                        />
                      </BlockStack>
                    )}
                    <TextField
                      label="Minimum cart spend ($)"
                      type="number"
                      value={t.minSpend}
                      onChange={(minSpend) => updateThreshold(i, { minSpend })}
                      autoComplete="off"
                      min={0}
                      helpText="Customer's cart subtotal needed to unlock this"
                    />
                    <FormLayout.Group>
                      <TextField
                        label="Unlocked label"
                        value={t.label}
                        onChange={(label) => updateThreshold(i, { label })}
                        autoComplete="off"
                        placeholder="FREE"
                      />
                      <TextField
                        label="Crossed-out price"
                        value={t.labelCrossedOut}
                        onChange={(labelCrossedOut) => updateThreshold(i, { labelCrossedOut })}
                        autoComplete="off"
                        placeholder="$24.95"
                        helpText="Shown struck-through next to FREE"
                      />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <TextField
                        label="Title"
                        value={t.title}
                        onChange={(title) => updateThreshold(i, { title })}
                        autoComplete="off"
                        placeholder="Defaults to product name"
                      />
                      <TextField
                        label="Locked title"
                        value={t.lockedTitle}
                        onChange={(lockedTitle) => updateThreshold(i, { lockedTitle })}
                        autoComplete="off"
                        placeholder="Locked"
                      />
                    </FormLayout.Group>
                    <TextField
                      label="Locked label"
                      value={t.lockedLabel}
                      onChange={(lockedLabel) => updateThreshold(i, { lockedLabel })}
                      autoComplete="off"
                      placeholder="$50"
                      helpText="Defaults to the minimum cart spend"
                    />
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
                  placeholder="#FCE4E7"
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
                  placeholder="#E5E7EB"
                />
              </FormLayout.Group>
              <ColorSwatchPicker
                label="Badge text (both states)"
                value={values.style.badgeText}
                onChange={(badgeText) => setStyle({ badgeText })}
                placeholder="#D9263A"
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
