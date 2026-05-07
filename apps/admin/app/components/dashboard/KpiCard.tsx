import { Card, BlockStack, Text } from "@shopify/polaris";
import { SparkLineChart } from "@shopify/polaris-viz";

type SeriesPoint = { x: string; y: number };

type Props = {
  label: string;
  value: string;
  series: SeriesPoint[];
  changePct?: number;
};

export function KpiCard({ label, value, series, changePct }: Props) {
  const sparkData = [
    {
      name: label,
      data: series.map((p) => ({ key: p.x, value: p.y })),
    },
  ];
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="heading2xl">
          {value}
        </Text>
        {typeof changePct === "number" && (
          <Text
            as="span"
            variant="bodySm"
            tone={changePct >= 0 ? "success" : "critical"}
          >
            {changePct >= 0 ? "+" : ""}
            {(changePct * 100).toFixed(1)}% vs previous
          </Text>
        )}
        <div style={{ height: 60 }}>
          <SparkLineChart
            data={sparkData}
            accessibilityLabel={`${label} trend`}
          />
        </div>
      </BlockStack>
    </Card>
  );
}
