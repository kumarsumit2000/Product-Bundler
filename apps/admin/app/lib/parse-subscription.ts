import type { SubscriptionConfig } from "../../drizzle/schema";

export const EMPTY_SUBSCRIPTION: SubscriptionConfig = {
  enabled: false,
  heading: "Purchase Options",
  title: "Subscribe & Save",
  subtitle: "Cancel anytime",
  details: "Enjoy flexible billing & discounts",
  widgetStyle: "modern",
  showDiscountLabel: true,
  hideThirdPartyWidget: false,
};

const STYLES: SubscriptionConfig["widgetStyle"][] = ["modern", "classic"];

// Reads the `subscription` form field (JSON written by SubscriptionPanel) and
// returns a typed SubscriptionConfig or null. Unknown/missing fields fall back
// to EMPTY_SUBSCRIPTION; malformed JSON returns null.
export function parseSubscriptionForm(raw: FormDataEntryValue | null): SubscriptionConfig | null {
  if (raw == null || raw === "" || raw === "null") return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(String(raw));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const str = (k: keyof SubscriptionConfig) =>
    typeof obj[k] === "string" ? (obj[k] as string) : (EMPTY_SUBSCRIPTION[k] as string);
  const bool = (k: keyof SubscriptionConfig) =>
    typeof obj[k] === "boolean" ? (obj[k] as boolean) : (EMPTY_SUBSCRIPTION[k] as boolean);
  return {
    enabled: bool("enabled"),
    heading: str("heading"),
    title: str("title"),
    subtitle: str("subtitle"),
    details: str("details"),
    widgetStyle: STYLES.includes(obj.widgetStyle as never) ? (obj.widgetStyle as SubscriptionConfig["widgetStyle"]) : "modern",
    showDiscountLabel: bool("showDiscountLabel"),
    hideThirdPartyWidget: bool("hideThirdPartyWidget"),
  };
}
