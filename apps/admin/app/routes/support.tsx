import type { MetaFunction } from "@remix-run/cloudflare";
import { CrispChat } from "~/components/CrispChat";
import { FAQ_SECTIONS } from "~/lib/faq";

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
  h2.section { font-size: 14px; margin: 32px 0 8px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
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

        {FAQ_SECTIONS.map((section) => (
          <div key={section.heading}>
            <h2 className="section">{section.heading}</h2>
            {section.items.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        ))}

        <p className="footer">
          Still need help?{" "}
          <a href="mailto:support@deepseatools.in">support@deepseatools.in</a>
        </p>
      </main>
      <CrispChat websiteId={CRISP_WEBSITE_ID} />
    </>
  );
}
