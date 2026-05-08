import { Banner, Text } from "@shopify/polaris";
import { Link } from "@remix-run/react";
import type { UsageSnapshot } from "~/lib/billing/usage";

// resetAt is Date server-side but serialises to string (or null) over the Remix json() boundary.
type SerializedUsageSnapshot = Omit<UsageSnapshot, "resetAt"> & {
  resetAt: string | Date | null;
};

type Props = { usage: SerializedUsageSnapshot };

export function UsageBanner({ usage }: Props) {
  if (usage.percentUsed < 80) return null;

  if (usage.plan === "free" && usage.percentUsed >= 100) {
    return (
      <Banner tone="critical" title="You've hit your free plan limit">
        <Text as="p">
          You've used all {usage.orderCap} orders included in the free plan. Upgrade to keep creating
          new bundles and quantity breaks.{" "}
          <Link to="/app/billing">Upgrade now</Link>
        </Text>
      </Banner>
    );
  }

  if (usage.percentUsed >= 100) {
    return (
      <Banner tone="warning" title="You're past your monthly cap — overage charges active">
        <Text as="p">
          Each order over your {usage.orderCap}-order cap is billed at $0.05.{" "}
          <Link to="/app/billing">View plans</Link>
        </Text>
      </Banner>
    );
  }

  // 80% – 99%
  return (
    <Banner tone="warning" title="You've used 80% of your monthly orders">
      <Text as="p">
        You've used {usage.percentUsed}% of your {usage.orderCap}-order plan.{" "}
        <Link to="/app/billing">View plans</Link>
      </Text>
    </Banner>
  );
}
