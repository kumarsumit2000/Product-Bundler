# Phase 8.F: Polaris Design Review — Design Spec

**Date:** 2026-05-08
**Status:** Draft for review
**Parent phase:** Phase 8 — Polish for BFS (decomposed; this is sub-project F)

---

## 1. Goal

Fix BFS-blocking and polish issues across the admin UI surfaced by an earlier audit pass. Three critical issues (browser `confirm()` dialogs, broken `EmptyState image=""`, missing form-submit loading states) plus 10 polish items plus 6 nits, batched into 5 implementation batches.

## 2. Audit summary (from prior pass)

**Critical (BFS-blocking):**
1. `confirm()` browser dialogs on 4 delete flows — blocked inside Shopify iframe, BFS rejects this
2. `image=""` on every `EmptyState` (4 places) — renders as broken placeholder
3. No loading state on `BundleForm` and `QbForm` primary submit buttons

**Important polish (10):** Raw `<details>`/`<summary>` in `QbTierBuilder`; inline `<div style={{ width: N }}>` wrappers; raw `<p>` tags inside Polaris `Banner`/`EmptyState`; no save-success toast; `Thumbnail source={x ?? ""}` blank fallback; missing `BlockStack` wrapper between `UsageBanner` and `Card`; "Quantity Breaks" sentence-case violation; `PreviewPane` hardcoded `#e3e3e3` border; disabled "Current plan" button missing `accessibilityLabel`; cancel `Button url=` triggers full reload.

**Nits (6):** Title misalignment "Analytics" vs "Dashboard"; brittle hard-coded section numbers in form headings; minor copy inconsistency between `BundleForm` and `QbForm` error banners.

## 3. Architecture

Two new shared utilities centralize the most-repeated patterns. The rest is in-place edits across 12 existing files.

```
add-to-cart success → redirect("/app/bundles?saved=<name>")
                                    ↓
list page mounts useSavedToast()    ↓
                                    ↓
                         reads ?saved param
                                    ↓
                  shopify.toast.show(`${name} saved`)
                                    ↓
                history.replaceState removes param

delete-button-click  → setDeleteTarget(id)
                                    ↓
                       <ConfirmModal open={...} />
                                    ↓
              onConfirm: fetcher.submit({ _action: "delete", id })
                                    ↓
                modal stays open with loading=true
                                    ↓
              fetcher.state === "idle" → modal closes
```

## 4. New files

### 4.1 `apps/admin/app/components/ConfirmModal.tsx` (~50 LOC)

```tsx
type Props = {
  open: boolean;
  title: string;
  body: string;
  destructiveLabel?: string;  // default "Delete"
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmModal({ open, title, body, destructiveLabel = "Delete", loading, onConfirm, onClose }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      primaryAction={{ content: destructiveLabel, destructive: true, loading: !!loading, onAction: onConfirm }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <Text as="p">{body}</Text>
      </Modal.Section>
    </Modal>
  );
}
```

Used 4×: single + bulk delete on `app.bundles._index.tsx` and `app.quantity-breaks._index.tsx`.

### 4.2 `apps/admin/app/lib/toast.ts` (~25 LOC)

```ts
export function useSavedToast(): void {
  const [params, setParams] = useSearchParams();
  const saved = params.get("saved");
  useEffect(() => {
    if (!saved) return;
    const w = window as unknown as { shopify?: { toast?: { show: (msg: string) => void } } };
    w.shopify?.toast?.show(saved === "1" ? "Saved" : `${saved} saved`);
    const next = new URLSearchParams(params);
    next.delete("saved");
    setParams(next, { replace: true });
  }, [saved, params, setParams]);
}
```

## 5. Modified files (12) — batch breakdown

### Batch 1 — Modal-based delete confirmation (BFS-blocker)

- `app.bundles._index.tsx`: replace `confirm("Delete bundle X?")` in row delete + bulk delete with `ConfirmModal`. State: `[deleteTarget, setDeleteTarget] = useState<string | "bulk" | null>(null)`. On confirm: `fetcher.submit({ _action: "delete", id: deleteTarget }, { method: "post" })`. Modal `loading` bound to `fetcher.state !== "idle"`. Auto-closes via `useEffect` when `fetcher.state` returns to `idle`.
- `app.quantity-breaks._index.tsx`: same pattern.

### Batch 2 — EmptyState + Thumbnail fallbacks (BFS-blocker + polish)

- All 4 `<EmptyState image="" ...>` → drop the `image` prop entirely. Polaris renders heading + body + action without illustration. Files: `app.bundles._index.tsx`, `app.bundles.new.tsx`, `app.quantity-breaks._index.tsx`, `app.quantity-breaks.new.tsx`.
- `Thumbnail source={x ?? ""}` (3 places) → import `ImageIcon` from `@shopify/polaris-icons` and pass `source={x ?? ImageIcon}`. Files: `ProductPicker.tsx`, `VariantPicker.tsx`, `CollectionPicker.tsx`.

### Batch 3 — Form submit loading + save toast + cancel button (BFS-blocker + polish)

- `BundleForm.tsx` and `QbForm.tsx`:
  - Import `useNavigation` from `@remix-run/react`
  - `const navigation = useNavigation();`
  - `const isSubmitting = navigation.state === "submitting";`
  - Submit button: `<Button submit variant="primary" loading={isSubmitting}>{submitLabel}</Button>`
  - Cancel button: replace `<Button url="/app/bundles">Cancel</Button>` with `<Button onClick={() => navigate("/app/bundles")}>Cancel</Button>` using `useNavigate`
  - Reconcile error banner copy: both forms use `"Fix these issues to save"` (drop `BundleForm`'s `"...the bundle"` suffix)
- Action handlers in 4 routes (`app.bundles.new.tsx`, `app.bundles.$id.tsx`, `app.quantity-breaks.new.tsx`, `app.quantity-breaks.$id.tsx`): change final `redirect("/app/bundles")` to `redirect("/app/bundles?saved=" + encodeURIComponent(name))`. Same for QB routes.
- `app.bundles._index.tsx` and `app.quantity-breaks._index.tsx`: call `useSavedToast()` at the top of the default export component.

### Batch 4 — Polaris primitive replacements (polish)

- `QbTierBuilder.tsx`:
  - `<details>`/`<summary>` → Polaris `Collapsible` driven by `useState`, with a `<Button variant="plain">{open ? "Hide" : "Show"} advanced</Button>` trigger
  - `<div style={{ width: 80 }}>` → `<Box minWidth="5rem">` (3 instances)
  - `<div style={{ width: 160 }}>` → `<Box minWidth="10rem">`
  - `<div style={{ width: 100 }}>` → `<Box minWidth="6.25rem">`
  - `<div style={{ flex: 1 }}>` → leave as-is (Polaris has no flex-grow primitive)
  - `<div style={{ paddingLeft: 8 }}>` → `<Box paddingInlineStart="200">`
- `ProductPicker.tsx` line 70 `<div style={{ width: 80 }}>` → `<Box minWidth="5rem">`
- `UsageBanner.tsx`: 3× raw `<p>` → `<Text as="p">`
- `app.billing.tsx`: 1× raw `<p>` in info Banner → `<Text as="p">`
- `app.bundles.new.tsx` + `app.quantity-breaks.new.tsx`: 1× raw `<p>` in plan-gate `EmptyState` → `<Text as="p">`
- `PreviewPane.tsx` line 34: wrap iframe in `<Box borderWidth="025" borderColor="border" borderRadius="200">`; remove inline `border` and `borderRadius` from iframe; keep `width: "100%"` and `height: "560px"` inline (Polaris `Box` doesn't take pixel heights via tokens)
- `app.bundles._index.tsx` and `app.quantity-breaks._index.tsx`: wrap `<UsageBanner>` + `<Card>` (or `<EmptyState>`) in `<BlockStack gap="400">` to give them proper spacing in both empty and populated branches

### Batch 5 — Copy + accessibility nits (polish)

- "Quantity Breaks" → "Quantity breaks" everywhere (search-and-replace):
  - `app.quantity-breaks._index.tsx` (`Page title`, `EmptyState heading`, error text)
  - `app.quantity-breaks.new.tsx` (`backAction.content`)
  - `app.quantity-breaks.$id.tsx` (`backAction.content`)
  - `app.tsx` NavMenu (`<Link to="/app/quantity-breaks">Quantity Breaks</Link>` → `Quantity breaks`)
- `app.billing.tsx`: disabled "Current plan" button → add `accessibilityLabel="You are on this plan"`
- `app._index.tsx`: `<Page title="Analytics">` → `<Page title="Dashboard">` (in both the skeleton-loading view and the populated view)

## 6. Testing

**Automated (vitest + jsdom) — 5 new tests:**

`apps/admin/test/ConfirmModal.test.tsx`:
1. Renders title + body when `open=true`; nothing when `open=false`
2. Clicking destructive button calls `onConfirm`; clicking cancel calls `onClose`
3. `loading=true` disables the destructive button

`apps/admin/test/useSavedToast.test.tsx`:
1. With `?saved=Foo` in URL, calls mocked `shopify.toast.show("Foo saved")` and removes the param
2. With no `?saved` param, never calls toast and leaves URL alone

**Not automated:** loading state on form submits, `Box`/`Collapsible` swaps, `Thumbnail` icon fallback, sentence-case text changes — declarative-only changes, not worth unit-testing.

**Manual smoke checklist (run once post-merge):**

- [ ] Single-bundle delete shows modal, loading state during action, closes on success
- [ ] Bulk-QB delete same
- [ ] Create bundle → list shows toast `"<Bundle name> saved"`
- [ ] Edit QB + save → toast fires
- [ ] Cancel from bundle form → returns to list without full reload
- [ ] List pages with zero items → empty state renders cleanly (no broken-image placeholder)
- [ ] `Thumbnail` with no image source → shows icon placeholder, not blank grey
- [ ] Billing page → "Current plan" disabled button reads "You are on this plan" via screen reader
- [ ] List pages → visible gap between `UsageBanner` and the card below
- [ ] All "Quantity Breaks" instances now read "Quantity breaks"

## 7. File manifest

**Created (4):**
- `apps/admin/app/components/ConfirmModal.tsx`
- `apps/admin/app/lib/toast.ts`
- `apps/admin/test/ConfirmModal.test.tsx`
- `apps/admin/test/useSavedToast.test.tsx`

**Modified (17):**
- `apps/admin/app/routes/app.tsx`
- `apps/admin/app/routes/app._index.tsx`
- `apps/admin/app/routes/app.bundles._index.tsx`
- `apps/admin/app/routes/app.bundles.new.tsx`
- `apps/admin/app/routes/app.bundles.$id.tsx`
- `apps/admin/app/routes/app.quantity-breaks._index.tsx`
- `apps/admin/app/routes/app.quantity-breaks.new.tsx`
- `apps/admin/app/routes/app.quantity-breaks.$id.tsx`
- `apps/admin/app/routes/app.billing.tsx`
- `apps/admin/app/components/BundleForm.tsx`
- `apps/admin/app/components/QbForm.tsx`
- `apps/admin/app/components/QbTierBuilder.tsx`
- `apps/admin/app/components/ProductPicker.tsx`
- `apps/admin/app/components/VariantPicker.tsx`
- `apps/admin/app/components/CollectionPicker.tsx`
- `apps/admin/app/components/UsageBanner.tsx`
- `apps/admin/app/components/PreviewPane.tsx`

## 8. Out of scope

- Real BFS submission — that's a separate phase (Phase 9 per CLAUDE.md §15)
- The "Analytics dashboard" page-builder integrations / page builder support — sub-project B, separate spec
- Performance / Lighthouse work — sub-project E, separate spec
- Listing assets (privacy, support, screenshots) — sub-project G, separate spec
- Adding curated `EmptyState` illustrations — flagged for design follow-up; current spec drops `image=""` entirely

## 9. Risks

| Risk | Mitigation |
|---|---|
| Modal `useEffect`-based auto-close races with fetcher state transitions | Track an `inFlight` boolean alongside `deleteTarget` so close-on-idle only fires after a submission has actually run, not on initial mount when fetcher is also `idle` |
| Toast helper depends on `window.shopify.toast.show` which is App Bridge V4 runtime API; may not exist in test/SSR | Optional chaining (`w.shopify?.toast?.show`); test mocks the window global |
| Sentence-case search-and-replace catches a string we shouldn't change | Search is deliberately scoped per file with explicit list of files in §5; manual review of each diff before commit |
| `Polaris-icons` import for `ImageIcon` adds ~1KB to admin bundle | Negligible — admin bundle is already 200KB+ and not user-facing on storefront |

---

## 10. Manual QA execution log

To be completed after deploy:

- [ ] Single-bundle delete shows modal, loading state during action, closes on success
- [ ] Bulk-QB delete shows modal, loading state during action, closes on success
- [ ] Create bundle → list shows toast `<Bundle name> saved`
- [ ] Edit QB + save → toast `<QB name> saved`
- [ ] Cancel button on bundle form → returns to list without full-page reload
- [ ] Cancel button on QB form → returns to list without full-page reload
- [ ] Bundles list with zero items → renders Card+BlockStack empty state cleanly (no broken-image placeholder, no EmptyState)
- [ ] QB list with zero items → same
- [ ] ProductPicker / VariantPicker / CollectionPicker with no image source → shows `ImageIcon` placeholder, not blank grey square
- [ ] Billing page → "Current plan" disabled button reads "You are on this plan" via screen reader
- [ ] Bundles list and QB list → visible `gap="400"` between UsageBanner and IndexTable card
- [ ] Nav and page titles → "Quantity breaks" (sentence case); Dashboard title aligned
- [ ] QB edit page with existing free gift / BOGO → Advanced section auto-opens

If any item fails: open a follow-up task with specific repro steps.
