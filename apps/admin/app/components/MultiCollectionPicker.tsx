import { Button, BlockStack, InlineStack, Text, Thumbnail } from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { PickedCollection } from "./CollectionPicker";

type Props = {
  collections: PickedCollection[];
  onChange: (next: PickedCollection[]) => void;
};

export function MultiCollectionPicker({ collections, onChange }: Props) {
  const shopify = useAppBridge();

  const handleAdd = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (shopify as any).resourcePicker({
      type: "collection",
      multiple: true,
      selectionIds: collections.map((c) => ({ id: c.collectionId })),
    });
    if (!result?.selection) return;
    const next: PickedCollection[] = result.selection.map(
      (s: { id: string; title?: string; image?: { originalSrc?: string } }) => ({
        collectionId: s.id,
        title: s.title ?? s.id,
        image: s.image?.originalSrc,
      }),
    );
    onChange(next);
  }, [shopify, collections, onChange]);

  const handleRemove = (collectionId: string) => {
    onChange(collections.filter((c) => c.collectionId !== collectionId));
  };

  return (
    <BlockStack gap="300">
      {collections.map((c) => (
        <InlineStack key={c.collectionId} gap="300" blockAlign="center">
          <Thumbnail source={c.image ?? ImageIcon} alt={c.title} size="small" />
          <Text as="span" variant="bodyMd">{c.title}</Text>
          <Button onClick={() => handleRemove(c.collectionId)} tone="critical" variant="plain">
            Remove
          </Button>
        </InlineStack>
      ))}
      <Button onClick={handleAdd}>
        {collections.length ? "Add or change collections" : "Pick collections"}
      </Button>
    </BlockStack>
  );
}
