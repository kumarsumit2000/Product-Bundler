import type { BundleConfig, WidgetConfig } from "./types";
import { addToCart } from "./add-to-cart";
import { emit } from "./analytics";
import { formatMoney } from "./format";
import { t } from "./i18n";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function renderMixMatch(mount: HTMLElement, bundle: BundleConfig, config: WidgetConfig): void {
  const target = bundle.targetQty ?? 3;
  const items = (bundle.collectionProducts ?? []).filter((p) => p.available);
  const totalAvailable = items.length;
  const heading = bundle.headline || t("mm.heading", {
    target,
    discount: bundle.discountType === "percentage"
      ? `${bundle.discountValue}%`
      : formatMoney(Math.round(bundle.discountValue * 100), config.settings.currency, config.settings.locale),
  });

  const allItems = bundle.collectionProducts ?? [];

  if (totalAvailable < target) {
    mount.innerHTML = `
      <section class="pumper-card pumper-mm">
        <h3 class="pumper-mm-heading">${escapeHtml(heading)}</h3>
        <p class="pumper-mm-empty">${t("mm.notEnoughStock")}</p>
      </section>
    `;
    return;
  }

  const selected = new Set<number>(); // indices in allItems

  const renderHeader = () => {
    return `
      <div class="pumper-mm-header">
        <h3 class="pumper-mm-heading">${escapeHtml(heading)}</h3>
        <span class="pumper-mm-counter">${t("mm.picked", { count: selected.size, target })}</span>
      </div>
    `;
  };

  const renderGrid = () => {
    const slice = allItems.slice(0, 6); // top 6 visible
    return slice.map((p, i) => {
      const isSel = selected.has(i);
      const dis = !p.available;
      const classes = [
        "pumper-mm-item",
        isSel ? "pumper-mm-item--selected" : "",
        dis ? "pumper-mm-item--unavailable" : "",
      ].filter(Boolean).join(" ");
      const img = p.image
        ? `<img src="${escapeHtml(p.image)}" alt="" class="pumper-mm-thumb" loading="lazy" />`
        : `<div class="pumper-mm-thumb pumper-thumb-empty"></div>`;
      const check = isSel ? `<span class="pumper-mm-check">✓</span>` : "";
      return `
        <div class="${classes}" data-action="toggle-mm-item" data-product-index="${i}" role="button" tabindex="0" ${dis ? 'aria-disabled="true"' : ""}>
          ${check}
          ${img}
          <div class="pumper-mm-item-title">${escapeHtml(p.title)}</div>
          <div class="pumper-mm-item-price">${formatMoney(p.priceCents, config.settings.currency, config.settings.locale)}</div>
        </div>
      `;
    }).join("");
  };

  const renderCta = () => {
    const ready = selected.size === target;
    const remaining = target - selected.size;
    const discountLabel = bundle.discountType === "percentage"
      ? `${bundle.discountValue}%`
      : formatMoney(Math.round(bundle.discountValue * 100), config.settings.currency, config.settings.locale);
    const label = ready
      ? t("mm.cta")
      : t("mm.ctaPickMore", { n: remaining, discount: discountLabel });
    return `<button class="pumper-cta" data-action="add-to-cart" ${ready ? "" : "disabled"}>${escapeHtml(label)}</button>`;
  };

  const renderAll = () => {
    mount.innerHTML = `
      <section class="pumper-card pumper-mm">
        ${renderHeader()}
        <div class="pumper-mm-grid">${renderGrid()}</div>
        ${renderCta()}
      </section>
    `;
    bindHandlers();
  };

  function bindHandlers() {
    mount.querySelectorAll<HTMLElement>("[data-action=toggle-mm-item]").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.dataset.productIndex!, 10);
        const item = allItems[idx];
        if (!item || !item.available) return;
        if (selected.has(idx)) {
          selected.delete(idx);
        } else {
          if (selected.size >= target) return; // exact target cap
          selected.add(idx);
        }
        emit("widget_click", { widgetType: "mix_match", widgetId: bundle.id, productId: item.productId });
        renderAll();
      });
    });

    const cta = mount.querySelector<HTMLButtonElement>("[data-action=add-to-cart]");
    if (cta && selected.size === target) {
      cta.addEventListener("click", async () => {
        cta.disabled = true;
        const lines = Array.from(selected)
          .map((i) => allItems[i]!)
          .filter((p) => p.variantId)
          .map((p) => ({ variantId: p.variantId!, qty: 1, bundleId: bundle.id }));
        const valueCents = Array.from(selected).reduce((s, i) => s + allItems[i]!.priceCents, 0);
        const result = await addToCart(bundle.id, lines);
        if (!result.ok) {
          cta.disabled = false;
          cta.textContent = t("addToCart.error");
        } else {
          emit("add_to_cart", { widgetType: "mix_match", widgetId: bundle.id, valueCents });
        }
      });
    }
  }

  emit("widget_impression", { widgetType: "mix_match", widgetId: bundle.id, productId: allItems[0]?.productId ?? "" });
  renderAll();
}
