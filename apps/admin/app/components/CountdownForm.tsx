import { useState, useEffect } from "react";
import { Form, useSubmit } from "@remix-run/react";
import {
  BlockStack, Card, FormLayout, TextField, Select, Button, Text, InlineStack, Banner,
} from "@shopify/polaris";
import { ColorSwatchPicker } from "./ColorSwatchPicker";

export type CountdownFormValues = {
  name: string;
  status: "draft" | "active" | "paused";
  endAtIso: string;
  headline: string;
  expiredHeadline: string;
  layout: "inline" | "bar";
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  borderColor: string;
  borderRadius: string;
  textAlign: "left" | "center" | "right";
};

const DEFAULTS: CountdownFormValues = {
  name: "",
  status: "draft",
  endAtIso: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  headline: "Sale ends in",
  expiredHeadline: "This deal has ended",
  layout: "inline",
  backgroundColor: "",
  textColor: "",
  accentColor: "",
  borderColor: "",
  borderRadius: "",
  textAlign: "center",
};

type Props = {
  submitLabel: string;
  initialValues?: Partial<CountdownFormValues>;
  errors?: Record<string, string>;
  onValuesChange?: (v: CountdownFormValues) => void;
};

export function CountdownForm({ submitLabel, initialValues, errors, onValuesChange }: Props) {
  const submit = useSubmit();
  const [values, setValues] = useState<CountdownFormValues>({ ...DEFAULTS, ...initialValues });
  useEffect(() => { onValuesChange?.(values); }, [values, onValuesChange]);
  const set = <K extends keyof CountdownFormValues>(k: K, v: CountdownFormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("name", values.name);
    fd.set("status", values.status);
    fd.set("endAtIso", values.endAtIso);
    fd.set("headline", values.headline);
    fd.set("expiredHeadline", values.expiredHeadline);
    fd.set("layout", values.layout);
    const styles: Record<string, unknown> = {};
    if (values.backgroundColor) styles.backgroundColor = values.backgroundColor;
    if (values.textColor) styles.textColor = values.textColor;
    if (values.accentColor) styles.accentColor = values.accentColor;
    if (values.borderColor) styles.borderColor = values.borderColor;
    if (values.borderRadius) {
      const n = parseInt(values.borderRadius, 10);
      if (Number.isFinite(n)) styles.borderRadius = n;
    }
    if (values.textAlign && values.textAlign !== "center") styles.textAlign = values.textAlign;
    fd.set("styleOverrides", JSON.stringify(styles));
    submit(fd, { method: "post" });
  };

  return (
    <Form onSubmit={handleSubmit}>
      <BlockStack gap="400">
        {errors?._form && <Banner tone="critical">{errors._form}</Banner>}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Details</Text>
            <FormLayout>
              <TextField
                label="Name"
                value={values.name}
                onChange={(name) => set("name", name)}
                autoComplete="off"
                error={errors?.name}
              />
              <TextField
                label="Ends at"
                type="datetime-local"
                value={values.endAtIso}
                onChange={(endAtIso) => set("endAtIso", endAtIso)}
                autoComplete="off"
                error={errors?.endAtIso}
                helpText="Local time — converted to UTC on save"
              />
              <FormLayout.Group>
                <TextField
                  label="Headline"
                  value={values.headline}
                  onChange={(headline) => set("headline", headline)}
                  autoComplete="off"
                  placeholder="Sale ends in"
                />
                <TextField
                  label="Expired headline"
                  value={values.expiredHeadline}
                  onChange={(expiredHeadline) => set("expiredHeadline", expiredHeadline)}
                  autoComplete="off"
                  placeholder="This deal has ended"
                />
              </FormLayout.Group>
              <Select
                label="Layout"
                options={[
                  { label: "Inline (in a section)", value: "inline" },
                  { label: "Top bar (full width)", value: "bar" },
                ]}
                value={values.layout}
                onChange={(layout) => set("layout", layout as "inline" | "bar")}
              />
              <Select
                label="Status"
                options={[
                  { label: "Draft", value: "draft" },
                  { label: "Active", value: "active" },
                  { label: "Paused", value: "paused" },
                ]}
                value={values.status}
                onChange={(status) => set("status", status as CountdownFormValues["status"])}
              />
            </FormLayout>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Appearance</Text>
            <FormLayout>
              <FormLayout.Group>
                <ColorSwatchPicker
                  label="Background"
                  value={values.backgroundColor}
                  onChange={(backgroundColor) => set("backgroundColor", backgroundColor)}
                  placeholder="#1A1A1A"
                />
                <ColorSwatchPicker
                  label="Text"
                  value={values.textColor}
                  onChange={(textColor) => set("textColor", textColor)}
                  placeholder="#FFFFFF"
                />
                <ColorSwatchPicker
                  label="Digits accent"
                  value={values.accentColor}
                  onChange={(accentColor) => set("accentColor", accentColor)}
                  placeholder="#D9263A"
                />
              </FormLayout.Group>
              <FormLayout.Group>
                <ColorSwatchPicker
                  label="Border"
                  value={values.borderColor}
                  onChange={(borderColor) => set("borderColor", borderColor)}
                  placeholder="Transparent"
                />
                <TextField
                  label="Border radius (px)"
                  type="number"
                  value={values.borderRadius}
                  onChange={(borderRadius) => set("borderRadius", borderRadius)}
                  autoComplete="off"
                  min={0}
                  max={48}
                  placeholder="6"
                />
                <Select
                  label="Text alignment"
                  options={[
                    { label: "Left", value: "left" },
                    { label: "Center", value: "center" },
                    { label: "Right", value: "right" },
                  ]}
                  value={values.textAlign}
                  onChange={(textAlign) => set("textAlign", textAlign as "left" | "center" | "right")}
                />
              </FormLayout.Group>
            </FormLayout>
          </BlockStack>
        </Card>

        <InlineStack align="end">
          <Button submit variant="primary" size="large">{submitLabel}</Button>
        </InlineStack>
      </BlockStack>
    </Form>
  );
}
