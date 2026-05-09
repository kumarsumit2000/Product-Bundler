import { useEffect } from "react";

type Props = { websiteId: string };

// Loads Crisp's chat widget by injecting their loader script into <head>.
// We use useEffect rather than rendering a JSX <script dangerouslySetInnerHTML>
// because React doesn't reliably execute inline scripts after client-side
// route transitions — useEffect runs in the browser on every mount, so the
// widget shows up consistently whether the page was SSR'd or client-routed.
//
// websiteId is the public Crisp workspace identifier and is hardcoded by
// callers (never user input), so the assignment to window.CRISP_WEBSITE_ID
// is safe; we still strip non-alphanumeric characters as defense in depth.
export function CrispChat({ websiteId }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Idempotent — Crisp's own loader sets window.$crisp; if it's already an
    // object with `is` defined it means the widget has booted, so skip.
    type CrispWindow = Window & {
      $crisp?: unknown;
      CRISP_WEBSITE_ID?: string;
    };
    const w = window as CrispWindow;
    if (w.$crisp && typeof w.$crisp === "object" && !Array.isArray(w.$crisp)) {
      return;
    }
    const safeId = websiteId.replace(/[^a-zA-Z0-9-]/g, "");
    if (!safeId) return;

    w.$crisp = [];
    w.CRISP_WEBSITE_ID = safeId;

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://client.crisp.chat/l.js"]',
    );
    if (existing) return;

    const script = document.createElement("script");
    script.src = "https://client.crisp.chat/l.js";
    script.async = true;
    document.head.appendChild(script);
  }, [websiteId]);

  return null;
}
