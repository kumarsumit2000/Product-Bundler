import { Card, BlockStack, Text, DataTable } from "@shopify/polaris";

type Props = {
  rows: Array<{
    qbId: string;
    qbName: string;
    tiers: Array<{ qty: number; addCount: number; estimatedRevenueCents: number }>;
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

export function QbTierBreakdownTable({ rows, currency, locale }: Props) {
  if (rows.length === 0) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h3" variant="headingMd">Quantity break tier breakdown</Text>
          <Text as="p" tone="subdued">No QB add-to-cart events captured yet.</Text>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h3" variant="headingMd">Quantity break tier breakdown</Text>
        {rows.map((qb) => (
          <BlockStack gap="200" key={qb.qbId}>
            <Text as="h4" variant="headingSm">{qb.qbName}</Text>
            <DataTable
              columnContentTypes={["text", "numeric", "numeric"]}
              headings={["Tier", "Adds", "Est. revenue"]}
              rows={qb.tiers
                .sort((a, b) => a.qty - b.qty)
                .map((t) => [
                  `Tier ${t.qty} (qty ${t.qty})`,
                  String(t.addCount),
                  formatMoney(t.estimatedRevenueCents, currency, locale),
                ])}
            />
          </BlockStack>
        ))}
      </BlockStack>
    </Card>
  );
}
