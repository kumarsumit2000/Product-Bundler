import type { Subscription } from "../../drizzle/schema";

const ALLOWED_INTERVALS: Subscription["interval"][] = ["weekly", "biweekly", "monthly", "quarterly"];

// Reads the `subscription` form field (a JSON string written by SubscriptionPanel)
// and returns a typed Subscription object or null. Out-of-range values for
// discount percent or interval are clamped to safe defaults.
export function parseSubscriptionForm(raw: FormDataEntryValue | null): Subscription | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const o = JSON.parse(raw) as { enabled?: unknown; discountPercent?: unknown; interval?: unknown };
    if (!o || !o.enabled) return null;
    const pct = Math.max(0, Math.min(50, Number(o.discountPercent) || 0));
    const intervalStr = String(o.interval ?? "monthly");
    const interval = (ALLOWED_INTERVALS.includes(intervalStr as Subscription["interval"])
      ? intervalStr
      : "monthly") as Subscription["interval"];
    return { enabled: true, discountPercent: pct, interval };
  } catch {
    return null;
  }
}
