import { useId } from "react";
import { Text, BlockStack } from "@shopify/polaris";

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

// Visual color picker: a circular swatch with a transparent native
// <input type=color> overlaid on top so clicks open the OS color
// picker without needing JS dispatching. A small × button clears the
// override (back to "inherit shop default" — empty string).
export function ColorSwatchPicker({ label, value, onChange, placeholder }: Props) {
  const inputId = useId();
  const isEmpty = !value;
  const display = value || placeholder || "#000000";

  return (
    <BlockStack gap="100">
      <label htmlFor={inputId}>
        <Text as="span" variant="bodySm">{label}</Text>
      </label>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid #d1d5db",
          borderRadius: 8,
          padding: "6px 10px",
          background: "#fff",
          width: "100%",
          minWidth: 0,
        }}
      >
        {/* Visible swatch */}
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
            pointerEvents: "none",
          }}
        />
        {/* Hex value display, non-interactive */}
        <span
          style={{
            fontSize: 12,
            color: isEmpty ? "#9ca3af" : "#374151",
            fontFamily: "ui-monospace, monospace",
            pointerEvents: "none",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {isEmpty ? "Default" : value}
        </span>
        {/* Clear button (only when a value is set). Has its own z-index so it
            sits above the transparent native picker overlay. */}
        {!isEmpty && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            style={{
              position: "relative",
              zIndex: 2,
              border: "none",
              background: "transparent",
              color: "#6b7280",
              cursor: "pointer",
              padding: "0 4px",
              fontSize: 14,
              lineHeight: 1,
            }}
            aria-label={`Clear ${label}`}
            title="Reset to default"
          >
            ×
          </button>
        )}
        {/* Transparent native picker covering the whole row — clicking
            anywhere on the swatch row opens the OS color chooser. */}
        <input
          id={inputId}
          type="color"
          value={isEmpty ? "#000000" : display}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            cursor: "pointer",
            border: "none",
            padding: 0,
            background: "transparent",
            zIndex: 1,
          }}
          aria-label={label}
        />
      </div>
    </BlockStack>
  );
}
