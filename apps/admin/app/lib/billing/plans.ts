export type PlanId = "free" | "starter" | "growth" | "unlimited";

export type Plan = {
  id: PlanId;
  name: string;
  priceCents: number;
  orderCap: number;
  isLifetimeCap: boolean;
  overageCents: number;
  trialDays: number;
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceCents: 0,
    orderCap: 50,
    isLifetimeCap: true,
    overageCents: 0,
    trialDays: 0,
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceCents: 1900,
    orderCap: 300,
    isLifetimeCap: false,
    overageCents: 5,
    trialDays: 7,
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceCents: 4900,
    orderCap: 1000,
    isLifetimeCap: false,
    overageCents: 5,
    trialDays: 7,
  },
  unlimited: {
    id: "unlimited",
    name: "Unlimited",
    priceCents: 9900,
    orderCap: 3000,
    isLifetimeCap: false,
    overageCents: 5,
    trialDays: 7,
  },
};

const VALID_IDS: ReadonlySet<string> = new Set(Object.keys(PLANS));

export function getPlan(id: string): Plan {
  if (!VALID_IDS.has(id)) {
    throw new Error(`Unknown plan id: ${id}`);
  }
  return PLANS[id as PlanId];
}

export function isPaidPlan(id: PlanId): boolean {
  return id !== "free";
}
