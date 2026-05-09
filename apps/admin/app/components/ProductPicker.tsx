import { Button, BlockStack, InlineStack, Text, Thumbnail, TextField, Box } from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export type PickedProduct = {
  productId: string;
  variantId: string | null;
  qty: number;
  title?: string;
  image?: string;
  priceCents?: number;
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
      (s: {
        id: string;
        title?: string;
        images?: { originalSrc?: string }[];
        variants?: Array<{ price?: string | number }>;
      }) => {
        const existing = products.find((p) => p.productId === s.id);
        const rawPrice = s.variants?.[0]?.price;
        const priceCents = rawPrice != null && !Number.isNaN(parseFloat(String(rawPrice)))
          ? Math.round(parseFloat(String(rawPrice)) * 100)
          : existing?.priceCents;
        return {
          productId: s.id,
          variantId: existing?.variantId ?? null,
          qty: existing?.qty ?? 1,
          title: s.title,
          image: s.images?.[0]?.originalSrc,
          priceCents,
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
          <Thumbnail source={p.image ?? ImageIcon} alt={p.title ?? ""} />
          <Text as="span" variant="bodyMd">
            {p.title ?? p.productId}
          </Text>
          {showQty && (
            <Box minWidth="5rem">
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
            </Box>
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
