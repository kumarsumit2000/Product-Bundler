import { Text, BlockStack } from "@shopify/polaris";
import type { LayoutVariant } from "../../drizzle/schema";

type Props = {
  value: LayoutVariant | "";
  onChange: (next: LayoutVariant) => void;
};

const listRow: React.CSSProperties = {
  display: "block",
  height: 14,
  margin: "0 6px 4px",
  background: "#cbd5e1",
  borderRadius: 3,
};
const cardCell: React.CSSProperties = {
  flex: 1,
  height: 50,
  background: "#cbd5e1",
  borderRadius: 4,
};
const gridCell: React.CSSProperties = {
  height: 18,
  background: "#cbd5e1",
  borderRadius: 3,
};
const compactRow: React.CSSProperties = {
  height: 6,
  background: "#cbd5e1",
  borderRadius: 2,
};

const PRESETS: Array<{ value: LayoutVariant; label: string; thumb: JSX.Element }> = [
  {
    value: "list",
    label: "List",
    thumb: (
      <>
        <span style={listRow} />
        <span style={listRow} />
        <span style={listRow} />
      </>
    ),
  },
  {
    value: "cards",
    label: "Cards",
    thumb: (
      <div style={{ display: "flex", gap: 4, padding: 6 }}>
        <span style={cardCell} />
        <span style={cardCell} />
        <span style={cardCell} />
      </div>
    ),
  },
  {
    value: "grid",
    label: "Grid",
    thumb: (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, padding: 6 }}>
        <span style={gridCell} />
        <span style={gridCell} />
        <span style={gridCell} />
        <span style={gridCell} />
        <span style={gridCell} />
        <span style={gridCell} />
      </div>
    ),
  },
  {
    value: "compact",
    label: "Compact",
    thumb: (
      <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: 6 }}>
        <span style={compactRow} />
        <span style={compactRow} />
        <span style={compactRow} />
        <span style={compactRow} />
        <span style={compactRow} />
      </div>
    ),
  },
];

export function LayoutPresetPicker({ value, onChange }: Props) {
  return (
    <BlockStack gap="200">
      <Text as="h4" variant="headingSm">Layout</Text>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 12,
        }}
      >
        {PRESETS.map((p) => {
          const selected = value === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              style={{
                display: "block",
                padding: 0,
                background: "transparent",
                border: `2px solid ${selected ? "#10b981" : "#d1d5db"}`,
                borderRadius: 8,
                cursor: "pointer",
                outline: "none",
                overflow: "hidden",
                width: "100%",
              }}
              aria-pressed={selected}
            >
              <div
                style={{
                  height: 80,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  background: "#f9fafb",
                  borderBottom: "1px solid #e5e7eb",
                  padding: 8,
                  gap: 4,
                }}
              >
                {p.thumb}
              </div>
              <div style={{ padding: "6px 8px", fontSize: 12, fontWeight: 500, color: "#374151", background: "#fff" }}>
                {p.label}
              </div>
            </button>
          );
        })}
      </div>
    </BlockStack>
  );
}
