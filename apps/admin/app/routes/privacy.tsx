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
