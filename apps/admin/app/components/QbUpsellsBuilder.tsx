import {
  BlockStack, Card, FormLayout, TextField, Select, Button, Text, InlineStack, Checkbox, Thumbnail, Box,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { ProductPicker, type PickedProduct } from "./ProductPicker";

export type UpsellFormValue = {
  id: string;
  mode: "selected" | "complementary";
  product: PickedProduct | null;
  discountType: "percentage" | "flat";
  discountValue: string;
  title: string;
  subtitle: string;
  selectedByDefault: boolean;
};

export const EMPTY_UPSELL = (): UpsellFormValue => ({
  id: (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : Math.random().toString(36).slice(2),
  mode: "complementary",
  product: null,
  discountType: "percentage",
  discountValue: "20",
  title: "{{product}}",
  subtitle: "Save {{saved_amount}}!",
  selectedByDefault: false,
});

type Props = {
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  upsells: UpsellFormValue[];
  onUpsellsChange: (next: UpsellFormValue[]) => void;
};

export function QbUpsellsBuilder({ enabled, onEnabledChange, upsells, onUpsellsChange }: Props) {
  const update = (idx: number, patch: Partial<UpsellFormValue>) => {
    onUpsellsChange(upsells.map((u, i) => (i === idx ? { ...u, ...patch } : u)));
  };
  const add = () => onUpsellsChange([...upsells, EMPTY_UPSELL()]);
  const remove = (idx: number) => onUpsellsChange(upsells.filter((_, i) => i !== idx));

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">🛒 Checkbox upsells</Text>
        <Text as="p" tone="subdued">
          Add extra products customers can tick to add alongside the bundle, with a per-line discount.
        </Text>
        <Checkbox
          label="Enable checkbox upsells"
          checked={enabled}
          onChange={onEnabledChange}
        />

        {enabled && (
          <BlockStack gap="400">
            {upsells.map((u, i) => (
              <Card key={u.id}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">Upsell #{i + 1}</Text>
                    <Button variant="plain" tone="critical" onClick={() => remove(i)}>
                      Remove upsell
                    </Button>
                  </InlineStack>

                  <BlockStack gap="100">
                    <Text as="span" variant="bodyMd">Product</Text>
                    {u.product ? (
                      <Box borderWidth="025" borderColor="border" borderRadius="200" padding="200">
                        <InlineStack gap="300" blockAlign="center" align="space-between">
                          <InlineStack gap="300" blockAlign="center">
                            <Thumbnail source={u.product.image ?? ImageIcon} alt={u.product.title ?? ""} size="small" />
                            <Text as="span" variant="bodyMd">{u.product.title ?? u.product.productId}</Text>
                          </InlineStack>
                          <InlineStack gap="200">
                            <ProductPicker
                              products={[u.product]}
                              onChange={(p) => update(i, { product: p[0] ?? null })}
                              multiple={false}
                              showQty={false}
                            />
                            <Button variant="plain" tone="critical" onClick={() => update(i, { product: null })}>Remove</Button>
                          </InlineStack>
                        </InlineStack>
                      </Box>
                    ) : (
                      <ProductPicker
                        products={[]}
                        onChange={(p) => update(i, { product: p[0] ?? null })}
                        multiple={false}
                        showQty={false}
                      />
                    )}
                  </BlockStack>

                  <FormLayout>
                    <FormLayout.Group>
                      <Select
                        label="Discount type"
                        options={[
                          { label: "Percentage off", value: "percentage" },
                          { label: "Flat amount off", value: "flat" },
                        ]}
                        value={u.discountType}
                        onChange={(v) => update(i, { discountType: v as "percentage" | "flat" })}
                      />
                      <TextField
                        label={u.discountType === "percentage" ? "Discount per item (%)" : "Discount per item ($)"}
                        type="number"
                        value={u.discountValue}
                        onChange={(discountValue) => update(i, { discountValue })}
                        autoComplete="off"
                        min={0}
                        max={u.discountType === "percentage" ? 100 : 9999}
                      />
                    </FormLayout.Group>
                    <TextField
                      label="Title"
                      value={u.title}
                      onChange={(title) => update(i, { title })}
                      autoComplete="off"
                      helpText="Variables: {{product}}"
                      placeholder="{{product}}"
                    />
                    <TextField
                      label="Subtitle"
                      value={u.subtitle}
                      onChange={(subtitle) => update(i, { subtitle })}
                      autoComplete="off"
                      helpText="Variables: {{saved_amount}}, {{discount}}"
                      placeholder="Save {{saved_amount}}!"
                    />
                  </FormLayout>
                </BlockStack>
              </Card>
            ))}
            <Button onClick={add} fullWidth>+ Add upsell</Button>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
