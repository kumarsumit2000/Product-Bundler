import { Select } from "@shopify/polaris";

export type DateRangeValue = "7d" | "30d" | "90d";

type Props = {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
};

const OPTIONS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
];

export function DateRangePicker({ value, onChange }: Props) {
  return (
    <div style={{ width: 180 }}>
      <Select
        label="Date range"
        labelHidden
        options={OPTIONS}
        value={value}
        onChange={(v) => onChange(v as DateRangeValue)}
      />
    </div>
  );
}
