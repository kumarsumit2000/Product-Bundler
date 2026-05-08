type Props = { websiteId: string };

// Injects Crisp's loader script into <head>. The loader then fetches the chat
// widget code and renders the floating bubble. Async load — does not block.
//
// websiteId is the public Crisp workspace identifier (safe to commit). It is
// hardcoded by callers — never sourced from user input — so the dangerouslySetInnerHTML
// XSS surface is closed.
export function CrispChat({ websiteId }: Props) {
  const safeId = websiteId.replace(/[^a-zA-Z0-9-]/g, "");
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.$crisp=[];window.CRISP_WEBSITE_ID="${safeId}";(function(){var d=document;var s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();`,
      }}
    />
  );
}
