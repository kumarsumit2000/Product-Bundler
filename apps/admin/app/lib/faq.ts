// Shared FAQ data for both the public /support page and the embedded
// /app/support page. Keep answers short (2–3 sentences) and merchant-facing.
// Group by category so the support pages can render section headings.

export type FaqItem = { q: string; a: string };
export type FaqSection = { heading: string; items: FaqItem[] };

export const FAQ_SECTIONS: FaqSection[] = [
  {
    heading: "Getting started",
    items: [
      {
        q: "How do I install Product Bundler?",
        a: "Visit the Shopify App Store listing and click Install. Approve the permissions. The app then opens inside your Shopify Admin under Apps → Product Bundler.",
      },
      {
        q: "How do I create my first bundle?",
        a: "From the Bundles tab, click Create bundle. Pick 2 or more products, set the discount (percentage, flat amount, or fixed total price), and click Save. The widget appears automatically on each member product's PDP.",
      },
      {
        q: "What's the difference between Classic and Mix & Match bundles?",
        a: "Classic: you choose specific products, customer buys exactly that combo to get the discount. Mix & Match: customer picks any N products from a collection — useful for 'buy any 3 candles, save 15%'.",
      },
      {
        q: "How are quantity breaks different from bundles?",
        a: "Bundles cross-sell different products. Quantity breaks reward buying more of the same product — e.g. 1 = $20, 2 = $18 each, 3 = $15 each. Each tier can include a free gift or BOGO.",
      },
    ],
  },
  {
    heading: "Display & widget",
    items: [
      {
        q: "Why isn't my bundle showing on the product page?",
        a: "Two common reasons: (1) the bundle is in Draft — flip it to Active on the edit page. (2) Our App Embed isn't enabled in your theme — open Theme editor → App embeds → toggle on \"Bundler App Embed\".",
      },
      {
        q: "How do I show a bundle on my homepage or a blog post?",
        a: "On the bundle's edit page, copy the Embed code shown in the right-hand card. Paste it into any HTML block — Shopify pages, blog posts, GemPages/PageFly Custom HTML, or theme Liquid.",
      },
      {
        q: "Can I customize colors and text per bundle?",
        a: "Yes. On any bundle or quantity break edit page, scroll to the Style & Text card. Override primary/text/background colors, border radius, headline, CTA, and curated badge labels. Empty fields inherit shop defaults.",
      },
      {
        q: "Does the widget work with my cart drawer?",
        a: "Yes — we auto-detect the 8 most popular drawers (Slide Cart, Upcart, qikify, Monster Cart, AMP Slider Cart, Opus Cart, Releasit COD, EasyCOD) and re-render when the drawer opens. If yours isn't supported, send us the drawer's name via chat.",
      },
      {
        q: "How fast does the widget load?",
        a: "Under 30KB gzipped, async-loaded after page paint, zero CLS (we reserve space upfront). On a typical PDP, render is under 200ms.",
      },
    ],
  },
  {
    heading: "Discounts",
    items: [
      {
        q: "Are bundle discounts combinable with my other Shopify discounts?",
        a: "Yes — toggle \"Combinable with other discounts\" on the bundle/QB edit page. When on, our discount stacks with order-level and shipping discounts. When off, our discount applies exclusively.",
      },
      {
        q: "How does the discount actually apply?",
        a: "We use a Shopify Discount Function (no Draft Orders, no Script Editor). The price update happens server-side at checkout, so totals stay accurate across cart, checkout, Shop Pay, and order receipts.",
      },
      {
        q: "Free gift and BOGO — how do these work?",
        a: "On any quantity break tier, attach a Free Gift variant (added at $0 when the tier qualifies) or pick a BOGO mode (add same / add different / nth-item-free). The Cart Transform Function adds the bonus line item automatically.",
      },
      {
        q: "What happens if a bundle product goes out of stock?",
        a: "The widget hides the bundle on the PDP and the Discount Function refuses to apply, so customers can't add an out-of-stock combo to cart.",
      },
    ],
  },
  {
    heading: "Analytics & billing",
    items: [
      {
        q: "What's tracked on the dashboard?",
        a: "Bundle/QB-attributed revenue, order count, top performing bundles, and conversion rate (impressions → adds → purchases). Updated within ~5 minutes of an order via the orders/paid webhook.",
      },
      {
        q: "How do plan limits work?",
        a: "Free: 50 lifetime orders attributed to bundles. Starter / Growth / Unlimited: monthly cap that resets every 30 days. We never disable the widget when you exceed the cap — you just can't create new bundles until you upgrade.",
      },
      {
        q: "How do I switch billing plans?",
        a: "Open the Billing tab. Pick a plan card and click Upgrade or Downgrade. Approve the charge in Shopify if upgrading. Downgrades take effect at the end of your current billing cycle.",
      },
      {
        q: "Will I be charged during my free trial?",
        a: "No. Every paid plan includes a 7-day trial. Shopify only charges your account after the trial ends, and you can cancel any time before that.",
      },
    ],
  },
  {
    heading: "Privacy & data",
    items: [
      {
        q: "What data do you collect?",
        a: "Shop domain, currency, locale, your bundle/QB definitions, and aggregated revenue counts. No customer PII, no payment info, no browsing history.",
      },
      {
        q: "Are you GDPR-compliant?",
        a: "Yes. We honor Shopify's customers/redact, customers/data-request, and shop/redact webhooks within Shopify's 5-day SLA. See the privacy policy at /privacy for full detail.",
      },
      {
        q: "Where is my data stored?",
        a: "Cloudflare D1 (SQLite) and Cloudflare KV, hosted in Cloudflare's global network. Access tokens are encrypted at rest with AES-GCM. We never log them.",
      },
    ],
  },
  {
    heading: "Troubleshooting",
    items: [
      {
        q: "Discount isn't applying at checkout — what now?",
        a: "Confirm the bundle is Active and \"Combinable\" matches your stacking rules. Then check Settings → Apps → Bundler → Discounts in Shopify Admin — make sure both Bundler discount nodes show up.",
      },
      {
        q: "Widget shows on PDP but I don't see images / titles",
        a: "Open the bundle's edit page and re-save. We refresh the cached product data on save. If it still happens, ping support — we'll check the API token health.",
      },
      {
        q: "I changed my plan but it's still showing the old one",
        a: "Plan changes flow in via the app_subscriptions/update webhook and may take a minute. Reload the Billing tab — if it's still wrong after 2 minutes, contact us with your shop domain.",
      },
      {
        q: "How do I uninstall the app?",
        a: "Shopify Admin → Settings → Apps and sales channels → Product Bundler → Uninstall. We keep your configuration for 30 days so a reinstall picks up where you left off, then permanently delete it.",
      },
    ],
  },
];

// Flat list for environments that don't need section headings.
export const FAQ_FLAT: FaqItem[] = FAQ_SECTIONS.flatMap((s) => s.items);
