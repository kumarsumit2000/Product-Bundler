import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { authenticate, type AppLoadContext } from "~/shopify.server";

// TEMP DEBUG ROUTE — remove after diagnosing the 403.
// Visit /app/debug/api-test inside the embedded admin to see exactly what
// Shopify says when we make a minimal graphql call with the current session.
export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);

  const result: Record<string, unknown> = {
    sessionId: session.id,
    shop: session.shop,
    isOnline: session.isOnline,
    scope: session.scope,
    expires: session.expires?.toISOString() ?? null,
    accessTokenLength: session.accessToken?.length ?? 0,
    accessTokenPrefix: session.accessToken?.slice(0, 8) ?? null,
  };

  // Test 1: Minimal SDK call.
  try {
    const res = await admin.graphql(`{ shop { name myshopifyDomain } }`);
    result.sdkCall = {
      ok: res.ok,
      status: res.status,
      body: await res.text(),
    };
  } catch (err) {
    if (err instanceof Response) {
      result.sdkCall = {
        threwResponse: true,
        status: err.status,
        body: await err.text().catch(() => "(unreadable)"),
      };
    } else {
      result.sdkCall = {
        threwError: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Test 2: Raw fetch with the same token, bypassing the SDK.
  try {
    const rawRes = await fetch(
      `https://${session.shop}/admin/api/2026-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken ?? "",
        },
        body: JSON.stringify({ query: "{ shop { name } }" }),
      },
    );
    result.rawCall = {
      status: rawRes.status,
      body: (await rawRes.text()).slice(0, 500),
    };
  } catch (err) {
    result.rawCall = { threw: err instanceof Error ? err.message : String(err) };
  }

  return json(result);
}

export default function ApiTestDebug() {
  const data = useLoaderData<typeof loader>();
  return (
    <pre style={{ padding: 16, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#fff", color: "#000" }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
