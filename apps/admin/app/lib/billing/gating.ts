import type { UsageSnapshot } from "~/lib/billing/usage";

export type GateResult =
  | { allowed: true }
  | { allowed: false; reason: string; upgradeUrl: string };

export function canCreateNew(usage: UsageSnapshot): GateResult {
  if (usage.plan === "free" && usage.lifetimeOrderCount >= 50) {
    return {
      allowed: false,
      reason: "Free plan allows up to 50 orders. Upgrade to create more bundles or quantity breaks.",
      upgradeUrl: "/app/billing",
    };
  }
  return { allowed: true };
}
