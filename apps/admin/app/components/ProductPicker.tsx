import { Button, BlockStack, InlineStack, Text, Thumbnail, TextField } from "@shopify/polaris";
import { useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export type PickedProduct = {
  productId: string;
  variantId: string | null;
  qty: number;
  title?: string;
  image?: string;
};

type Props = {
  products: PickedProduct[];
  onChange: (products: PickedProduct[]) => void;
  multiple?: boolean;
  showQty?: boolean;
};

export function ProductPicker({
  products,
  onChange,
  multiple = true,
  showQty = true,
}: Props) {
  const shopify = useAppBridge();

  const handleAdd = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (shopify as any).resourcePicker({
      type: "product",
      multiple,
      selectionIds: products.map((p) => ({ id: p.productId })),
    });
    if (!result?.selection) return;
    const next: PickedProduct[] = result.selection.map(
      (s: { id: string; title?: string; images?: { originalSrc?: string }[] }) => {
        const existing = products.find((p) => p.productId === s.id);
        return {
          productId: s.id,
          variantId: existing?.variantId ?? null,
          qty: existing?.qty ?? 1,
          title: s.title,
          image: s.images?.[0]?.originalSrc,
        };
      },
    );
    onChange(next);
  }, [shopify, multiple, products, onChange]);

  const handleRemove = (productId: string) => {
    onChange(products.filter((p) => p.productId !== productId));
  };

  const handleQtyChange = (productId: string, qty: string) => {
    const n = parseInt(qty, 10);
    if (Number.isNaN(n)) return;
    onChange(products.map((p) => (p.productId === productId ? { ...p, qty: n } : p)));
  };

  return (
    <BlockStack gap="300">
      {products.map((p) => (
        <InlineStack key={p.productId} gap="300" blockAlign="center">
          <Thumbnail source={p.image ?? ""} alt={p.title ?? ""} />
          <Text as="span" variant="bodyMd">
            {p.title ?? p.productId}
          </Text>
          {showQty && (
            <div style={{ width: 80 }}>
              <TextField
                label="Qty"
                labelHidden
                type="number"
                value={String(p.qty)}
                onChange={(v) => handleQtyChange(p.productId, v)}
                autoComplete="off"
                min={1}
                max={100}
              />
            </div>
          )}
          <Button onClick={() => handleRemove(p.productId)} tone="critical" variant="plain">
            Remove
          </Button>
        </InlineStack>
      ))}
      <Button onClick={handleAdd}>
        {multiple ? "Add product" : products.length ? "Change product" : "Pick product"}
      </Button>
    </BlockStack>
  );
}
