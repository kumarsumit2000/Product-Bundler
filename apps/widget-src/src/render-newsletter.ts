import type { NewsletterConfig, NewsletterPopup } from "./types";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function applyNewsletterVars(target: HTMLElement, n: NewsletterConfig): void {
  const s = n.styleOverrides ?? {};
  const set = (name: string, value: string | number | undefined): void => {
    if (value === undefined || value === null || value === "") return;
    target.style.setProperty(name, typeof value === "number" ? `${value}px` : value);
  };
  set("--pumper-nl-bg", s.backgroundColor);
  set("--pumper-nl-heading", s.headingColor);
  set("--pumper-nl-text", s.textColor);
  set("--pumper-nl-btn-bg", s.buttonBg);
  set("--pumper-nl-btn-text", s.buttonText);
  set("--pumper-nl-border", s.borderColor);
  set("--pumper-nl-radius", s.borderRadius);
  // Per-axis padding takes precedence; fall back to legacy single-axis values.
  set("--pumper-nl-inline-px", s.inlinePaddingX ?? s.inlinePadding);
  set("--pumper-nl-inline-py", s.inlinePaddingY ?? s.inlinePadding);
  set("--pumper-nl-popup-px", s.popupPaddingX ?? s.popupPadding);
  set("--pumper-nl-popup-py", s.popupPaddingY ?? s.popupPadding);
  set("--pumper-nl-text-align", s.textAlign);
  set("--pumper-nl-inline-max", s.inlineMaxWidth);
  set("--pumper-nl-popup-max", s.popupMaxWidth);
}

function newsletterFormHtml(n: NewsletterConfig): string {
  return `
    <h3 class="pumper-newsletter-heading">${escapeHtml(n.headline)}</h3>
    ${n.subtitle ? `<p class="pumper-newsletter-sub">${escapeHtml(n.subtitle)}</p>` : ""}
    <form class="pumper-newsletter-form" data-pumper-newsletter-form novalidate>
      <input
        type="email"
        name="contact[email]"
        required
        placeholder="${escapeHtml(n.placeholder)}"
        class="pumper-newsletter-input"
        autocomplete="email"
      />
      <button type="submit" class="pumper-cta pumper-newsletter-cta">${escapeHtml(n.ctaLabel)}</button>
    </form>
    <div class="pumper-newsletter-status" data-pumper-newsletter-status hidden></div>
  `;
}

function bindForm(root: HTMLElement, n: NewsletterConfig, onDone?: () => void): void {
  const form = root.querySelector<HTMLFormElement>("[data-pumper-newsletter-form]");
  const status = root.querySelector<HTMLDivElement>("[data-pumper-newsletter-status]");
  const input = form?.querySelector<HTMLInputElement>("input[type=email]");
  const button = form?.querySelector<HTMLButtonElement>("button[type=submit]");
  if (!form || !status || !input || !button) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      status.hidden = false;
      status.className = "pumper-newsletter-status pumper-newsletter-status--error";
      status.textContent = "Please enter a valid email.";
      return;
    }

    button.disabled = true;
    const original = button.textContent;
    button.textContent = "...";

    // Submit to Shopify's native /contact endpoint. Shopify creates a customer
    // with marketing consent server-side. No backend needed on our end.
    const body = new URLSearchParams();
    body.set("form_type", "customer");
    body.set("utf8", "✓");
    body.set("contact[email]", email);
    if (n.tags) body.set("contact[tags]", n.tags);
    body.set("contact[accepts_marketing]", "yes");

    try {
      const res = await fetch("/contact", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        credentials: "same-origin",
      });
      if (!res.ok && res.status !== 0 && res.type !== "opaqueredirect") {
        throw new Error(`HTTP ${res.status}`);
      }
      form.style.display = "none";
      status.hidden = false;
      status.className = "pumper-newsletter-status pumper-newsletter-status--success";
      status.textContent = n.successMessage;
      if (onDone) setTimeout(onDone, 2500);
    } catch (err) {
      console.error("[pumper newsletter]", err);
      button.disabled = false;
      button.textContent = original ?? "Subscribe";
      status.hidden = false;
      status.className = "pumper-newsletter-status pumper-newsletter-status--error";
      status.textContent = "Something went wrong — please try again.";
    }
  });
}

export function renderNewsletter(mount: HTMLElement, n: NewsletterConfig): void {
  applyNewsletterVars(mount, n);
  mount.innerHTML = `<section class="pumper-card pumper-newsletter">${newsletterFormHtml(n)}</section>`;
  bindForm(mount, n);
}

// Static, non-overlay rendering of the popup — used in the admin preview iframe.
// Renders the same modal shell + image-positioned layout, no triggers, no dismiss.
export function renderPopupInline(mount: HTMLElement, n: NewsletterConfig): void {
  const popup = n.popup;
  const pos = popup?.imagePosition ?? "none";
  const img = popup?.imageUrl ?? "";
  const hasImage = pos !== "none" && !!img;
  const sideImage = hasImage && (pos === "left" || pos === "right");

  const imgHtml = hasImage
    ? `<div class="pumper-modal-image pumper-modal-image--${pos}" style="background-image:url('${img.replace(/'/g, "%27")}')"></div>`
    : "";
  const contentHtml = `<div class="pumper-modal-content">${newsletterFormHtml(n)}</div>`;

  const inner = pos === "bottom"
    ? contentHtml + imgHtml
    : imgHtml + contentHtml;

  applyNewsletterVars(mount, n);
  mount.innerHTML = `
    <div class="pumper-modal pumper-newsletter pumper-card pumper-modal--${pos}${sideImage ? " pumper-modal--wide" : ""}" role="dialog" aria-modal="true" style="margin: 0 auto;">
      <button type="button" class="pumper-modal-close" aria-label="Close">&times;</button>
      ${inner}
    </div>
  `;
  bindForm(mount, n);
}

// ----- Popup mode --------------------------------------------------------

const POPUP_KEY = "pumper_newsletter_popup_dismissed_at";

function pathMatches(pattern: string, path: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  if (p === path) return true;
  if (p.endsWith("/*")) {
    const prefix = p.slice(0, -1); // keep trailing "/"
    return path.startsWith(prefix);
  }
  if (p.endsWith("*")) {
    const prefix = p.slice(0, -1);
    return path.startsWith(prefix);
  }
  return false;
}

function isExcludedPath(popup: NewsletterPopup, path: string): boolean {
  return popup.excludedPaths.some((pat) => pathMatches(pat, path));
}

function recentlyDismissed(frequencyDays: number): boolean {
  if (frequencyDays <= 0) return false;
  try {
    const raw = localStorage.getItem(POPUP_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < frequencyDays * 86400_000;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try { localStorage.setItem(POPUP_KEY, String(Date.now())); } catch { /* ignore */ }
}

function showPopup(n: NewsletterConfig): void {
  if (document.querySelector("[data-pumper-newsletter-popup]")) return;

  const popup = n.popup;
  const pos = popup?.imagePosition ?? "none";
  const img = popup?.imageUrl ?? "";
  const hasImage = pos !== "none" && !!img;
  const sideImage = hasImage && (pos === "left" || pos === "right");

  const imgHtml = hasImage
    ? `<div class="pumper-modal-image pumper-modal-image--${pos}" style="background-image:url('${img.replace(/'/g, "%27")}')"></div>`
    : "";
  const contentHtml = `<div class="pumper-modal-content">${newsletterFormHtml(n)}</div>`;

  // CSS handles left/right placement via flex-direction; HTML order is the
  // same for both. Top/bottom use document flow (column).
  const inner = pos === "bottom"
    ? contentHtml + imgHtml
    : imgHtml + contentHtml;

  const root = document.createElement("div");
  root.setAttribute("data-pumper-newsletter-popup", "1");
  root.className = "pumper-modal-backdrop";
  root.innerHTML = `
    <div
      class="pumper-modal pumper-newsletter pumper-card pumper-modal--${pos}${sideImage ? " pumper-modal--wide" : ""}"
      role="dialog"
      aria-modal="true"
    >
      <button type="button" class="pumper-modal-close" aria-label="Close">&times;</button>
      ${inner}
    </div>
  `;
  applyNewsletterVars(root, n);
  document.body.appendChild(root);

  const close = () => {
    markDismissed();
    root.remove();
  };

  root.querySelector<HTMLButtonElement>(".pumper-modal-close")?.addEventListener("click", close);
  root.addEventListener("click", (e) => { if (e.target === root) close(); });
  document.addEventListener("keydown", function escHandler(e) {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", escHandler);
    }
  });

  bindForm(root, n, close);
}

export function maybeStartNewsletterPopup(n: NewsletterConfig): void {
  const popup = n.popup;
  if (!popup) return;
  const path = window.location.pathname;
  if (isExcludedPath(popup, path)) return;
  if (recentlyDismissed(popup.frequencyDays)) return;

  if (popup.trigger === "delay") {
    const ms = Math.max(0, popup.delaySeconds) * 1000;
    setTimeout(() => showPopup(n), ms);
  } else if (popup.trigger === "scroll") {
    const target = Math.max(10, Math.min(100, popup.scrollPercent));
    let fired = false;
    const onScroll = () => {
      if (fired) return;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      if (max <= 0) return;
      const pct = (window.scrollY / max) * 100;
      if (pct >= target) {
        fired = true;
        window.removeEventListener("scroll", onScroll);
        showPopup(n);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
  } else if (popup.trigger === "exit_intent") {
    let fired = false;
    const onLeave = (e: MouseEvent) => {
      if (fired) return;
      if (e.clientY <= 0) {
        fired = true;
        document.removeEventListener("mouseout", onLeave);
        showPopup(n);
      }
    };
    document.addEventListener("mouseout", onLeave);
  }
}
