import { useEffect, useState } from "react";
import {
  BlockStack, Button, Modal, Spinner, TextField, Text, InlineStack, Box,
} from "@shopify/polaris";

type FileItem = { id: string; url: string; alt: string };

type Props = {
  url: string;
  onChange: (url: string) => void;
};

export function ShopifyImagePicker({ url, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/files${debounced ? `?q=${encodeURIComponent(debounced)}` : ""}`)
      .then((r) => r.json() as Promise<{ files: FileItem[] }>)
      .then((data) => {
        if (!cancelled) setItems(data.files);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to load files");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, debounced]);

  const pick = (u: string) => {
    onChange(u);
    setOpen(false);
  };

  return (
    <BlockStack gap="200">
      {url ? (
        <Box
          borderWidth="025"
          borderColor="border"
          borderRadius="200"
          padding="200"
          background="bg-surface-secondary"
        >
          <InlineStack gap="300" blockAlign="center" align="space-between">
            <InlineStack gap="300" blockAlign="center">
              <img
                src={url}
                alt=""
                style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6 }}
              />
              <Text as="span" variant="bodySm" tone="subdued" truncate>
                {url.split("/").pop() ?? url}
              </Text>
            </InlineStack>
            <InlineStack gap="200">
              <Button onClick={() => setOpen(true)}>Change</Button>
              <Button variant="plain" tone="critical" onClick={() => onChange("")}>Remove</Button>
            </InlineStack>
          </InlineStack>
        </Box>
      ) : (
        <Button onClick={() => setOpen(true)}>Choose image from Shopify Files</Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Choose an image"
        size="large"
        secondaryActions={[{ content: "Cancel", onAction: () => setOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField
              label="Search"
              labelHidden
              value={search}
              onChange={setSearch}
              placeholder="Search by filename"
              autoComplete="off"
            />
            {loading && <InlineStack align="center"><Spinner accessibilityLabel="Loading" size="small" /></InlineStack>}
            {error && <Text as="p" tone="critical">{error}</Text>}
            {!loading && !error && items.length === 0 && (
              <Text as="p" tone="subdued">
                No images found. Upload images in Shopify admin → Content → Files.
              </Text>
            )}
            {!loading && items.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: 8,
                }}
              >
                {items.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => pick(f.url)}
                    style={{
                      padding: 0,
                      border: f.url === url ? "2px solid #008060" : "1px solid #d1d5db",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: "#fff",
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={f.url}
                      alt={f.alt}
                      loading="lazy"
                      style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                    />
                  </button>
                ))}
              </div>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
