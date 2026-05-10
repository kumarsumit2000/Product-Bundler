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
import { DiscountValueInput } from "./DiscountValueInput";
import { CollectionPicker, type PickedCollection } from "./CollectionPicker";
import { MultiCollectionPicker } from "./MultiCollectionPicker";
import { type StylePanelValues } from "./StylePanel";
import { SimpleBundleStylePanel } from "./SimpleBundleStylePanel";
import { WidgetAddonsCard, DEFAULT_ADDONS_ORDER, type AddonsOrderItem } from "./WidgetAddonsCard";
import { StickyAtcCard, STICKY_ATC_DEFAULTS } from "./StickyAtcCard";
import { VariantPicker, type PickedVariant } from "./VariantPicker";
import { EMPTY_STYLE_FORM, buildStyleOverrides } from "~/lib/preview-overrides";
import type { StickyAtcConfig } from "../../drizzle/schema";

type DiscountType = "percentage" | "flat" | "fixed_total";
type Status = "draft" | "active" | "paused";
export type BundleVisibility = "same_as_members" | "all" | "all_except" | "specific" | "collections";
type Mode = "classic" | "mix_match";

export type BundleFormValues = StylePanelValues & {
  name: string;
  mode: Mode;
  products: PickedProduct[];
  collection: PickedCollection | null;
  targetQty: string;
  discountType: DiscountType;
  discountValue: string;
  combinable: boolean;
  visibility: BundleVisibility;
  triggerProducts: PickedProduct[];
  visibilityCollections: PickedCollection[];
  status: Status;
  headline: string;
  ctaLabel: string;
  textOverrides: Record<string, string>;
  freeGiftEnabled: boolean;
  freeGiftVariant: PickedVariant | null;
  linkedCountdownId: string | null;
  linkedProgressiveGiftId: string | null;
  addonsOrder: AddonsOrderItem[];
  stickyAtc: StickyAtcConfig;
};

type AddonOption = { id: string; name: string };

type Props = {
  initialValues?: Partial<BundleFormValues>;
  errors?: Record<string, string>;
  submitLabel: string;
  onValuesChange?: (v: BundleFormValues) => void;
  countdownOptions?: AddonOption[];
  progressiveGiftOptions?: AddonOption[];
};

const DEFAULTS: BundleFormValues = {
  ...EMPTY_STYLE_FORM,
  name: "",
  mode: "classic",
  products: [],
  collection: null,
  targetQty: "3",
  discountType: "percentage",
  discountValue: "10",
  combinable: false,
  visibility: "same_as_members",
  triggerProducts: [],
  visibilityCollections: [],
  status: "draft",
  headline: "",
  ctaLabel: "",
  textOverrides: { "bundle.totalLabel": "", "bundle.savingsBadge": "" },
  freeGiftEnabled: false,
  freeGiftVariant: null,
  linkedCountdownId: null,
  linkedProgressiveGiftId: null,
  addonsOrder: [...DEFAULT_ADDONS_ORDER],
  stickyAtc: STICKY_ATC_DEFAULTS,
};

export function BundleForm({ initialValues, errors, submitLabel, onValuesChange, countdownOptions = [], progressiveGiftOptions = [] }: Props) {
  const [values, setValues] = useState<BundleFormValues>({ ...DEFAULTS, ...initialValues });
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const navigate = useNavigate();

  const update = <K extends keyof BundleFormValues>(key: K, val: BundleFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  useEffect(() => {
    onValuesChange?.(values);
  }, [values, onValuesChange]);

  const hasErrors = errors && Object.keys(errors).length > 0;

  return (
    <Form method="post">
      <input type="hidden" name="products" value={JSON.stringify(values.products)} />
      <input type="hidden" name="triggerProducts" value={JSON.stringify(values.triggerProducts)} />
      <input type="hidden" name="visibility" value={values.visibility} />
      <input
        type="hidden"
        name="visibilityCollectionIds"
        value={JSON.stringify(values.visibilityCollections.map((c) => c.collectionId))}
      />
      <input type="hidden" name="mode" value={values.mode} />
      <input type="hidden" name="collectionId" value={values.collection?.collectionId ?? ""} />
      <input type="hidden" name="targetQty" value={values.targetQty} />
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
      <input
        type="hidden"
        name="freeGiftVariantId"
        value={values.freeGiftVariant?.variantId ?? ""}
      />
      <input type="hidden" name="subscription" value="null" />
      <input type="hidden" name="linkedCountdownId" value={values.linkedCountdownId ?? ""} />
      <input type="hidden" name="linkedProgressiveGiftId" value={values.linkedProgressiveGiftId ?? ""} />
      <input type="hidden" name="addonsOrder" value={JSON.stringify(values.addonsOrder)} />
      <input type="hidden" name="stickyAtc" value={JSON.stringify(values.stickyAtc)} />

      <BlockStack gap="500">
        {hasErrors && (
          <Banner tone="critical" title="Fix these issues to save">
            <Text as="p">{Object.values(errors!).join(" • ")}</Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Bundle type</Text>
            <ChoiceList
              title="Type"
              titleHidden
              choices={[
                { label: "Classic — pick specific products to bundle together", value: "classic" },
                { label: "Mix & Match — let customers pick N items from a collection", value: "mix_match" },
              ]}
              selected={[values.mode]}
              onChange={(s) => update("mode", s[0] as Mode)}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              1. {values.mode === "mix_match" ? "Collection & target" : "Products in this bundle"}
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
            {values.mode === "classic" ? (
              <>
                <ProductPicker
                  products={values.products}
                  onChange={(p) => update("products", p)}
                  multiple
                />
                {errors?.products && <Banner tone="critical">{errors.products}</Banner>}
              </>
            ) : (
              <>
                <CollectionPicker
                  collection={values.collection}
                  onChange={(c) => update("collection", c)}
                />
                {errors?.collectionId && <Banner tone="critical">{errors.collectionId}</Banner>}
                <TextField
                  label="Customer must pick this many items"
                  type="number"
                  min={2}
                  value={values.targetQty}
                  onChange={(v) => update("targetQty", v)}
                  error={errors?.targetQty}
                  autoComplete="off"
                />
              </>
            )}
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
            <Text as="h2" variant="headingMd">Free gift</Text>
            <Checkbox
              label="Include a free gift with this bundle"
              checked={values.freeGiftEnabled}
              onChange={(enabled) => {
                update("freeGiftEnabled", enabled);
                if (!enabled) update("freeGiftVariant", null);
              }}
            />
            {values.freeGiftEnabled && (
              <BlockStack gap="200">
                <Text as="p" tone="subdued">
                  Pick any product variant from your catalog. It&apos;s added free alongside the
                  bundle items, shown as a row inside the bundle, and discounted 100% at checkout.
                </Text>
                <VariantPicker
                  variant={values.freeGiftVariant}
                  onChange={(v) => update("freeGiftVariant", v)}
                />
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              {values.mode === "classic" ? "3. Visibility" : "Visibility"}
            </Text>
            <Text as="p" tone="subdued">Choose which product pages show this bundle.</Text>
            <ChoiceList
              title="Show on"
              titleHidden
              choices={[
                ...(values.mode === "classic"
                  ? [{ label: "Same as bundle members", value: "same_as_members" }]
                  : []),
                { label: "All products", value: "all" },
                { label: "All products except selected", value: "all_except" },
                { label: "Specific products", value: "specific" },
                { label: "Products in selected collections", value: "collections" },
              ]}
              selected={[values.visibility]}
              onChange={(s) => update("visibility", s[0] as BundleVisibility)}
            />
            {(values.visibility === "all_except" || values.visibility === "specific") && (
              <ProductPicker
                products={values.triggerProducts}
                onChange={(p) => update("triggerProducts", p)}
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

        <WidgetAddonsCard
          countdowns={countdownOptions}
          progressiveGifts={progressiveGiftOptions}
          linkedCountdownId={values.linkedCountdownId}
          linkedProgressiveGiftId={values.linkedProgressiveGiftId}
          addonsOrder={values.addonsOrder}
          widgetLabel="Bundle widget"
          onChange={(patch) => setValues((s) => ({ ...s, ...patch }))}
        />

        <StickyAtcCard
          value={values.stickyAtc}
          onChange={(stickyAtc) => update("stickyAtc", stickyAtc)}
        />

        <SimpleBundleStylePanel values={values} onChange={(next) => setValues((s) => ({ ...s, ...next }))} />

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Text overrides</Text>
            <Text as="p" tone="subdued">Rename labels shown on the widget. Leave empty to use defaults.</Text>
            <TextField
              label="Total label"
              value={values.textOverrides["bundle.totalLabel"] ?? ""}
              onChange={(v) => update("textOverrides", { ...values.textOverrides, "bundle.totalLabel": v })}
              placeholder="Total"
              autoComplete="off"
              maxLength={120}
            />
            <TextField
              label="Savings badge"
              value={values.textOverrides["bundle.savingsBadge"] ?? ""}
              onChange={(v) => update("textOverrides", { ...values.textOverrides, "bundle.savingsBadge": v })}
              placeholder="Save {savings}"
              helpText="Available variables: {savings}"
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
            <Button onClick={() => navigate("/app/bundles")}>Cancel</Button>
            <Button submit variant="primary" loading={isSubmitting}>
              {submitLabel}
            </Button>
          </InlineStack>
        </Box>
      </BlockStack>
    </Form>
  );
}
