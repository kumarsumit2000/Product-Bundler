import { useEffect, useState } from "react";
import { Card, BlockStack, Text } from "@shopify/polaris";
import type { CountdownFormValues } from "./CountdownForm";

type Props = { values: CountdownFormValues };

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function diffParts(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(totalSec / 86400),
    h: Math.floor((totalSec % 86400) / 3600),
    m: Math.floor((totalSec % 3600) / 60),
    s: totalSec % 60,
  };
}

export function CountdownPreview({ values }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const endAt = values.endAtIso ? new Date(values.endAtIso).getTime() : NaN;
  const ms = Number.isFinite(endAt) ? endAt - now : 0;
  const expired = ms <= 0;
  const { d, h, m, s } = diffParts(ms);

  const bg = values.backgroundColor || "#1a1a1a";
  const text = values.textColor || "#ffffff";
  const accent = values.accentColor || "#d9263a";
  const border = values.borderColor || "transparent";
  const radius = parseInt(values.borderRadius || "6", 10) || 6;
  const align = values.textAlign || "center";
  const itemsAlign = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const isBar = values.layout === "bar";

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">Live preview</Text>
        <div
          style={{
            background: bg,
            color: text,
            border: `1px solid ${border}`,
            borderRadius: isBar ? 0 : radius,
            padding: isBar ? "12px 16px" : "10px 14px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            textAlign: align,
          }}
        >
          {expired ? (
            <div style={{ display: "flex", justifyContent: itemsAlign, fontStyle: "italic", opacity: 0.85 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{values.expiredHeadline || "This deal has ended"}</span>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: itemsAlign,
                gap: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{values.headline || "Sale ends in"}</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 8,
                  fontVariantNumeric: "tabular-nums" as const,
                }}
              >
                {d > 0 && (
                  <>
                    <Unit value={pad(d)} unit="d" accent={accent} />
                    <Sep accent={accent} />
                  </>
                )}
                <Unit value={pad(h)} unit="h" accent={accent} />
                <Sep accent={accent} />
                <Unit value={pad(m)} unit="m" accent={accent} />
                <Sep accent={accent} />
                <Unit value={pad(s)} unit="s" accent={accent} />
              </span>
            </div>
          )}
        </div>
        <Text as="p" tone="subdued" variant="bodySm">
          {expired
            ? "End date has passed — showing expired state"
            : `Counting down to ${new Date(endAt).toLocaleString()}`}
        </Text>
      </BlockStack>
    </Card>
  );
}

function Unit({ value, unit, accent }: { value: string; unit: string; accent: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 2 }}>
      <b style={{ fontSize: 18, fontWeight: 700, lineHeight: 1, color: accent }}>{value}</b>
      <i style={{ fontSize: 11, fontStyle: "normal", opacity: 0.8, fontWeight: 600 }}>{unit}</i>
    </span>
  );
}

function Sep({ accent }: { accent: string }) {
  return <span style={{ color: accent, fontWeight: 700, fontSize: 18, lineHeight: 1 }}>:</span>;
}
