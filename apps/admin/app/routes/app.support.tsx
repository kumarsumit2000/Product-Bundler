import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Page, Card, BlockStack, Text, Link as PolarisLink } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { FAQ_SECTIONS } from "~/lib/faq";

// Crisp chat is mounted once at the app.tsx layout level so the bubble shows
// on every admin page, including this one — no per-route mount needed.

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
  return json({});
}

export default function SupportPage() {
  return (
    <Page title="Support">
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Frequently asked questions</Text>
            <Text as="p" tone="subdued">
              Browse the answers below, or click the chat bubble in the bottom-right
              to talk with us live. Average response time: under 2 hours during
              business hours.
            </Text>
          </BlockStack>
        </Card>

        {FAQ_SECTIONS.map((section) => (
          <BlockStack key={section.heading} gap="200">
            <Text as="h3" variant="headingSm" tone="subdued">
              {section.heading.toUpperCase()}
            </Text>
            {section.items.map((item) => (
              <Card key={item.q}>
                <BlockStack gap="200">
                  <Text as="h4" variant="headingMd">{item.q}</Text>
                  <Text as="p">{item.a}</Text>
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        ))}

        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingMd">Still need help?</Text>
            <Text as="p">
              Email{" "}
              <PolarisLink url="mailto:support@deepseatools.in">support@deepseatools.in</PolarisLink>
              {" "}or use the chat bubble in the bottom-right.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
