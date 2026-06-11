import { BlockStack, Card, FormLayout, TextField, Text } from "@shopify/polaris";
import { LayoutPresetPicker } from "./LayoutPresetPicker";
import { StyleSections } from "./StyleSections";
import type { StylePanelValues } from "./StylePanel";
import { QB_PALETTES, applyPalette, mixHex } from "~/lib/qb-palettes";

type Props = {
  values: StylePanelValues;
  onChange: (patch: Partial<StylePanelValues>) => void;
};

// Full "Customize" panel for Quantity Breaks. The palette row + layout +
// radius/spacing live here; the complete grouped color set and per-element
// font controls are rendered via the shared StyleSections (same UI the bundle
// StylePanel uses), so every element color + font is editable.
export function SimpleQbStylePanel({ values, onChange }: Props) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Appearance</Text>
        <Text as="p" tone="subdued">Override layout, colors and shape. Leave any field blank to use defaults.</Text>
        <BlockStack gap="100">
          <Text as="span" variant="bodySm" tone="subdued">Color palettes</Text>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {QB_PALETTES.map((p) => {
              const active = values.primaryColor === p.accent;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-label={p.name}
                  title={p.name}
                  onClick={() => onChange(applyPalette(p.accent))}
                  style={{
                    width: 30, height: 30, borderRadius: 999, cursor: "pointer", padding: 0,
                    border: active ? "2px solid #1a1a1a" : "2px solid #e5e7eb",
                    boxShadow: active ? "0 0 0 2px #fff inset" : undefined,
                    background: `linear-gradient(135deg, ${p.accent} 0 50%, ${mixHex(p.accent, 88)} 50% 100%)`,
                  }}
                />
              );
            })}
          </div>
        </BlockStack>
        <BlockStack gap="200">
          <LayoutPresetPicker
            value={values.layoutVariant}
            onChange={(layoutVariant) => onChange({ layoutVariant })}
          />
          {values.layoutVariant === "grid" && (
            <TextField
              label="Items per row"
              type="number"
              value={values.gridColumns}
              onChange={(gridColumns) => onChange({ gridColumns })}
              autoComplete="off"
              min={1}
              max={6}
              placeholder="3"
            />
          )}
        </BlockStack>
        <FormLayout>
          <FormLayout.Group>
            <TextField
              label="Border radius (px)"
              type="number"
              value={values.borderRadius}
              onChange={(borderRadius) => onChange({ borderRadius })}
              autoComplete="off"
              min={0}
              max={48}
              placeholder="8"
            />
            <TextField
              label="Gap between tiers (px)"
              type="number"
              value={values.spacing}
              onChange={(spacing) => onChange({ spacing })}
              autoComplete="off"
              min={0}
              max={64}
              placeholder="6"
            />
          </FormLayout.Group>
          <TextField
            label="Savings badge font size"
            type="number"
            value={values.savingsFontSize}
            onChange={(savingsFontSize) => onChange({ savingsFontSize })}
            autoComplete="off"
            min={10}
            max={48}
            placeholder="11"
            suffix="px"
            helpText="Right-side pill"
          />
        </FormLayout>
        <StyleSections values={values} onChange={onChange} />
      </BlockStack>
    </Card>
  );
}
