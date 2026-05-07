import { Card, BlockStack, Text, DataTable } from "@shopify/polaris";

type Props = {
  rows: Array<{
    bundleId: string;
    widgetType: string;
    name: string;
    revenueCents: number;
    orders: number;
    applicationCount: number;
    conversionRate: number;
  }>;
  currency: string;
  locale: string;
};

function formatMoney(cents: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function TopBundlesTable({ rows, currency, locale }: Props) {
  if (rows.length === 0) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h3" variant="headingMd">Top bundles</Text>
          <Text as="p" tone="subdued">No bundles have generated revenue yet.</Text>
        </BlockStack>
      </Card>
    );
  }

  const tableRows = rows.map((r) => [
    r.name,
    r.widgetType,
    formatMoney(r.revenueCents, currency, locale),
    String(r.orders),
    String(r.applicationCount),
    `${(r.conversionRate * 100).toFixed(1)}%`,
  ]);

  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingMd">Top bundles</Text>
        <DataTable
          columnContentTypes={["text", "text", "numeric", "numeric", "numeric", "numeric"]}
          headings={["Name", "Type", "Revenue", "Orders", "Applied", "Conv. rate"]}
          rows={tableRows}
        />
      </BlockStack>
    </Card>
  );
}
