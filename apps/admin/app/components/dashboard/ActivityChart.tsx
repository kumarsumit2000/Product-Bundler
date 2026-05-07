import { Card, BlockStack, InlineStack, Text, Checkbox } from "@shopify/polaris";
import { LineChart } from "@shopify/polaris-viz";

type Props = {
  series: Array<{ date: string; count: number; perBundle: Record<string, number> }>;
  bundles: Array<{ id: string; name: string; widgetType: string }>;
  selectedBundleIds: string[];
  onChange: (ids: string[]) => void;
};

export function ActivityChart({ series, bundles, selectedBundleIds, onChange }: Props) {
  const allSelected = selectedBundleIds.length === 0 || selectedBundleIds.length === bundles.length;
  const toggleAll = () => onChange(allSelected ? [bundles[0]?.id ?? ""] : []);
  const toggleOne = (id: string) => {
    const set = new Set(selectedBundleIds.length === 0 ? bundles.map((b) => b.id) : selectedBundleIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = [...set];
    onChange(next.length === bundles.length ? [] : next);
  };

  const chartData = [{
    name: "Discounts applied",
    data: series.map((s) => ({ key: s.date, value: s.count })),
  }];

  if (series.length === 0 || series.every((s) => s.count === 0)) {
    return (
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingMd">Recent activity</Text>
          <Text as="p" tone="subdued">No data yet — keep your bundles live and check back tomorrow.</Text>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h3" variant="headingMd">Recent activity — Discounts applied</Text>
        <div style={{ height: 280 }}>
          <LineChart data={chartData} />
        </div>
        <BlockStack gap="100">
          <Text as="span" variant="bodySm" tone="subdued">Bundles</Text>
          <InlineStack gap="200" wrap>
            <Checkbox label="All" checked={allSelected} onChange={toggleAll} />
            {bundles.map((b) => (
              <Checkbox
                key={b.id}
                label={b.name}
                checked={allSelected || selectedBundleIds.includes(b.id)}
                onChange={() => toggleOne(b.id)}
              />
            ))}
          </InlineStack>
        </BlockStack>
      </BlockStack>
    </Card>
  );
}
