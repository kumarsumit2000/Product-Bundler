import type { CountdownConfig } from "./types";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function applyVars(target: HTMLElement, c: CountdownConfig): void {
  const s = c.styleOverrides ?? {};
  const set = (name: string, value: string | number | undefined) => {
    if (value === undefined || value === null || value === "") return;
    target.style.setProperty(name, typeof value === "number" ? `${value}px` : value);
  };
  set("--ct-bg", s.backgroundColor);
  set("--ct-text", s.textColor);
  set("--ct-accent", s.accentColor);
  set("--ct-border", s.borderColor);
  set("--ct-radius", s.borderRadius);
  set("--ct-align", s.textAlign);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function diffParts(ms: number): { d: number; h: number; m: number; s: number } {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(totalSec / 86400),
    h: Math.floor((totalSec % 86400) / 3600),
    m: Math.floor((totalSec % 3600) / 60),
    s: totalSec % 60,
  };
}

export function renderCountdown(mount: HTMLElement, c: CountdownConfig): void {
  applyVars(mount, c);
  mount.classList.add("pumper-ct");
  if (c.layout === "bar") mount.classList.add("pumper-ct--bar");

  const tick = () => {
    const ms = c.endAt - Date.now();
    if (ms <= 0) {
      mount.innerHTML = `
        <div class="pumper-ct-inner pumper-ct-expired">
          <span class="pumper-ct-headline">${escapeHtml(c.expiredHeadline)}</span>
        </div>
      `;
      return false; // stop ticking
    }
    const { d, h, m, s } = diffParts(ms);
    const showDays = d > 0;
    mount.innerHTML = `
      <div class="pumper-ct-inner">
        <span class="pumper-ct-headline">${escapeHtml(c.headline)}</span>
        <span class="pumper-ct-clock">
          ${showDays ? `<span class="pumper-ct-unit"><b>${pad(d)}</b><i>d</i></span><span class="pumper-ct-sep">:</span>` : ""}
          <span class="pumper-ct-unit"><b>${pad(h)}</b><i>h</i></span>
          <span class="pumper-ct-sep">:</span>
          <span class="pumper-ct-unit"><b>${pad(m)}</b><i>m</i></span>
          <span class="pumper-ct-sep">:</span>
          <span class="pumper-ct-unit"><b>${pad(s)}</b><i>s</i></span>
        </span>
      </div>
    `;
    return true;
  };

  if (!tick()) return;
  const interval = window.setInterval(() => {
    if (!tick()) window.clearInterval(interval);
  }, 1000);
}
