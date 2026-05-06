import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";

type CustomerRedactPayload = {
  customer?: { id?: number };
} | null;

export function handleCustomersRedact(shop: string, payload: unknown): void {
  const p = payload as CustomerRedactPayload;
  console.log(
    JSON.stringify({
      event: "customers_redact",
      shop,
      customerId: p?.customer?.id,
    }),
  );
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop, payload } = await authenticate.webhook(request, ctx);

  if (topic !== "CUSTOMERS_REDACT") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  handleCustomersRedact(shop, payload);
  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
