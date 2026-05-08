import { Button, BlockStack, InlineStack, Text, Thumbnail } from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export type PickedCollection = {
  collectionId: string;
  title: string;
  image?: string;
};

type Props = {
  collection: PickedCollection | null;
  onChange: (c: PickedCollection | null) => void;
};

export function CollectionPicker({ collection, onChange }: Props) {
  const shopify = useAppBridge();

  const open = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (shopify as any).resourcePicker({
      type: "collection",
      multiple: false,
      selectionIds: collection ? [{ id: collection.collectionId }] : [],
    });
    if (!result?.selection || result.selection.length === 0) return;
    const first = result.selection[0] as {
      id: string;
      title?: string;
      image?: { originalSrc?: string };
    };
    onChange({
      collectionId: first.id,
      title: first.title ?? first.id,
      image: first.image?.originalSrc,
    });
  }, [shopify, collection, onChange]);

  if (!collection) {
    return <Button onClick={open}>Choose collection</Button>;
  }

  return (
    <BlockStack gap="200">
      <InlineStack gap="300" blockAlign="center">
        <Thumbnail source={collection.image ?? ImageIcon} alt={collection.title} size="small" />
        <Text as="span" variant="bodyMd">
          {collection.title}
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
