import { useFetcher } from "@remix-run/react";
import {
  Modal, DropZone, Banner, Text, BlockStack, InlineStack, Button, Spinner, TextField, Box,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";

// Image picker for a Shopify CDN URL. Opens a modal with two surfaces:
//   • From your Files — grid of MediaImage records the merchant has
//     already uploaded (loaded from /api/admin/list-files via fetcher).
//   • Upload new — DropZone that pushes a new file to Shopify Files via
//     /api/admin/upload-image; the resulting CDN URL drops back into the
//     form once the upload finishes.
// Replaces an old "paste URL" TextField. The picker stores the CDN URL
// the same way (a string the parent form persists), so wiring it in is
// just a drop-in swap.

type Props = {
  label: string;
  value: string;
  onChange: (url: string) => void;
  helpText?: string;
};

type FileItem = { id: string; url: string; alt: string; width: number | null; height: number | null };

export function ShopifyImageField({ label, value, onChange, helpText }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <BlockStack gap="200">
      <Text as="p" variant="bodyMd" fontWeight="medium">{label}</Text>
      {helpText && <Text as="p" tone="subdued" variant="bodySm">{helpText}</Text>}

      {value ? (
        <InlineStack gap="300" blockAlign="center" wrap={false}>
          <img
            src={value}
            alt=""
            style={{
              width: 96, height: 96, objectFit: "cover",
              borderRadius: 8, border: "1px solid #e1e3e5", flexShrink: 0,
            }}
          />
          <BlockStack gap="100">
            <Text as="span" tone="subdued" variant="bodySm">{shortenUrl(value)}</Text>
            <InlineStack gap="200">
              <Button onClick={() => setOpen(true)}>Change image</Button>
              <Button onClick={() => onChange("")} variant="plain" tone="critical">Remove</Button>
            </InlineStack>
          </BlockStack>
        </InlineStack>
      ) : (
        <PickerButton onOpen={() => setOpen(true)} />
      )}

      <ImagePickerModal
        open={open}
        onClose={() => setOpen(false)}
        onPick={(url) => { onChange(url); setOpen(false); }}
      />
    </BlockStack>
  );
}

function PickerButton({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
      style={{
        border: "1.5px dashed #c9cccf",
        borderRadius: 12,
        padding: 32,
        textAlign: "center",
        cursor: "pointer",
        background: "#fafbfb",
      }}
    >
      <BlockStack gap="100" inlineAlign="center">
        <Text as="p" variant="bodyMd" fontWeight="medium">Select image</Text>
        <Text as="p" tone="subdued" variant="bodySm">Pick from your Shopify Files or upload a new one</Text>
      </BlockStack>
    </div>
  );
}

function ImagePickerModal({
  open, onClose, onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const filesFetcher = useFetcher<{ images?: FileItem[] }>();
  const uploadFetcher = useFetcher<{ ok: boolean; url?: string; error?: string }>();
  const [search, setSearch] = useState("");

  // Load Files the first time the modal opens; refresh whenever the
  // upload fetcher completes successfully (so a newly uploaded image
  // appears at the top of the grid without a full page reload).
  useEffect(() => {
    if (!open) return;
    if (filesFetcher.state === "idle" && !filesFetcher.data) {
      filesFetcher.load("/api/admin/list-files");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // After a successful upload, push the URL up and refresh the grid so
  // the next time the modal opens, the image is at the top of the list.
  useEffect(() => {
    if (uploadFetcher.state === "idle" && uploadFetcher.data?.ok && uploadFetcher.data.url) {
      onPick(uploadFetcher.data.url);
      // Reset the upload fetcher state so re-opening the modal doesn't
      // auto-fire pick again on stale data.
      // (useFetcher doesn't have a reset; refetching is the workaround.)
      filesFetcher.load("/api/admin/list-files");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadFetcher.state, uploadFetcher.data?.ok, uploadFetcher.data?.url]);

  const uploading = uploadFetcher.state !== "idle";

  const onDrop = useCallback(
    (_dropped: File[], accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;
      const fd = new FormData();
      fd.append("file", file);
      uploadFetcher.submit(fd, {
        method: "post",
        action: "/api/admin/upload-image",
        encType: "multipart/form-data",
      });
    },
    [uploadFetcher],
  );

  // Apply the search filter client-side so the merchant can refine
  // without waiting for a network round-trip per keystroke.
  const allImages = filesFetcher.data?.images ?? [];
  const lowerSearch = search.trim().toLowerCase();
  const images = lowerSearch
    ? allImages.filter((f) => (f.alt || "").toLowerCase().includes(lowerSearch) || f.url.toLowerCase().includes(lowerSearch))
    : allImages;

  const filesLoading = filesFetcher.state !== "idle" && allImages.length === 0;

  return (
    <Modal open={open} onClose={onClose} title="Select image" size="large">
      <Modal.Section>
        <BlockStack gap="400">
          {/* Upload section */}
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Upload new</Text>
            <DropZone accept="image/*" type="image" allowMultiple={false} onDrop={onDrop} disabled={uploading}>
              {uploading ? (
                <Box padding="400">
                  <InlineStack gap="200" blockAlign="center" align="center">
                    <Spinner size="small" />
                    <Text as="span">Uploading to Shopify Files…</Text>
                  </InlineStack>
                </Box>
              ) : (
                <DropZone.FileUpload actionTitle="Upload image" actionHint="PNG, JPG, or GIF up to 20 MB" />
              )}
            </DropZone>
            {uploadFetcher.data && !uploadFetcher.data.ok && uploadFetcher.data.error && (
              <Banner tone="critical">{uploadFetcher.data.error}</Banner>
            )}
          </BlockStack>

          {/* Library */}
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">From your Shopify Files</Text>
              <div style={{ width: 240 }}>
                <TextField label="" labelHidden placeholder="Search by name…" value={search} onChange={setSearch} autoComplete="off" />
              </div>
            </InlineStack>
            {filesLoading ? (
              <Box padding="400">
                <InlineStack gap="200" blockAlign="center" align="center">
                  <Spinner size="small" />
                  <Text as="span">Loading your files…</Text>
                </InlineStack>
              </Box>
            ) : images.length === 0 ? (
              <Banner tone="info">
                No images found in your Shopify Files yet. Upload one above or add images at <strong>Shopify Admin → Content → Files</strong>.
              </Banner>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))",
                  gap: 12,
                  maxHeight: 460,
                  overflowY: "auto",
                  padding: 4,
                }}
              >
                {images.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onPick(f.url)}
                    style={{
                      padding: 0,
                      border: "1.5px solid #e1e3e5",
                      borderRadius: 10,
                      background: "#fff",
                      cursor: "pointer",
                      display: "block",
                      overflow: "hidden",
                      aspectRatio: "1 / 1",
                    }}
                    title={f.alt || f.url}
                  >
                    <img
                      src={f.url}
                      alt={f.alt || ""}
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </button>
                ))}
              </div>
            )}
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// Trim a long Shopify CDN URL down to its filename for display.
function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const name = u.pathname.split("/").pop() || u.pathname;
    return name.length > 40 ? name.slice(0, 37) + "…" : name;
  } catch {
    return url.length > 40 ? url.slice(0, 37) + "…" : url;
  }
}
