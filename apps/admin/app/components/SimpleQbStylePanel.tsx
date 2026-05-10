import { BlockStack, Card, FormLayout, TextField, Text } from "@shopify/polaris";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { LayoutPresetPicker } from "./LayoutPresetPicker";
import type { StylePanelValues } from "./StylePanel";

type Props = {
  values: StylePanelValues;
  onChange: (patch: Partial<StylePanelValues>) => void;
};

// Slim style panel for Quantity Breaks — only the fields merchants actually
// use. The full StylePanel had ~36 fields; this exposes the 10 that matter
// (background, border, headings, button, badges, radius, padding).
export function SimpleQbStylePanel({ values, onChange }: Props) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Appearance</Text>
        <Text as="p" tone="subdued">Override layout, colors and shape. Leave any field blank to use defaults.</Text>
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
            <ColorSwatchPicker
              label="Background"
              value={values.cardsBg}
              onChange={(cardsBg) => onChange({ cardsBg })}
              placeholder="#FFFFFF"
            />
            <ColorSwatchPicker
              label="Border"
              value={values.borderColor}
              onChange={(borderColor) => onChange({ borderColor })}
              placeholder="#E5E7EB"
            />
          </FormLayout.Group>
          <FormLayout.Group>
            <ColorSwatchPicker
              label="Heading text"
              value={values.blockTitleColor}
              onChange={(blockTitleColor) => onChange({ blockTitleColor })}
              placeholder="#1A1A1A"
            />
            <ColorSwatchPicker
              label="Body text"
              value={values.subtitleColor}
              onChange={(subtitleColor) => onChange({ subtitleColor })}
              placeholder="#666666"
            />
          </FormLayout.Group>
          <FormLayout.Group>
            <ColorSwatchPicker
              label="Unselected tier bg"
              value={values.tierBg}
              onChange={(tierBg) => onChange({ tierBg })}
              placeholder="#FFFFFF"
            />
            <ColorSwatchPicker
              label="Selected tier bg"
              value={values.selectedBg}
              onChange={(selectedBg) => onChange({ selectedBg })}
              placeholder="#FFF7F8"
            />
          </FormLayout.Group>
          <ColorSwatchPicker
            label="Primary / button color"
            value={values.primaryColor}
            onChange={(primaryColor) => onChange({ primaryColor })}
            placeholder="#7B1E2A"
          />
          <FormLayout.Group>
            <ColorSwatchPicker
              label="Savings badge bg"
              value={values.badgeBg}
              onChange={(badgeBg) => onChange({ badgeBg })}
              placeholder="#FCE4E7"
            />
            <ColorSwatchPicker
              label="Savings badge text"
              value={values.badgeText}
              onChange={(badgeText) => onChange({ badgeText })}
              placeholder="#D9263A"
            />
          </FormLayout.Group>
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
          <Text as="h3" variant="headingSm">Font sizes</Text>
          <FormLayout.Group>
            <TextField
              label="Heading"
              type="number"
              value={values.blockTitleFontSize}
              onChange={(blockTitleFontSize) => onChange({ blockTitleFontSize })}
              autoComplete="off"
              min={10}
              max={48}
              placeholder="14"
              suffix="px"
            />
            <TextField
              label="Tier title"
              type="number"
              value={values.titleFontSize}
              onChange={(titleFontSize) => onChange({ titleFontSize })}
              autoComplete="off"
              min={10}
              max={48}
              placeholder="13"
              suffix="px"
            />
          </FormLayout.Group>
          <FormLayout.Group>
            <TextField
              label="Tier subtitle"
              type="number"
              value={values.subtitleFontSize}
              onChange={(subtitleFontSize) => onChange({ subtitleFontSize })}
              autoComplete="off"
              min={10}
              max={48}
              placeholder="11"
              suffix="px"
            />
            <TextField
              label="Savings badge"
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
          </FormLayout.Group>
        </FormLayout>
      </BlockStack>
    </Card>
  );
}
