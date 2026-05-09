import type { NewsletterConfig } from "./types";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function renderNewsletter(mount: HTMLElement, n: NewsletterConfig): void {
  mount.innerHTML = `
    <section class="pumper-card pumper-newsletter">
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
    </section>
  `;

  const form = mount.querySelector<HTMLFormElement>("[data-pumper-newsletter-form]");
  const status = mount.querySelector<HTMLDivElement>("[data-pumper-newsletter-status]");
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
      // Same-origin POST. Shopify returns HTML; we treat 2xx as success.
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
