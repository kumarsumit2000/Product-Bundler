import { TextField } from "@shopify/polaris";

type DiscountType = "percentage" | "flat" | "fixed_total";

type Props = {
  type: DiscountType;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  label?: string;
};

const SUFFIX: Record<DiscountType, string> = {
  percentage: "%",
  flat: "",
  fixed_total: "",
};

const PREFIX: Record<DiscountType, string> = {
  percentage: "",
  flat: "$",
  fixed_total: "$",
};

const HELP: Record<DiscountType, string> = {
  percentage: "Discount applied as a percentage of bundle subtotal",
  flat: "Fixed amount off the bundle subtotal",
  fixed_total: "Set the total bundle price (overrides individual prices)",
};

export function DiscountValueInput({
  type,
  value,
  onChange,
  error,
  label = "Discount value",
}: Props) {
  return (
    <TextField
      label={label}
      type="number"
      value={value}
      onChange={onChange}
      prefix={PREFIX[type] || undefined}
      suffix={SUFFIX[type] || undefined}
      helpText={HELP[type]}
      error={error}
      autoComplete="off"
      min={0}
      step={0.01}
    />
  );
}
