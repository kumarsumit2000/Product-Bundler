import type { SubscriptionConfig, SellingPlanGroup, SellingPlanAllocation } from "./types";
import { formatMoney } from "./format";

export type PurchaseSelection = { mode: "onetime" | "subscribe"; sellingPlanId: string | null };
export type PurchaseOptionsCtx = {
  groups: SellingPlanGroup[];
  allocations: SellingPlanAllocation[];
  oneTimePriceCents: number;
  currency: string;
  locale: string;
};
export type PurchaseOptions = { active: boolean; getSelection: () => PurchaseSelection };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// Renders a One-time / Subscribe toggle from existing selling plans. If the
// product has no selling plans, renders nothing and reports active=false so the
// host widget falls back to one-time only.
export function createPurchaseOptions(mount: HTMLElement, cfg: SubscriptionConfig, ctx: PurchaseOptionsCtx): PurchaseOptions {
  const plans = ctx.groups.flatMap((g) => g.plans);
  if (!cfg.enabled || plans.length === 0 || ctx.allocations.length === 0) {
    return { active: false, getSelection: () => ({ mode: "onetime", sellingPlanId: null }) };
  }
  let selectedPlanId = plans[0]!.id;
  let mode: PurchaseSelection["mode"] = "onetime";

  const subPrice = (planId: string) => ctx.allocations.find((a) => a.planId === planId)?.priceCents ?? ctx.oneTimePriceCents;
  const discountLabel = (planId: string) => {
    const sp = subPrice(planId);
    if (!cfg.showDiscountLabel || sp >= ctx.oneTimePriceCents) return "";
    const pct = Math.round((1 - sp / ctx.oneTimePriceCents) * 100);
    return `<span class="pumper-po-save">Save ${pct}%</span>`;
  };

  const render = () => {
    const planOptions = plans.length > 1
      ? `<select class="pumper-po-plan">${plans.map((p) => `<option value="${esc(p.id)}"${p.id === selectedPlanId ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select>`
      : "";
    mount.innerHTML = `
      <div class="pumper-po pumper-po-${cfg.widgetStyle}">
        <div class="pumper-po-heading">${esc(cfg.heading)}</div>
        <label class="pumper-po-row" data-po-mode="onetime" aria-selected="${mode === "onetime"}">
          <input type="radio" name="pumper-po" ${mode === "onetime" ? "checked" : ""} />
          <span class="pumper-po-onetime">One-time purchase</span>
          <span class="pumper-po-price">${formatMoney(ctx.oneTimePriceCents, ctx.currency, ctx.locale)}</span>
        </label>
        <label class="pumper-po-row" data-po-mode="subscribe" aria-selected="${mode === "subscribe"}">
          <input type="radio" name="pumper-po" ${mode === "subscribe" ? "checked" : ""} />
          <span class="pumper-po-title">${esc(cfg.title)} ${discountLabel(selectedPlanId)}</span>
          <span class="pumper-po-subtitle">${esc(cfg.subtitle)}</span>
          <span class="pumper-po-price">${formatMoney(subPrice(selectedPlanId), ctx.currency, ctx.locale)}</span>
          ${mode === "subscribe" ? planOptions : ""}
          ${mode === "subscribe" && cfg.details ? `<span class="pumper-po-details">${esc(cfg.details)}</span>` : ""}
        </label>
      </div>`;
    mount.querySelector('[data-po-mode="onetime"]')!.addEventListener("click", () => { mode = "onetime"; render(); });
    mount.querySelector('[data-po-mode="subscribe"]')!.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("pumper-po-plan")) return;
      mode = "subscribe"; render();
    });
    const sel = mount.querySelector<HTMLSelectElement>(".pumper-po-plan");
    sel?.addEventListener("change", () => { selectedPlanId = sel.value; render(); });
  };
  render();

  return { active: true, getSelection: () => ({ mode, sellingPlanId: mode === "subscribe" ? selectedPlanId : null }) };
}
