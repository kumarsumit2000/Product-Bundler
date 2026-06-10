import { Card, Collapsible, Text, Icon } from "@shopify/polaris";
import { ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { useState, type ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  headerRight?: ReactNode;
  children: ReactNode;
};

export function CollapsibleSection({ title, subtitle, defaultOpen = false, headerRight, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const id = `section-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
        >
          <span>
            <Text as="h2" variant="headingMd">{title}</Text>
            {subtitle && <Text as="p" tone="subdued" variant="bodySm">{subtitle}</Text>}
          </span>
          <Icon source={open ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
        </button>
        {headerRight}
      </div>
      <Collapsible open={open} id={id} transition={{ duration: "150ms", timingFunction: "ease-in-out" }}>
        <div style={{ paddingTop: 16 }}>{children}</div>
      </Collapsible>
    </Card>
  );
}
