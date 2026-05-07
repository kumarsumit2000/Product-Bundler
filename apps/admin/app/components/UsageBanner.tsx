import { Banner } from "@shopify/polaris";
import { Link } from "@remix-run/react";
import type { UsageSnapshot } from "~/lib/billing/usage";

type Props = { usage: UsageSnapshot };

export function UsageBanner({ usage }: Props) {
  if (usage.percentUsed < 80) return null;

  if (usage.plan === "free" && usage.percentUsed >= 100) {
    return (
      <Banner tone="critical" title="You've hit your free plan limit">
        <p>
          You've used all {usage.orderCap} orders included in the free plan. Upgrade to keep creating
          new bundles and quantity breaks.{" "}
          <Link to="/app/billing">Upgrade now</Link>
        </p>
      </Banner>
    );
  }

  if (usage.percentUsed >= 100) {
    return (
      <Banner tone="warning" title="You're past your monthly cap — overage charges active">
        <p>
          Each order over your {usage.orderCap}-order cap is billed at $0.05.{" "}
          <Link to="/app/billing">View plans</Link>
        </p>
      </Banner>
    );
  }

  // 80% – 99%
  return (
    <Banner tone="warning" title="You've used 80% of your monthly orders">
      <p>
        You've used {usage.percentUsed}% of your {usage.orderCap}-order plan.{" "}
        <Link to="/app/billing">View plans</Link>
      </p>
    </Banner>
  );
}
