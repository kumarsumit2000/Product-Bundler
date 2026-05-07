import { Button, BlockStack, InlineStack, Text, Thumbnail } from "@shopify/polaris";
import { useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export type PickedVariant = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  image?: string;
};

type Props = {
  variant: PickedVariant | null;
  onChange: (v: PickedVariant | null) => void;
  // When set, the picker rejects variants whose product.id !== restrictToProductId.
  restrictToProductId?: string | null;
};

export function VariantPicker({ variant, onChange, restrictToProductId }: Props) {
  const shopify = useAppBridge();

  const open = useCallback(async () => {
    let result: unknown;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (shopify as any).resourcePicker({
        type: "variant",
        multiple: false,
        selectionIds: variant ? [{ id: variant.variantId }] : [],
      });
    } catch (err) {
      // eslint-disable-next-line no-console, @typescript-eslint/no-explicit-any
      console.error("[VariantPicker] resourcePicker threw:", err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (shopify as any).toast?.show?.("Variant picker failed to open. Try again.", { isError: true });
      return;
    }
    if (!result) return;
    // App Bridge V4 may return either an array directly OR { selection: [...] }
    // depending on call shape. Handle both.
    type PickedRaw = {
      id: string;
      title?: string;
      product?: { id: string; title?: string; images?: Array<{ originalSrc?: string }> };
    };
    const arr: PickedRaw[] = Array.isArray(result)
      ? (result as PickedRaw[])
      : ((result as { selection?: PickedRaw[] }).selection ?? []);
    if (arr.length === 0) return;
    const first = arr[0]!;
    if (restrictToProductId && first.product?.id !== restrictToProductId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (shopify as any).toast?.show?.("Pick a variant of the QB's product.", { isError: true });
      return;
    }
    onChange({
      variantId: first.id,
      productId: first.product?.id ?? "",
      productTitle: first.product?.title ?? "",
      variantTitle: first.title ?? first.id,
      image: first.product?.images?.[0]?.originalSrc,
    });
  }, [shopify, variant, onChange, restrictToProductId]);

  if (!variant) {
    return <Button onClick={open}>Choose variant</Button>;
  }

  return (
    <BlockStack gap="200">
      <InlineStack gap="300" blockAlign="center">
        <Thumbnail source={variant.image ?? ""} alt={variant.variantTitle} size="small" />
        <Text as="span" variant="bodyMd">
          {variant.productTitle} — {variant.variantTitle}
        </Text>
      </InlineStack>
      <InlineStack gap="200">
        <Button onClick={open}>Change</Button>
        <Button onClick={() => onChange(null)} variant="plain" tone="critical">
          Remove
        </Button>
      </InlineStack>
    </BlockStack>
  );
}
