import { Card, BlockStack, Text, Grid } from "@shopify/polaris";
import { LineChart } from "@shopify/polaris-viz";

type Props = {
  conversions: Array<{ date: string; bundleOrders: number; qbOrders: number }>;
  sales: Array<{ date: string; bundleCents: number; qbCents: number }>;
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

export function ConversionsSalesPair({ conversions, sales, currency, locale }: Props) {
  const conversionData = [
    { name: "Bundles", data: conversions.map((c) => ({ key: c.date, value: c.bundleOrders })) },
    { name: "Quantity Breaks", data: conversions.map((c) => ({ key: c.date, value: c.qbOrders })) },
  ];
  const salesData = [
    { name: "Bundles", data: sales.map((c) => ({ key: c.date, value: c.bundleCents / 100 })) },
    { name: "Quantity Breaks", data: sales.map((c) => ({ key: c.date, value: c.qbCents / 100 })) },
  ];

  const totalConversions = conversions.reduce((s, c) => s + c.bundleOrders + c.qbOrders, 0);
  const totalSalesCents = sales.reduce((s, c) => s + c.bundleCents + c.qbCents, 0);

  return (
    <Grid>
      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">Conversions over time</Text>
            <div style={{ height: 240 }}>
              <LineChart data={conversionData} />
            </div>
            <Text as="p" variant="bodySm" tone="subdued">
              Total: {totalConversions} orders
            </Text>
          </BlockStack>
        </Card>
      </Grid.Cell>
      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">Sales over time</Text>
            <div style={{ height: 240 }}>
              <LineChart data={salesData} />
            </div>
            <Text as="p" variant="bodySm" tone="subdued">
              Total: {formatMoney(totalSalesCents, currency, locale)}
            </Text>
          </BlockStack>
        </Card>
      </Grid.Cell>
    </Grid>
  );
}
