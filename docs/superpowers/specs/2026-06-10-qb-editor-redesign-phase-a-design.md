# QB Editor Redesign — Phase A: Shell & Sections

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation planning
**Part of:** a multi-phase Quantity-Break editor redesign to match the Pumper competitor editor. Phase A is the structural shell + tier-row chrome. Later phases (B tier editor, C color & style, D advanced settings, E subscription preview rows, F sticky bar, G market targeting, H preview product picker) are separate specs.

## Context

Our QB editor (`app.quantity-breaks.new.tsx` / `.$id.tsx` + `QbForm.tsx`) already has all the core fields across 13 flat cards in a two-column form + live-preview layout. The Pumper reference presents the same kind of content in a much more polished, organized way: three collapsible accordion groups ("Select Product & Basic Setup", "Edit Tier Deals", "Cherries on Top"), collapsible per-tier rows with drag-reorder / enable / duplicate / ⭐, a header-text live preview, and a sticky Save-as-draft / Publish footer.

Phase A reorganizes the **existing** fields into that structure and adds the **tier-row chrome**. It introduces no new feature fields or widget behaviors beyond a per-tier `enabled` flag — those richer features are deferred to later phases.

## Goal

Restyle the QB editor into Pumper's accordion shell and give tiers draggable, collapsible rows with enable/duplicate/⭐ controls, without changing what any existing field does.

## Architecture

- A small reusable **`CollapsibleSection`** component (Polaris `Card` + `Collapsible` + a clickable header row with title, optional subtitle, optional right-side control, and a chevron) provides the accordion behavior.
- **`QbForm.tsx`** render is reorganized into three top-level groups using `CollapsibleSection`. No field components are rewritten — they are moved into the new groups. (`QbForm` is already large; this is a render-structure refactor, not a logic change.)
- **`QbTierBuilder.tsx`** gains per-tier row chrome (drag handle, enable toggle, duplicate, ⭐, collapse/expand). Inner tier fields are unchanged.
- The **route page** (both `new` and `$id`) gains a sticky footer action bar with "Save as draft" and "Publish".

## Section mapping (existing field → new group)

**Group 1 — "Select Product & Basic Setup"** (default expanded)
- **Deal Name** — the existing `name` field (relabeled).
- **Header Text** — the existing `headline` field (relabeled "Header Text"), with a presentational **live arrow preview**: `[input] → <styled header text>`. (No "hide lines" toggle — that's a later phase.)
- **Apply Deal on** — the existing `visibility` ChoiceList (All products / All except / Specific / Collections) + `bindToCurrentProduct` + the conditional `ProductPicker` / `MultiCollectionPicker` (relabeled section header to "Apply Deal on").

**Group 2 — "Edit Tier Deals"**
- `QbTierBuilder` rendered with collapsible tier rows. Each row header: drag handle `⠿`, enable `Switch`, `Tier N: Buy {qty}` label, duplicate icon button, ⭐ most-popular icon button, expand/collapse chevron. Row body (when expanded) = the existing qty / discount-type / discount-value / label fields + remove button.
- "+ Add Tier" button (existing behavior).

**Group 3 — "Cherries on Top"** (group header + subtitle "Color & style, Subscription, Sticky bar, and more"). Nests the remaining existing cards, each as its own `CollapsibleSection`:
- **Color & style** — `SimpleQbStylePanel`
- **Free gift** — existing QB-level free-gift card
- **Checkbox upsells** — `QbUpsellsBuilder`
- **Add-ons** — `WidgetAddonsCard`
- **Subscription** — `SubscriptionPanel`
- **Sticky bar** — `StickyAtcCard`
- **Settings** — status, scheduling (`activeStartAt`/`activeEndAt`), `combinable`, `sortOrder`, and **Text overrides**

## Tier-row chrome details

- **Drag-to-reorder:** native HTML5 drag events (`draggable`, `onDragStart`/`onDragOver`/`onDrop`) on the tier rows — **no new dependency**. Reordering mutates the `tiers` array order (which is already the render order).
- **Enable toggle:** new per-tier `enabled` flag. A disabled tier is excluded from the widget and from preview.
- **Duplicate:** clones a tier (deep copy) and inserts it after the original; the clone's `isMostPopular` is forced `false` (only one popular tier).
- **⭐ most-popular:** toggles `isMostPopular` for that tier and clears it on all others (mirrors today's single-popular rule). Replaces the inline "Popular" checkbox.
- **Collapse/expand:** each row remembers its open/closed state locally (UI state, not persisted); default newly-added tiers open, existing ones collapsed.

## Data / widget changes

- Add `enabled?: boolean` to the `QbTier` type in `drizzle/schema.ts` and to `TierFormValue` in `QbTierBuilder`. **No DB migration** — `tiers` is a JSON column; a missing `enabled` is treated as `true` everywhere.
- The QB route action already serializes tiers from the form; include `enabled` (default `true`).
- `lib/preview-config.ts` (`buildPreviewQbConfig`) and `lib/storefront-config.ts` (QB serializer) pass `enabled` through, defaulting absent → `true`.
- Widget `apps/widget-src/src/render-qb.ts`: filter out tiers where `enabled === false` before rendering (a tier with `enabled === undefined` renders — backward compatible).
- Widget types: add `enabled?: boolean` to the `QbTier` widget type.

## Footer action bar

- A sticky bar at the bottom of the form column with **"Save as draft"** (sets `status = "draft"`) and **"Publish"** (sets `status = "active"`) buttons. Both submit the existing form (`QB_FORM_ID` via `submitFormById`) after setting the hidden `status` value. The inline status control moves into the "Settings" sub-section (still editable there) but the footer is the primary save path.

## Error handling / edge cases

- Reordering or disabling tiers must keep the "exactly one most-popular" invariant (if the popular tier is disabled, the badge simply doesn't render — no auto-reassign).
- Disabling **all** tiers → widget renders nothing for that QB (acceptable; matches an empty/paused offer). The admin may show a subtle hint, but no hard block.
- Collapsible open/closed state is local UI only; never persisted, never sent to the server.

## Testing

- **Unit (admin):** a small pure helper module for tier-array ops (`reorderTiers`, `duplicateTier`, `setEnabled`, `setMostPopular`) with tests; parse keeps `enabled`; storefront-config + preview-config default absent `enabled` → included.
- **Unit (widget):** `render-qb` excludes `enabled === false` tiers and includes `enabled === undefined`.
- **Regression:** existing 211 admin + 108 widget tests stay green; typecheck clean; widget build clean.
- **Manual:** load `/app/quantity-breaks/new`, confirm the three accordion groups expand/collapse, tiers drag-reorder + duplicate + enable-toggle + ⭐ work, header-text arrow preview updates live, and Save-as-draft / Publish save with the right status.

## Out of scope (later phases)

Basic-Setup toggles (let-customers-choose-variants, volume-discount-extend-to-all, hide-lines-around-text), rich tier fields (discount-type tabs incl. BOGO, dynamic variables, price rounding, mark-as-sold-out, per-tier Add-On chips), color-palette presets + visual color mapping, Advanced Settings toggles, subscription as selectable preview rows, sticky-bar expansion, target-by-market, and the "choose a product to preview" picker.
