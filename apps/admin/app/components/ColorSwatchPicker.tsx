import { useId, useRef } from "react";
import { Text, BlockStack } from "@shopify/polaris";

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

// Visual color picker: a circular swatch + a small chevron, with the native
// color picker triggered by clicking the swatch. The hex value is hidden on
// the surface UI (matches the screenshot reference). Empty value renders as
// a checkered "no value" swatch — meaning "inherit shop default".
export function ColorSwatchPicker({ label, value, onChange, placeholder }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const isEmpty = !value;
  const display = value || placeholder || "#000000";

  return (
    <BlockStack gap="100">
      <label htmlFor={inputId}>
        <Text as="span" variant="bodySm">{label}</Text>
      </label>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid var(--p-color-border, #d1d5db)",
          borderRadius: 8,
          padding: "6px 10px",
          background: "var(--p-color-bg-surface, #fff)",
          cursor: "pointer",
          width: "100%",
          minWidth: 0,
        }}
        onClick={() => inputRef.current?.click()}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: isEmpty
              ? "conic-gradient(#fff 0 25%, #ddd 0 50%, #fff 0 75%, #ddd 0)"
              : display,
            backgroundSize: isEmpty ? "12px 12px" : undefined,
            border: "1px solid rgba(0,0,0,0.15)",
            flexShrink: 0,
          }}
        />
        <span
          aria-hidden="true"
          style={{ marginLeft: "auto", color: "#888", fontSize: 14, lineHeight: 1 }}
        >
          ⌄
        </span>
        <input
          id={inputId}
          ref={inputRef}
          type="color"
          value={isEmpty ? "#000000" : display}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          style={{
            position: "absolute",
            left: -9999,
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
          aria-label={label}
        />
      </div>
    </BlockStack>
  );
}
