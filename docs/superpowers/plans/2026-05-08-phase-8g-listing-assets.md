# Phase 8.G: Listing Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public-facing assets Shopify App Store requires for listing review (privacy + support pages with Crisp chat) and a draft of listing copy. Add an in-admin support route mirroring the public one.

**Architecture:** 3 new Remix routes — 2 public (no auth, no Polaris, plain HTML) and 1 embedded admin (Polaris). 1 reusable `<CrispChat />` component injects Crisp's loader script via `dangerouslySetInnerHTML`. 1 markdown doc captures App Store listing copy.

**Tech Stack:** Remix on `@remix-run/cloudflare-pages`, Polaris v13 (admin only), Crisp client (`client.crisp.chat/l.js`).

**Reference docs:**
- Spec: [docs/superpowers/specs/2026-05-08-phase-8g-listing-assets-design.md](../specs/2026-05-08-phase-8g-listing-assets-design.md)
- Crisp website id: `1bc3a4d6-454d-4054-b07c-10599fd26d10` (public; safe to commit)

**Codebase conventions:**
- `~` alias resolves to `apps/admin/app/`
- Public routes (no auth) use `_index.tsx` as a precedent: a Remix route with no `authenticate.admin` call returns plain content
- Polaris admin pages mount inside `app.tsx` (parent route runs `authenticate.admin`)
- Run from `apps/admin/`: `pnpm tsc --noEmit`, `pnpm vitest run`, `pnpm build`
- Commit straight to `main` (team workflow)

---

## File Structure

**Created (5):**
| Path | Responsibility |
|---|---|
| `apps/admin/app/components/CrispChat.tsx` | Renders `<script>` injecting Crisp loader. Single prop `{ websiteId: string }` |
| `apps/admin/app/routes/privacy.tsx` | Public privacy policy. No auth, no Polaris. Inline minimal CSS |
| `apps/admin/app/routes/support.tsx` | Public support page with FAQ + Crisp widget. No auth, no Polaris |
| `apps/admin/app/routes/app.support.tsx` | Embedded admin support — Polaris-styled FAQ + Crisp widget |
| `docs/listing/2026-05-08-app-store-listing-copy.md` | App Store listing copy draft (markdown) |

**Modified (1):**
| Path | Change |
|---|---|
| `apps/admin/app/routes/app.tsx` | Add `<Link to="/app/support">Support</Link>` to NavMenu |

---

## Task 1: CrispChat component

**Files:**
- Create: `apps/admin/app/components/CrispChat.tsx`

- [ ] **Step 1: Create the component**

Create `apps/admin/app/components/CrispChat.tsx`:
```tsx
type Props = { websiteId: string };

// Injects Crisp's loader script into <head>. The loader then fetches the chat
// widget code and renders the floating bubble. Async load — does not block.
//
// websiteId is the public Crisp workspace identifier (safe to commit). It is
// hardcoded by callers — never sourced from user input — so the dangerouslySetInnerHTML
// XSS surface is closed.
export function CrispChat({ websiteId }: Props) {
  const safeId = websiteId.replace(/[^a-zA-Z0-9-]/g, "");
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.$crisp=[];window.CRISP_WEBSITE_ID="${safeId}";(function(){var d=document;var s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();`,
      }}
    />
  );
}
```

The `safeId.replace` regex is defense-in-depth: even though websiteId is hardcoded by callers today, future-proofing against accidental bad input. Crisp ids only use alphanumerics and hyphens.

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS — no new type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/components/CrispChat.tsx
git commit -m "feat(admin): add CrispChat component for chat-widget injection"
```

---

## Task 2: Public privacy policy route

**Files:**
- Create: `apps/admin/app/routes/privacy.tsx`

- [ ] **Step 1: Create the route**

Create `apps/admin/app/routes/privacy.tsx`:
```tsx
import type { MetaFunction } from "@remix-run/cloudflare";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — Product Bundler" },
  { name: "description", content: "Product Bundler privacy policy: what we collect, what we don't, and how we handle merchant and customer data." },
];

const STYLES = `
  :root { color-scheme: light; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    color: #1a1a1a;
    background: #ffffff;
    line-height: 1.6;
  }
  main { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
  h1 { font-size: 32px; margin: 0 0 8px; }
  h2 { font-size: 22px; margin: 32px 0 8px; }
  p, li { font-size: 16px; }
  ul { padding-left: 20px; }
  .meta { color: #666; font-size: 14px; margin-bottom: 32px; }
  a { color: #2c6ecb; }
`;

export default function PrivacyPolicy() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <main>
        <h1>Privacy Policy</h1>
        <p className="meta">Product Bundler · Effective 2026-05-08</p>

        <h2>Who we are</h2>
        <p>
          Product Bundler is a Shopify app that lets merchants create product bundles
          and quantity-break offers. The app is operated by the developer listed in the
          Shopify App Store. Contact:{" "}
          <a href="mailto:support@deepseatools.in">support@deepseatools.in</a>.
        </p>

        <h2>What we collect</h2>
        <p>From the merchant's Shopify store, we collect:</p>
        <ul>
          <li>Shop domain, currency, primary locale</li>
          <li>Bundle and quantity-break definitions the merchant creates inside our app</li>
          <li>Aggregated revenue attribution: order counts and revenue totals tied to bundles, with no customer identifiers</li>
          <li>Webhook timestamps for idempotency (kept 7 days)</li>
        </ul>

        <h2>What we do NOT collect</h2>
        <ul>
          <li>Customer names, email addresses, phone numbers, or shipping addresses</li>
          <li>Customer payment information</li>
          <li>Customer browsing or cart history beyond an aggregated bundle-revenue counter</li>
        </ul>

        <h2>GDPR compliance webhooks</h2>
        <p>Shopify sends three mandatory privacy webhooks. We respond as follows:</p>
        <ul>
          <li><strong>customers/redact:</strong> we store no per-customer data; we acknowledge with HTTP 200 and take no further action.</li>
          <li><strong>customers/data-request:</strong> same — no data to return; HTTP 200.</li>
          <li><strong>shop/redact:</strong> on receipt, we hard-delete all data tied to that shop within 48 hours.</li>
        </ul>

        <h2>Data retention</h2>
        <p>
          When a merchant uninstalls the app, we mark their account as uninstalled and
          retain bundle/QB configuration for 30 days in case they reinstall. After 30
          days, all data tied to that shop is permanently deleted.
        </p>

        <h2>Third parties</h2>
        <ul>
          <li>
            <strong>Cloudflare</strong> — hosts our app code and database. Cloudflare's
            privacy policy:{" "}
            <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener noreferrer">
              cloudflare.com/privacypolicy
            </a>
          </li>
          <li>
            <strong>Shopify</strong> — provides the platform and API. Shopify's privacy
            policy:{" "}
            <a href="https://www.shopify.com/legal/privacy" rel="noopener noreferrer">
              shopify.com/legal/privacy
            </a>
          </li>
          <li>
            <strong>Crisp Chat</strong> — only loaded on the support page and the
            in-app support route. If you start a chat with us, Crisp processes the
            message content. Crisp's privacy policy:{" "}
            <a href="https://crisp.chat/en/privacy/" rel="noopener noreferrer">
              crisp.chat/en/privacy
            </a>
          </li>
        </ul>

        <h2>Changes to this policy</h2>
        <p>
          We will update the "Effective" date above when we revise this policy.
          Continued use of the app after a change constitutes acceptance.
        </p>

        <h2>Contact</h2>
        <p>
          Questions or requests:{" "}
          <a href="mailto:support@deepseatools.in">support@deepseatools.in</a>.
        </p>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Smoke-build**

Run: `cd apps/admin && pnpm build`
Expected: SUCCESS — the route compiles into the Remix bundle.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/routes/privacy.tsx
git commit -m "feat(admin): add public privacy policy page at /privacy"
```

---

## Task 3: Public support page route (with Crisp)

**Files:**
- Create: `apps/admin/app/routes/support.tsx`

- [ ] **Step 1: Create the route**

Create `apps/admin/app/routes/support.tsx`:
```tsx
import type { MetaFunction } from "@remix-run/cloudflare";
import { CrispChat } from "~/components/CrispChat";

const CRISP_WEBSITE_ID = "1bc3a4d6-454d-4054-b07c-10599fd26d10";

export const meta: MetaFunction = () => [
  { title: "Support — Product Bundler" },
  { name: "description", content: "Get help with Product Bundler. FAQ and live chat." },
];

const STYLES = `
  :root { color-scheme: light; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    color: #1a1a1a;
    background: #ffffff;
    line-height: 1.6;
  }
  main { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
  h1 { font-size: 32px; margin: 0 0 24px; }
  h2 { font-size: 18px; margin: 24px 0 4px; color: #2c6ecb; }
  p, li { font-size: 16px; }
  details {
    border: 1px solid #e3e3e3;
    border-radius: 8px;
    padding: 12px 16px;
    margin: 8px 0;
  }
  details summary {
    cursor: pointer;
    font-weight: 500;
    font-size: 16px;
    padding: 4px 0;
  }
  details[open] summary { margin-bottom: 8px; }
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee; color: #666; }
  a { color: #2c6ecb; }
`;

export default function Support() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <main>
        <h1>Need help with Product Bundler?</h1>
        <p>
          Browse the FAQ below, or click the chat bubble in the bottom-right to talk
          with us live. Average response time: under 2 hours during business hours.
        </p>

        <details>
          <summary>How do I install Product Bundler?</summary>
          <p>
            Visit the Shopify App Store, search for "Product Bundler", and click
            "Install". Approve the requested permissions. The app loads inside your
            Shopify Admin under Apps → Product Bundler.
          </p>
        </details>

        <details>
          <summary>How do I create my first bundle?</summary>
          <p>
            From the Bundles tab, click "Create bundle". Pick the products you want
            to group together, set the discount (percentage or flat), and save. The
            bundle widget appears automatically on the product detail pages of the
            members you selected.
          </p>
        </details>

        <details>
          <summary>Why isn't my bundle showing on the product page?</summary>
          <p>
            Two common reasons: (1) The bundle status is "Draft" — switch it to
            "Active" on the bundle's edit page. (2) Our App Embed is not enabled in
            your theme. Open the theme editor → App embeds → make sure
            "Bundler App Embed" is toggled on.
          </p>
        </details>

        <details>
          <summary>How do I show a bundle on my homepage or a blog post?</summary>
          <p>
            On the bundle's edit page, scroll down to the "Embed code" card. Click
            Copy. Paste the snippet into any HTML block — Shopify pages, blog
            posts, page-builder Custom HTML elements, or theme Liquid templates.
          </p>
        </details>

        <details>
          <summary>How do I switch billing plans?</summary>
          <p>
            Open the Billing tab inside the app. Pick a plan card, click Upgrade,
            approve the charge in Shopify. Downgrades take effect at the end of
            the current billing cycle.
          </p>
        </details>

        <details>
          <summary>How do I uninstall the app?</summary>
          <p>
            From your Shopify Admin, go to Settings → Apps and sales channels →
            Product Bundler → Uninstall. We retain your configuration for 30 days
            in case you reinstall, then delete it permanently.
          </p>
        </details>

        <p className="footer">
          Still need help?{" "}
          <a href="mailto:support@deepseatools.in">support@deepseatools.in</a>
        </p>
      </main>
      <CrispChat websiteId={CRISP_WEBSITE_ID} />
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `cd apps/admin && pnpm build`
Expected: SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/routes/support.tsx
git commit -m "feat(admin): add public support page with Crisp chat at /support"
```

---

## Task 4: Embedded admin support route (with Crisp)

**Files:**
- Create: `apps/admin/app/routes/app.support.tsx`

- [ ] **Step 1: Create the route**

Create `apps/admin/app/routes/app.support.tsx`:
```tsx
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Page, Card, BlockStack, Text, Link as PolarisLink } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { CrispChat } from "~/components/CrispChat";

const CRISP_WEBSITE_ID = "1bc3a4d6-454d-4054-b07c-10599fd26d10";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
  return json({});
}

type FaqItem = { q: string; a: string };

const FAQ: FaqItem[] = [
  {
    q: "How do I create my first bundle?",
    a: "From the Bundles tab, click Create bundle. Pick the products to group, set the discount, and save. The widget appears automatically on the bundle members' product pages.",
  },
  {
    q: "Why isn't my bundle showing on the product page?",
    a: "Two common reasons: the bundle is in Draft status (switch to Active on the edit page), or our App Embed isn't enabled in your theme (Theme editor → App embeds → enable Bundler App Embed).",
  },
  {
    q: "How do I show a bundle on my homepage or blog?",
    a: "On the bundle's edit page, scroll to the Embed code card. Click Copy. Paste the snippet anywhere your theme accepts HTML — Shopify pages, blog posts, or page-builder Custom HTML blocks.",
  },
  {
    q: "How do I switch billing plans?",
    a: "Open the Billing tab. Pick a plan card and click Upgrade or Downgrade. Approve the charge in Shopify if upgrading.",
  },
  {
    q: "How do I get more help?",
    a: "Click the chat bubble in the bottom-right of this page, or email support@deepseatools.in.",
  },
];

export default function SupportPage() {
  return (
    <Page title="Support">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Frequently asked questions</Text>
            <Text as="p" tone="subdued">
              Browse the answers below, or click the chat bubble in the bottom-right
              to talk with us live.
            </Text>
          </BlockStack>
        </Card>

        {FAQ.map((item, i) => (
          <Card key={i}>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">{item.q}</Text>
              <Text as="p">{item.a}</Text>
            </BlockStack>
          </Card>
        ))}

        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingMd">Still need help?</Text>
            <Text as="p">
              Email{" "}
              <PolarisLink url="mailto:support@deepseatools.in">support@deepseatools.in</PolarisLink>
              {" "}or use the chat bubble.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
      <CrispChat websiteId={CRISP_WEBSITE_ID} />
    </Page>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run admin tests (regression check)**

Run: `cd apps/admin && pnpm vitest run`
Expected: PASS — 184 existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/routes/app.support.tsx
git commit -m "feat(admin): add embedded admin support page at /app/support"
```

---

## Task 5: Add Support link to NavMenu

**Files:**
- Modify: `apps/admin/app/routes/app.tsx`

- [ ] **Step 1: Add the link**

In `apps/admin/app/routes/app.tsx`, find the existing `<NavMenu>` block. Add a new `<Link>` AFTER the existing Billing link:

Before:
```tsx
<NavMenu>
  <Link to="/app" rel="home">Dashboard</Link>
  <Link to="/app/bundles">Bundles</Link>
  <Link to="/app/quantity-breaks">Quantity breaks</Link>
  <Link to="/app/billing">Billing</Link>
</NavMenu>
```

After:
```tsx
<NavMenu>
  <Link to="/app" rel="home">Dashboard</Link>
  <Link to="/app/bundles">Bundles</Link>
  <Link to="/app/quantity-breaks">Quantity breaks</Link>
  <Link to="/app/billing">Billing</Link>
  <Link to="/app/support">Support</Link>
</NavMenu>
```

- [ ] **Step 2: Verify typecheck + tests**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

Run: `cd apps/admin && pnpm vitest run`
Expected: PASS — 184 tests.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/routes/app.tsx
git commit -m "feat(admin): add Support link to NavMenu"
```

---

## Task 6: App Store listing copy draft

**Files:**
- Create: `docs/listing/2026-05-08-app-store-listing-copy.md`

- [ ] **Step 1: Verify the docs/listing directory exists or create it**

Run: `mkdir -p "docs/listing"`
Expected: directory exists (no output if already existed).

- [ ] **Step 2: Create the listing copy markdown**

Create `docs/listing/2026-05-08-app-store-listing-copy.md`:
```markdown
# Product Bundler — App Store Listing Copy

**Status:** Draft for App Store submission
**Last updated:** 2026-05-08

---

## App name (≤30 characters)

```
Product Bundler — Bundles & QB
```

## Tagline (≤60 characters)

```
Boost AOV with bundles, quantity breaks, and free gifts.
```

## Short description (≤120 characters, used on category pages)

```
Bundles, quantity breaks, BOGO, free gifts, embed codes — built for Shopify, no theme edits required.
```

## Long description

> Note: ~500 words, formatted as paragraphs in Shopify's listing editor. Shopify accepts a subset of HTML/markdown.

Product Bundler is a Built-for-Shopify-grade bundling and quantity-break app that helps merchants increase average order value without touching theme code. From a single dashboard, build product bundles, tiered pricing, and free-gift promotions that show up automatically on your product pages — and anywhere else you want them.

**What you get:**

- **Classic bundles** — group two or more products together with a percentage, flat, or fixed-total discount. Customers see "Frequently bought together" widgets on the product detail page; one click adds everything to cart with the discount baked in via Shopify Functions.
- **Mix-and-match bundles** — let customers pick N items from a collection ("Pick any 4, save 10%"). Perfect for skincare sets, supplement stacks, and apparel curations.
- **Quantity breaks** — tiered single-product discounts ("1 = $20, 2 = $18 each, 3 = $15 each"). Mark a tier "Most popular" to anchor pricing.
- **Free gift and BOGO tiers** — attach a free gift or a buy-X-get-Y bonus to any quantity-break tier. The widget previews the gift; it ships free at checkout via Cart Transform.
- **Embed code shortcodes** — copy a one-line HTML snippet from any bundle's edit page and paste it onto your homepage, blog post, custom Shopify page, or any page-builder element. The bundle renders inline anywhere your theme accepts HTML.
- **8 cart drawer integrations** — works with Slide Cart, Upcart, qikify, Monster Cart, AMP Slider Cart, Opus Cart, Releasit COD, and EasyCOD out of the box. After adding to cart, your drawer opens and updates without forcing a redirect.
- **Analytics dashboard** — track bundle revenue, conversion, and per-tier breakdown in real-time. Filter by date range and bundle.
- **No theme edits** — everything runs through Shopify's Theme App Extensions and Functions. Uninstall removes everything cleanly.

**Pricing:** Free plan covers your first 50 orders. Paid plans start at $19/month. 7-day free trial on every paid plan. See the in-app Billing page for full details.

**Support:** Live chat on our support page, plus email support@deepseatools.in. We respond within 2 hours during business hours.

## Key features (bulleted, used in listing sidebar)

- Frequently-bought-together bundle widgets — no theme edits
- Mix-and-match: customers pick N items from a collection
- Quantity breaks with "Most popular" badge and free-gift / BOGO tiers
- Embed-code shortcodes for homepage, blog, page builders
- Auto-integrates with 8 popular cart drawers
- Real-time revenue analytics dashboard
- 11-language widget (matches your storefront locale)
- Cloudflare-hosted: <30KB gzipped storefront JS, zero CLS

## Pricing summary

| Plan | Price/mo | Orders included | Overage |
|---|---|---|---|
| Free | $0 | 50 (lifetime) | n/a — must upgrade |
| Starter | $19 | 300 / month | $0.05 / order |
| Growth | $49 | 1,000 / month | $0.05 / order |
| Unlimited | $99 | 3,000 / month | $0.05 / order |

7-day free trial on Starter, Growth, Unlimited.

## Categories

- Bundles & upsells
- Discounts

## URLs

- App URL: `https://bundler.deepseatools.in`
- Privacy policy: `https://bundler.deepseatools.in/privacy`
- Support: `https://bundler.deepseatools.in/support`
- Demo store URL: _to fill in once a demo store is set up_
- Demo video URL: _to fill in once recorded_

## Screenshots needed (manual, post-launch)

Capture from a real prod-deployed store with sample data. Required by Shopify (1280×800 minimum, max 6):

1. **Dashboard** — KPI cards (revenue, AOV, conversions) + activity chart over 30 days
2. **Bundle list** — IndexTable with 3-5 sample bundles in mixed states (active/draft)
3. **Bundle create wizard** — products picked, discount section visible, preview pane on the right
4. **Storefront widget on PDP** — bundle widget rendered on a real product page in a clean theme
5. **Embed-code shortcode rendering** — bundle widget rendered on a custom Shopify page (paste-the-snippet flow)
6. **Quantity break with tiers** — QB widget on a PDP showing 3 tiers with "Most popular" badge

## Demo video script (manual, post-launch)

90 seconds, screen recording with voiceover. Beats:

- 0:00–0:10 — Title card. "Product Bundler — Bundles, Quantity Breaks, Free Gifts"
- 0:10–0:25 — Show empty Bundles list, click Create bundle, pick 2 products, set 10% off, save.
- 0:25–0:45 — Switch to storefront, navigate to one of the bundle products, scroll down, point at the widget. Click Add bundle to cart, drawer opens.
- 0:45–1:05 — Back to admin, copy the embed code from the bundle edit page. Paste into a custom Shopify page. Reload that page. Bundle renders.
- 1:05–1:25 — Open Quantity Breaks tab. Show a 3-tier QB with free gift on tier 3. Switch to storefront PDP, point at the QB widget with tier badges and gift preview.
- 1:25–1:30 — Closing card. URL + tagline.

## Submission checklist

- [ ] Privacy policy URL filled in (Tasks 2 above complete)
- [ ] Support URL filled in (Task 3 above complete)
- [ ] Demo store URL filled in (manual)
- [ ] Demo video URL filled in (manual)
- [ ] Screenshots uploaded (manual, see list above)
- [ ] Description copy reviewed for tone & accuracy
- [ ] Keywords selected (max 5): "bundles", "quantity breaks", "BOGO", "upsell", "discounts"
- [ ] Submission tested in Partner Dashboard preview before clicking Submit
```

- [ ] **Step 3: Commit**

```bash
git add docs/listing/2026-05-08-app-store-listing-copy.md
git commit -m "docs(phase-8g): add App Store listing copy draft + screenshot/video scripts"
```

---

## Task 7: Final sweep + manual smoke checklist

**Files:** None directly (verification + spec append)

- [ ] **Step 1: Run full admin test suite**

Run: `cd apps/admin && pnpm vitest run`
Expected: PASS — 184 tests, no regression.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run build**

Run: `cd apps/admin && pnpm build`
Expected: PASS — Remix bundles compile without errors.

- [ ] **Step 4: Append manual smoke checklist to spec**

Append the following to `docs/superpowers/specs/2026-05-08-phase-8g-listing-assets-design.md` after the existing content (or as a new "11. Manual QA execution" section):

```markdown

---

## 11. Manual QA execution log

To be completed post-deploy:

- [ ] Visit `https://bundler.deepseatools.in/privacy` in incognito → privacy policy renders, no Crisp widget visible, no console errors
- [ ] Visit `https://bundler.deepseatools.in/support` in incognito → support page + Crisp chat bubble appears in bottom-right within ~2s
- [ ] Click Crisp bubble on public support page → chat panel opens
- [ ] Send a test message via public support → message arrives in Crisp inbox (verify in Crisp dashboard)
- [ ] In Shopify admin, click **Support** in NavMenu → /app/support renders inside iframe
- [ ] Crisp bubble visible on /app/support → click → panel opens
- [ ] Send test message via embedded admin support → arrives in Crisp inbox
- [ ] If embedded admin Crisp fails (App Bridge / iframe conflict): remove `<CrispChat />` from `app.support.tsx`, redeploy. Public `/support` keeps chat. File this as a known limitation.

If any step fails, file a follow-up issue with reproduction details.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-08-phase-8g-listing-assets-design.md
git commit -m "docs(phase-8g): append manual QA execution checklist"
```

---

## Phase 8.G Done When

- All 7 tasks above checked off
- `cd apps/admin && pnpm vitest run` green (184 tests)
- `cd apps/admin && pnpm tsc --noEmit` green
- `cd apps/admin && pnpm build` green
- 5 new files committed; `app.tsx` NavMenu has Support link

Manual QA from spec §11 runs after the production deploy. Screenshots and demo video remain manual gates documented in the listing copy doc — not blocking this phase's code completion.
