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
