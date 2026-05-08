# Phase 8.F: Polaris Design Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all BFS-blocking and polish issues from the admin design audit (3 critical + 10 polish + 6 nits, batched into 5 implementation batches).

**Architecture:** Two new shared utilities — a `ConfirmModal` component for delete confirmation (replaces 4 `confirm()` calls) and a `useSavedToast` hook (reads `?saved=<name>` query param after redirect, fires App Bridge toast). The rest is in-place edits across 17 existing files: drop broken `image=""` props, swap raw HTML for Polaris primitives, wire form-submit `loading` state, sentence-case "Quantity breaks", etc.

**Tech Stack:** Polaris v13, App Bridge React v4, Remix on `@remix-run/cloudflare-pages`, vitest (node env — no React rendering tests in this workspace).

**Spec deviation (testing):** The spec proposed 5 unit tests for `ConfirmModal` and `useSavedToast` requiring jsdom + @testing-library/react. The admin workspace uses `environment: "node"` for vitest with no React rendering setup. Adding two new dev dependencies + a config change for ~75 LOC of trivial wrappers is poor cost/value. Plan drops the unit tests; the manual smoke checklist (Task 8) is the verification gate. Pre-existing 138-test suite catches any regression to the rest of the admin code via the `pnpm tsc --noEmit` + `pnpm vitest run` sweep.

**Reference docs:**
- Spec: [docs/superpowers/specs/2026-05-08-phase-8f-polaris-design-review-design.md](../specs/2026-05-08-phase-8f-polaris-design-review-design.md)
- Polaris components: <https://polaris.shopify.com/components>
- Polaris icons: `@shopify/polaris-icons` (already installed) — see `ImageIcon`

**Codebase conventions:**
- All admin paths use the `~` alias for `apps/admin/app/`
- Routes return `json(...)` from loaders, `redirect(...)` from actions
- Existing form pattern: `<Form method="post">` with full-page navigation
- Commit straight to `main` (team workflow)

---

## File Structure

**Created (2):**
| Path | Responsibility |
|---|---|
| `apps/admin/app/components/ConfirmModal.tsx` | Polaris-Modal-based confirmation dialog. Used 4× in delete flows. |
| `apps/admin/app/lib/toast.ts` | `useSavedToast()` hook — reads `?saved=<name>` query param, fires App Bridge toast, scrubs param via `setSearchParams`. |

**Modified (17):** see spec §7. Each task touches a defined subset.

---

## Task 1: ConfirmModal + useSavedToast utilities

**Files:**
- Create: `apps/admin/app/components/ConfirmModal.tsx`
- Create: `apps/admin/app/lib/toast.ts`

- [ ] **Step 1: Create ConfirmModal**

Create `apps/admin/app/components/ConfirmModal.tsx`:
```tsx
import { Modal, Text } from "@shopify/polaris";

type Props = {
  open: boolean;
  title: string;
  body: string;
  destructiveLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmModal({
  open,
  title,
  body,
  destructiveLabel = "Delete",
  loading,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      primaryAction={{
        content: destructiveLabel,
        destructive: true,
        loading: !!loading,
        onAction: onConfirm,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose, disabled: !!loading }]}
    >
      <Modal.Section>
        <Text as="p">{body}</Text>
      </Modal.Section>
    </Modal>
  );
}
```

- [ ] **Step 2: Create useSavedToast hook**

Create `apps/admin/app/lib/toast.ts`:
```ts
import { useEffect } from "react";
import { useSearchParams } from "@remix-run/react";

type ShopifyApi = { toast?: { show: (msg: string) => void } };

export function useSavedToast(): void {
  const [params, setParams] = useSearchParams();
  const saved = params.get("saved");
  useEffect(() => {
    if (!saved) return;
    const w = window as unknown as { shopify?: ShopifyApi };
    const message = saved === "1" ? "Saved" : `${saved} saved`;
    w.shopify?.toast?.show(message);
    const next = new URLSearchParams(params);
    next.delete("saved");
    setParams(next, { replace: true });
  }, [saved, params, setParams]);
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS — no new type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/components/ConfirmModal.tsx apps/admin/app/lib/toast.ts
git commit -m "feat(admin): add ConfirmModal + useSavedToast utilities"
```

---

## Task 2: Wire ConfirmModal into bundles + QB list pages (Batch 1 — BFS-blocker)

**Files:**
- Modify: `apps/admin/app/routes/app.bundles._index.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks._index.tsx`

For both files:
1. Remove the `confirm("Delete bundle/QB X?")` calls from row delete + bulk delete
2. Add state to track `deleteTarget: string | "bulk" | null`
3. Track `inFlight` to detect the close-on-idle moment
4. Render `<ConfirmModal />` with appropriate title/body, wired to `fetcher.submit`

- [ ] **Step 1: Read both files to understand existing structure**

Run: `cat "apps/admin/app/routes/app.bundles._index.tsx"`
Run: `cat "apps/admin/app/routes/app.quantity-breaks._index.tsx"`
Note: identify the existing `DeleteRowButton` component, the `bulkDelete` handler, and which fetcher each uses.

- [ ] **Step 2: Modify app.bundles._index.tsx**

Add imports near the top of the file (with the other `@remix-run/react` and component imports):
```tsx
import { useEffect, useState } from "react";
import { ConfirmModal } from "~/components/ConfirmModal";
```

Replace the existing `DeleteRowButton` component's body so it triggers parent state instead of `confirm()`:
```tsx
function DeleteRowButton({ id, name, onDelete }: { id: string; name: string; onDelete: (id: string, name: string) => void }) {
  return (
    <Button
      variant="plain"
      tone="critical"
      onClick={(e) => {
        // IndexTable.Row also has an onClick; prevent navigation
        e?.stopPropagation?.();
        onDelete(id, name);
      }}
    >
      Delete
    </Button>
  );
}
```

In the default exported `BundlesIndex` component, replace the local `bulkDelete = ...` and `<DeleteRowButton ...>` usages. Add at the top of the component (after `useFetcher`/`useNavigate`/`useIndexResourceState`):

```tsx
const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | "bulk" | null>(null);
const [inFlight, setInFlight] = useState(false);

useEffect(() => {
  if (inFlight && fetcher.state === "idle") {
    setDeleteTarget(null);
    setInFlight(false);
  }
}, [fetcher.state, inFlight]);

const onRowDelete = (id: string, name: string) => setDeleteTarget({ id, name });
const onBulkDelete = () => {
  if (selectedResources.length === 0) return;
  setDeleteTarget("bulk");
};
const confirmDelete = () => {
  if (!deleteTarget) return;
  setInFlight(true);
  if (deleteTarget === "bulk") {
    fetcher.submit({ _action: "delete-bulk", ids: JSON.stringify(selectedResources) }, { method: "post" });
    clearSelection();
  } else {
    fetcher.submit({ _action: "delete", id: deleteTarget.id }, { method: "post" });
  }
};
const closeModal = () => { if (!inFlight) setDeleteTarget(null); };
```

Replace `promotedBulkActions={[{ content: "Delete", onAction: bulkDelete }]}` with `promotedBulkActions={[{ content: "Delete", onAction: onBulkDelete }]}`.

Replace `<DeleteRowButton id={b.id} name={b.name} />` with `<DeleteRowButton id={b.id} name={b.name} onDelete={onRowDelete} />`.

Render the modal as the LAST child inside `<Page>` (after the existing card / IndexTable):
```tsx
<ConfirmModal
  open={deleteTarget !== null}
  title={deleteTarget === "bulk" ? "Delete bundles?" : `Delete bundle "${deleteTarget?.name ?? ""}"?`}
  body={deleteTarget === "bulk"
    ? `Delete ${selectedResources.length} bundle${selectedResources.length === 1 ? "" : "s"}? This cannot be undone.`
    : "This cannot be undone."}
  loading={inFlight}
  onConfirm={confirmDelete}
  onClose={closeModal}
/>
```

Apply the same modal block in BOTH the empty-state branch (before `</Page>`) and the populated branch — though in practice the empty-state branch can't trigger delete, so it's only needed in the populated branch.

- [ ] **Step 3: Modify app.quantity-breaks._index.tsx (same pattern)**

Same changes as Step 2, swapping:
- "bundle" → "quantity break"
- `BundlesIndex` → `QbIndex`
- `b.id`, `b.name` → `q.id`, `q.name`
- `selectedResources.length === 1 ? "" : "s"` → same

Modal title: `"Delete quantity break \"${deleteTarget?.name ?? ""}\"?"` for single, `"Delete quantity breaks?"` for bulk.

- [ ] **Step 4: Run typecheck + tests**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

Run: `cd apps/admin && pnpm vitest run`
Expected: PASS — all 138 existing tests still pass (the changes are render-only; no existing tests touch this UI).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/routes/app.bundles._index.tsx apps/admin/app/routes/app.quantity-breaks._index.tsx
git commit -m "feat(admin): replace confirm() with Polaris Modal for delete flows"
```

---

## Task 3: EmptyState image removal + Thumbnail icon fallback (Batch 2)

**Files:**
- Modify: `apps/admin/app/routes/app.bundles._index.tsx`
- Modify: `apps/admin/app/routes/app.bundles.new.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks._index.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx`
- Modify: `apps/admin/app/components/ProductPicker.tsx`
- Modify: `apps/admin/app/components/VariantPicker.tsx`
- Modify: `apps/admin/app/components/CollectionPicker.tsx`

- [ ] **Step 1: Drop `image=""` from all 4 EmptyState usages**

In each of the 4 route files, find the `<EmptyState ...>` usage and DELETE the `image=""` line. The Polaris EmptyState renders fine without it.

Example (in `app.bundles._index.tsx`):
```tsx
// Before:
<EmptyState
  heading="No bundles yet"
  action={{ content: "Create bundle", url: "/app/bundles/new" }}
  image=""
>

// After:
<EmptyState
  heading="No bundles yet"
  action={{ content: "Create bundle", url: "/app/bundles/new" }}
>
```

Apply the same 1-line deletion in all 4 files.

- [ ] **Step 2: Add ImageIcon fallback to ProductPicker, VariantPicker, CollectionPicker**

In each file, add to the imports:
```tsx
import { ImageIcon } from "@shopify/polaris-icons";
```

Replace the Thumbnail call site:
- `ProductPicker.tsx` line ~65: `source={p.image ?? ""}` → `source={p.image ?? ImageIcon}`
- `VariantPicker.tsx` line ~73: `source={variant.image ?? ""}` → `source={variant.image ?? ImageIcon}`
- `CollectionPicker.tsx` line ~46: `source={collection.image ?? ""}` → `source={collection.image ?? ImageIcon}`

- [ ] **Step 3: Verify typecheck + tests**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

Run: `cd apps/admin && pnpm vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/routes/app.bundles._index.tsx apps/admin/app/routes/app.bundles.new.tsx apps/admin/app/routes/app.quantity-breaks._index.tsx apps/admin/app/routes/app.quantity-breaks.new.tsx apps/admin/app/components/ProductPicker.tsx apps/admin/app/components/VariantPicker.tsx apps/admin/app/components/CollectionPicker.tsx
git commit -m "fix(admin): drop broken EmptyState image=\"\" + add Thumbnail icon fallback"
```

---

## Task 4: Form submit loading + cancel button + error copy (Batch 3 part 1)

**Files:**
- Modify: `apps/admin/app/components/BundleForm.tsx`
- Modify: `apps/admin/app/components/QbForm.tsx`

- [ ] **Step 1: Read both files**

Run: `cat "apps/admin/app/components/BundleForm.tsx"`
Run: `cat "apps/admin/app/components/QbForm.tsx"`

Note the existing imports from `@remix-run/react`, the submit button location (`<Button submit variant="primary">...</Button>`), the cancel button (`<Button url="/app/bundles">Cancel</Button>`), and the error banner copy.

- [ ] **Step 2: Modify BundleForm.tsx**

Update the imports — change the existing `@remix-run/react` import to include `useNavigation` and `useNavigate`:
```tsx
import { Form, useNavigation, useNavigate } from "@remix-run/react";
```
(merge with whatever's already imported from that package)

In the component body, after the existing `useState` hooks, add:
```tsx
const navigation = useNavigation();
const isSubmitting = navigation.state === "submitting";
const navigate = useNavigate();
```

Replace the submit button (`<Button submit variant="primary">{submitLabel}</Button>`) with:
```tsx
<Button submit variant="primary" loading={isSubmitting}>{submitLabel}</Button>
```

Replace the cancel button (`<Button url="/app/bundles">Cancel</Button>`) with:
```tsx
<Button onClick={() => navigate("/app/bundles")}>Cancel</Button>
```

Reconcile the error banner copy. Find the existing line `title="Fix these issues to save the bundle"` and change to `title="Fix these issues to save"`.

- [ ] **Step 3: Modify QbForm.tsx (same pattern)**

Same changes as Step 2:
- Imports: add `useNavigation`, `useNavigate`
- Add `const navigation = useNavigation(); const isSubmitting = navigation.state === "submitting"; const navigate = useNavigate();`
- Submit button: add `loading={isSubmitting}`
- Cancel button: replace `url="/app/quantity-breaks"` with `onClick={() => navigate("/app/quantity-breaks")}`
- Error banner: confirm it's already `"Fix these issues to save"` (per audit, it already is); leave it unchanged

- [ ] **Step 4: Verify typecheck + tests**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

Run: `cd apps/admin && pnpm vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/components/BundleForm.tsx apps/admin/app/components/QbForm.tsx
git commit -m "feat(admin): wire form submit loading + Remix-routed cancel"
```

---

## Task 5: Save toast plumbing — action redirects + useSavedToast mount (Batch 3 part 2)

**Files:**
- Modify: `apps/admin/app/routes/app.bundles.new.tsx`
- Modify: `apps/admin/app/routes/app.bundles.$id.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.$id.tsx`
- Modify: `apps/admin/app/routes/app.bundles._index.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks._index.tsx`

- [ ] **Step 1: Update create/edit action redirects (4 files)**

For each of the 4 routes, find the `redirect("/app/bundles")` or `redirect("/app/quantity-breaks")` at the end of the `action` function. Change to include the `?saved=<name>` query param.

`app.bundles.new.tsx`:
```tsx
// Before: return redirect("/app/bundles");
return redirect("/app/bundles?saved=" + encodeURIComponent(input.name));
```

`app.bundles.$id.tsx`:
```tsx
// Same — `input.name` (or whichever variable holds the bundle name in scope)
return redirect("/app/bundles?saved=" + encodeURIComponent(input.name));
```

`app.quantity-breaks.new.tsx`:
```tsx
return redirect("/app/quantity-breaks?saved=" + encodeURIComponent(input.name));
```

`app.quantity-breaks.$id.tsx`:
```tsx
return redirect("/app/quantity-breaks?saved=" + encodeURIComponent(input.name));
```

If a route's action variable is named differently (e.g. `data.name` or `payload.name`), use that. The variable should be the validated bundle/QB name, not a raw form value.

- [ ] **Step 2: Mount useSavedToast on both list pages**

`app.bundles._index.tsx` — add to imports:
```tsx
import { useSavedToast } from "~/lib/toast";
```

In the default exported `BundlesIndex` component, near the top (right after `useLoaderData`):
```tsx
useSavedToast();
```

Same change in `app.quantity-breaks._index.tsx` — import `useSavedToast` and call it at the top of the default exported component.

- [ ] **Step 3: Verify typecheck + tests + build**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

Run: `cd apps/admin && pnpm vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/routes/app.bundles.new.tsx apps/admin/app/routes/app.bundles.$id.tsx apps/admin/app/routes/app.quantity-breaks.new.tsx apps/admin/app/routes/app.quantity-breaks.$id.tsx apps/admin/app/routes/app.bundles._index.tsx apps/admin/app/routes/app.quantity-breaks._index.tsx
git commit -m "feat(admin): toast on save via ?saved= query param"
```

---

## Task 6: Polaris primitive replacements (Batch 4)

**Files:**
- Modify: `apps/admin/app/components/QbTierBuilder.tsx`
- Modify: `apps/admin/app/components/ProductPicker.tsx`
- Modify: `apps/admin/app/components/UsageBanner.tsx`
- Modify: `apps/admin/app/components/PreviewPane.tsx`
- Modify: `apps/admin/app/routes/app.billing.tsx`
- Modify: `apps/admin/app/routes/app.bundles.new.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx`
- Modify: `apps/admin/app/routes/app.bundles._index.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks._index.tsx`

This is the largest task; many small surgical edits across 9 files.

- [ ] **Step 1: QbTierBuilder — `<details>`/`<summary>` → Polaris Collapsible**

Read `apps/admin/app/components/QbTierBuilder.tsx`. Identify the `<details>...</details>` block (around lines 118-122 per audit).

Add to imports:
```tsx
import { Collapsible, Box, Button } from "@shopify/polaris";
import { useState } from "react";
```
(Box and Button likely already imported; merge.)

For each `<details>` block, replace with the Collapsible pattern. Example:
```tsx
// Before:
<details style={{ paddingLeft: 8 }}>
  <summary style={{ cursor: "pointer", fontSize: 13, color: "#5C5F62" }}>Advanced</summary>
  {/* body */}
</details>

// After (extract a helper component if used multiple times in the file; otherwise inline):
function AdvancedSection({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Box paddingInlineStart="200">
      <Button variant="plain" onClick={() => setOpen(o => !o)} disclosure={open ? "up" : "down"}>
        Advanced
      </Button>
      <Collapsible open={open} id={`advanced-${Math.random().toString(36).slice(2)}`}>
        {children}
      </Collapsible>
    </Box>
  );
}
```

If the file has multiple `<details>` blocks (one per tier), use the helper component for each — pass children through.

- [ ] **Step 2: QbTierBuilder — `<div style={{ width: N }}>` → `<Box minWidth=...>`**

In the same file, search for `<div style={{ width: ` and `<div style={{ flex:` and `<div style={{ paddingLeft:` patterns. Replace:
- `<div style={{ width: 80 }}>...</div>` → `<Box minWidth="5rem">...</Box>` (3 instances per audit)
- `<div style={{ width: 160 }}>...</div>` → `<Box minWidth="10rem">...</Box>`
- `<div style={{ width: 100 }}>...</div>` → `<Box minWidth="6.25rem">...</Box>`
- `<div style={{ flex: 1 }}>...</div>` → leave as-is (Polaris has no flex-grow primitive; pre-existing pattern)

Note: Box is the Polaris layout primitive. It accepts `minWidth`, `padding`, `paddingInlineStart`, `paddingInlineEnd`, etc.

- [ ] **Step 3: ProductPicker — `<div style={{ width: 80 }}>` → `<Box minWidth="5rem">`**

In `apps/admin/app/components/ProductPicker.tsx` at line ~70 (the `<div style={{ width: 80 }}>` wrapper around the product image area), replace with `<Box minWidth="5rem">`. Add `Box` to the imports if not already there.

- [ ] **Step 4: Raw `<p>` → `<Text as="p">` sweep**

In each of the following files, find raw `<p>...</p>` tags inside Polaris `Banner` or `EmptyState` children and replace with `<Text as="p">...</Text>`. `Text` is imported from `@shopify/polaris` — add to imports if not already.

- `apps/admin/app/components/UsageBanner.tsx` — 3 `<p>` tags inside the three Banner branches. Replace each.
- `apps/admin/app/routes/app.billing.tsx` — `<p>` inside the info Banner near the bottom of the page. Replace.
- `apps/admin/app/routes/app.bundles.new.tsx` — `<p>{gate.reason}</p>` inside the EmptyState in the gate-blocked branch. Replace with `<Text as="p">{gate.reason}</Text>`.
- `apps/admin/app/routes/app.quantity-breaks.new.tsx` — same `<p>{gate.reason}</p>` pattern. Replace.

- [ ] **Step 5: PreviewPane — wrap iframe in Polaris Box**

In `apps/admin/app/components/PreviewPane.tsx`, find the iframe element at line ~34. Currently:
```tsx
<iframe
  src={...}
  style={{ width: "100%", height: "560px", border: "1px solid #e3e3e3", borderRadius: 8 }}
/>
```

Replace with:
```tsx
<Box borderWidth="025" borderColor="border" borderRadius="200" overflowX="hidden" overflowY="hidden">
  <iframe
    src={...}
    style={{ width: "100%", height: "560px", border: "none", display: "block" }}
  />
</Box>
```

Add `Box` to the Polaris imports if not present.

- [ ] **Step 6: List pages — wrap UsageBanner + Card in BlockStack**

In `apps/admin/app/routes/app.bundles._index.tsx`, find both branches where the page renders (the empty-state branch and the populated branch). In each, wrap the `<UsageBanner ...>` and the `<Card>` (or `<Card padding="0">`) following it in a `<BlockStack gap="400">`. Example:

```tsx
// Before (populated branch):
<Page title="Bundles" primaryAction={...}>
  <UsageBanner usage={usage} />
  <Card padding="0">
    <IndexTable ... />
  </Card>
  {/* ConfirmModal added in Task 2 stays as last child */}
</Page>

// After:
<Page title="Bundles" primaryAction={...}>
  <BlockStack gap="400">
    <UsageBanner usage={usage} />
    <Card padding="0">
      <IndexTable ... />
    </Card>
  </BlockStack>
  {/* ConfirmModal stays outside the BlockStack as a sibling */}
</Page>
```

Apply the same wrapping in the empty-state branch (`<UsageBanner>` + `<Card>` containing `<EmptyState>`).

Add `BlockStack` to the imports if not already there.

Same change in `apps/admin/app/routes/app.quantity-breaks._index.tsx`.

- [ ] **Step 7: Verify typecheck + tests + build**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

Run: `cd apps/admin && pnpm vitest run`
Expected: PASS — 138 tests.

Run: `cd apps/admin && pnpm build`
Expected: PASS — build artifacts generated.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/app/components/QbTierBuilder.tsx apps/admin/app/components/ProductPicker.tsx apps/admin/app/components/UsageBanner.tsx apps/admin/app/components/PreviewPane.tsx apps/admin/app/routes/app.billing.tsx apps/admin/app/routes/app.bundles.new.tsx apps/admin/app/routes/app.quantity-breaks.new.tsx apps/admin/app/routes/app.bundles._index.tsx apps/admin/app/routes/app.quantity-breaks._index.tsx
git commit -m "refactor(admin): swap raw HTML for Polaris primitives across forms + pages"
```

---

## Task 7: Copy + accessibility nits (Batch 5)

**Files:**
- Modify: `apps/admin/app/routes/app.tsx`
- Modify: `apps/admin/app/routes/app._index.tsx`
- Modify: `apps/admin/app/routes/app.billing.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks._index.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.new.tsx`
- Modify: `apps/admin/app/routes/app.quantity-breaks.$id.tsx`

- [ ] **Step 1: Sentence-case "Quantity Breaks" → "Quantity breaks"**

Apply per-file (do NOT use a global sed — check each match):

`apps/admin/app/routes/app.tsx` — NavMenu link text:
```tsx
// Before: <Link to="/app/quantity-breaks">Quantity Breaks</Link>
<Link to="/app/quantity-breaks">Quantity breaks</Link>
```

`apps/admin/app/routes/app.quantity-breaks._index.tsx` — find:
- `<Page title="Quantity Breaks" ...>` → `<Page title="Quantity breaks" ...>`
- `<EmptyState heading="No Quantity Breaks yet" ...>` (if it says "Quantity Breaks") → `"No quantity breaks yet"`
- Any error messages or button labels using "Quantity Breaks" → "Quantity breaks"

`apps/admin/app/routes/app.quantity-breaks.new.tsx` — `backAction.content`:
```tsx
// Before: backAction={{ content: "Quantity Breaks", url: "/app/quantity-breaks" }}
backAction={{ content: "Quantity breaks", url: "/app/quantity-breaks" }}
```

`apps/admin/app/routes/app.quantity-breaks.$id.tsx` — same `backAction.content` rename.

Do NOT change file paths, route slugs, or any URL strings.

- [ ] **Step 2: Dashboard title rename**

`apps/admin/app/routes/app._index.tsx` — find both `<Page title="Analytics">` (skeleton + populated views) and replace:
```tsx
// Before: <Page title="Analytics">
<Page title="Dashboard">
```

This brings the title in line with the NavMenu's "Dashboard" link.

- [ ] **Step 3: Billing — accessibilityLabel on disabled "Current plan" button**

In `apps/admin/app/routes/app.billing.tsx`, find the disabled button rendered for the current plan (around line 168 per audit):

```tsx
// Before:
<Button disabled>Current plan</Button>

// After:
<Button disabled accessibilityLabel="You are on this plan">Current plan</Button>
```

- [ ] **Step 4: Verify typecheck + tests**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

Run: `cd apps/admin && pnpm vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/routes/app.tsx apps/admin/app/routes/app._index.tsx apps/admin/app/routes/app.billing.tsx apps/admin/app/routes/app.quantity-breaks._index.tsx apps/admin/app/routes/app.quantity-breaks.new.tsx apps/admin/app/routes/app.quantity-breaks.$id.tsx
git commit -m "fix(admin): sentence-case 'Quantity breaks' + dashboard title + a11y label"
```

---

## Task 8: Full sweep, build, and manual smoke checklist

**Files:** None directly (verification + doc append)

- [ ] **Step 1: Run the full admin test suite**

Run: `cd apps/admin && pnpm vitest run`
Expected: ALL pass — 138 tests across 23 test files.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 3: Build admin**

Run: `cd apps/admin && pnpm build`
Expected: PASS — Remix client + server bundles generated.

- [ ] **Step 4: Append manual smoke checklist to spec**

Append the following to `docs/superpowers/specs/2026-05-08-phase-8f-polaris-design-review-design.md` after the "Manual smoke checklist" content (or as a new "10. Manual QA execution" section if not already present):

```markdown

---

## 10. Manual QA execution log

To be completed after deploy:

- [ ] Single-bundle delete shows modal, loading state during action, closes on success
- [ ] Bulk-QB delete shows modal, loading state during action, closes on success
- [ ] Create bundle → list shows toast "<Bundle name> saved"
- [ ] Edit QB + save → toast "<QB name> saved"
- [ ] Cancel button on bundle form → returns to list without full-page reload
- [ ] Cancel button on QB form → returns to list without full-page reload
- [ ] Bundles list with zero items → empty state renders cleanly (no broken-image placeholder)
- [ ] QB list with zero items → same
- [ ] ProductPicker / VariantPicker / CollectionPicker with no image source → shows icon placeholder, not blank grey square
- [ ] Billing page → "Current plan" disabled button reads "You are on this plan" when navigated by screen reader
- [ ] Bundles list and QB list → visible gap between UsageBanner and IndexTable card
- [ ] Nav and page titles → "Quantity breaks" (sentence case), Dashboard title aligned

If any item fails: open a follow-up task with the specific reproduction steps.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-08-phase-8f-polaris-design-review-design.md
git commit -m "docs(phase-8f): append manual QA execution checklist"
```

---

## Phase 8.F Done When

- All 8 tasks above checked off
- `pnpm vitest run` green (138 tests)
- `pnpm tsc --noEmit` green
- `pnpm build` green
- Manual QA execution checklist documented for post-deploy verification

Manual QA itself runs after the production deploy (Phase 8.F.QA, deferred — not blocking this phase's completion).
