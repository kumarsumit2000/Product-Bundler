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
