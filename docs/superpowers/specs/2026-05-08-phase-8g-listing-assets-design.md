# Phase 8.G: Listing Assets — Design Spec

**Date:** 2026-05-08
**Status:** Draft for review
**Parent phase:** Phase 8 — Polish for BFS (decomposed; this is sub-project G)
**Scope cut:** Code-implementable + listing-copy draft only. Screenshots and demo video are deferred to manual capture once Shopify-side billing block clears.

---

## 1. Goal

Ship the public-facing assets Shopify App Store requires for listing review: privacy policy page, support page (with Crisp live chat), and a draft of listing copy. Add an in-admin support route so merchants can reach support without leaving Shopify.

## 2. Architecture

```
visitor lands on App Store listing
  ↓
clicks "Privacy policy" link → bundler.deepseatools.in/privacy (public, no auth)
clicks "Support" link → bundler.deepseatools.in/support (public, Crisp widget)
                                                          ↓
                                                   visitor chats with us
                                                          ↓
                                              Crisp inbox (Crisp dashboard)

merchant inside Shopify admin
  ↓
clicks "Support" in NavMenu → /app/support (Polaris-styled, Crisp widget)
                                          ↓
                                   merchant chats with us
                                          ↓
                                Crisp inbox
```

## 3. New routes (3)

### 3.1 `apps/admin/app/routes/privacy.tsx` — Public privacy policy

No auth, no Polaris (must work standalone if reviewer opens the URL directly without Shopify context). Plain semantic HTML with minimal inline CSS for readability. Content covers:

- Identity: app name, company name (placeholder for user to fill), effective date 2026-05-08
- Data collected from merchants: shop domain, currency, locale, bundle/QB definitions, aggregated revenue attribution counts
- Data NOT collected: customer PII, payment info, browsing history
- GDPR webhook explanation: `customers/redact`, `customers/data-request`, `shop/redact` — what each does and 5-day SLA
- Retention: 30 days post-uninstall then hard-delete
- Third parties: Cloudflare (hosting), Shopify (platform), Crisp (chat — only on support route)
- Contact: support email placeholder

Loader returns `null` (no data needed). Component renders semantic `<article>` / `<h1>` / `<p>` structure with inline `<style>` block providing readable typography on mobile and desktop.

### 3.2 `apps/admin/app/routes/support.tsx` — Public support page

No auth, no Polaris. Sections:
- "Need help with Product Bundler?" headline
- Quick FAQ (6 entries):
  1. How do I install Product Bundler?
  2. How do I create my first bundle?
  3. Why isn't my bundle showing on the product page?
  4. How do I show a bundle on my homepage / blog post?
  5. How do I switch billing plans?
  6. How do I uninstall the app?
- "Still need help?" footer linking support email
- `<CrispChat />` component renders the chat bubble

### 3.3 `apps/admin/app/routes/app.support.tsx` — Embedded admin support page

Inside the embedded admin shell. Loader calls `authenticate.admin(request, ctx)`. Renders Polaris `<Page>` with same FAQ content as `/support` but using Polaris primitives (`Card`, `BlockStack`, `Text`, `Link`). Includes `<CrispChat />` at the bottom of the component (the script tag appears in the iframe DOM and Crisp's loader injects the bubble).

If Crisp turns out to misbehave inside the Shopify admin iframe (manual smoke test reveals this), the fallback is to remove `<CrispChat />` from this file only. The public support page keeps chat.

## 4. New component

### 4.1 `apps/admin/app/components/CrispChat.tsx` (~20 LOC)

```tsx
type Props = { websiteId: string };

export function CrispChat({ websiteId }: Props) {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.$crisp=[];window.CRISP_WEBSITE_ID="${websiteId}";(function(){var d=document;var s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();`,
      }}
    />
  );
}
```

Single prop. Caller passes `websiteId="1bc3a4d6-454d-4054-b07c-10599fd26d10"` (the Crisp workspace id you provided). This is a public id — safe to commit to source.

The script appends Crisp's loader to `<head>`. Crisp's loader then injects the chat bubble into the page. Async loading — does not block render.

## 5. Modified files (1)

### 5.1 `apps/admin/app/routes/app.tsx` — add Support nav link

In the `<NavMenu>` block, add `<Link to="/app/support">Support</Link>` as the last item:

```tsx
<NavMenu>
  <Link to="/app" rel="home">Dashboard</Link>
  <Link to="/app/bundles">Bundles</Link>
  <Link to="/app/quantity-breaks">Quantity breaks</Link>
  <Link to="/app/billing">Billing</Link>
  <Link to="/app/support">Support</Link>
</NavMenu>
```

## 6. Listing copy draft

### 6.1 `docs/listing/2026-05-08-app-store-listing-copy.md` (new)

Markdown document with sections:

- **App name** (≤30 chars): `Product Bundler — Bundles & QB`
- **Tagline** (≤60 chars): `Boost AOV with bundles, quantity breaks, and free gifts.`
- **Description** (~500 words): paragraphs covering: what the app does, who it's for, key features (classic bundles, mix-and-match, quantity breaks with BOGO/free gift, embed codes for non-PDP placement, 8 cart drawer integrations, analytics dashboard), pricing summary, support availability
- **Key features** (bulleted, ~10 items): each one short benefit-led sentence
- **Pricing** (table): Free/Starter/Growth/Unlimited with order caps
- **Categories**: Bundles & upsells; Discounts
- **URLs section** (placeholder values for the user to confirm):
  - App URL: `https://bundler.deepseatools.in`
  - Privacy: `https://bundler.deepseatools.in/privacy`
  - Support: `https://bundler.deepseatools.in/support`
  - Demo store: (to fill in)
- **Screenshots TODO** (5 items, deferred to manual): Dashboard, Bundle list, Bundle create wizard, Storefront widget on PDP, Embed code on custom page

## 7. File manifest

**Created (5):**
- `apps/admin/app/routes/privacy.tsx`
- `apps/admin/app/routes/support.tsx`
- `apps/admin/app/routes/app.support.tsx`
- `apps/admin/app/components/CrispChat.tsx`
- `docs/listing/2026-05-08-app-store-listing-copy.md`

**Modified (1):**
- `apps/admin/app/routes/app.tsx` (NavMenu addition)

## 8. Out of scope

- Screenshot capture (manual; needs prod app + sample data)
- Demo video recording (manual)
- Privacy policy legal review (recommended before public launch — placeholder copy is structurally complete but not lawyer-vetted)
- Multi-language support pages (English only for v1; matches CLAUDE.md §15 — i18n is separately tracked sub-project C, currently dropped)
- Crisp widget customization (colors, position) — using Crisp defaults; can theme later in Crisp dashboard

## 9. Testing

**Automated:** none new (consistent with Phase 8.F precedent — admin workspace doesn't have React testing setup; static-content routes have nothing to unit-test).

**Existing tests:**
- `pnpm tsc --noEmit` clean
- `pnpm vitest run` 184 admin + 72 widget tests pass (no regression)
- `pnpm build` succeeds

**Manual smoke (post-deploy):**

- [ ] `bundler.deepseatools.in/privacy` (incognito): privacy policy renders, no Crisp, no console errors
- [ ] `bundler.deepseatools.in/support` (incognito): support page + Crisp bubble appears within ~2s, opens chat panel
- [ ] Send a test message via public support → arrives in Crisp inbox
- [ ] Inside Shopify admin → click **Support** in NavMenu → `/app/support` renders, Crisp bubble visible
- [ ] Send test message via embedded admin support → arrives in Crisp inbox
- [ ] If embedded admin Crisp fails (App Bridge / iframe conflict): remove `<CrispChat />` from `app.support.tsx`, redeploy. Public `/support` keeps chat.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Crisp widget conflicts with App Bridge inside Shopify embedded iframe (postMessage cross-origin issues) | `/app/support` is the only admin page with Crisp; if it breaks, remove the component there only. Public `/support` is unaffected. |
| Crisp's external script blocked by Shopify CSP `script-src` directive | Embedded admin enforces strict CSP via `boundary.headers`. If `client.crisp.chat` is blocked, document and switch admin support to "Email us" link only. |
| Privacy policy text becomes inaccurate as features evolve (e.g. when orders/paid webhook re-enables, retention may change) | Add a TODO comment in the route file pointing to this spec; maintainers update both together. |
| Listing copy gets stale | Markdown lives in `docs/listing/` — easy to find. Update before each App Store re-submission. |
| `CrispChat` script tag inserted via `dangerouslySetInnerHTML` is XSS-able if `websiteId` ever became user-input | `websiteId` is hardcoded at the call site (passed as a literal). Never sourced from user input. |
