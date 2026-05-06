import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";

type CustomerDataRequestPayload = {
  customer?: { id?: number };
} | null;

export function handleCustomersDataRequest(shop: string, payload: unknown): void {
  const p = payload as CustomerDataRequestPayload;
  console.log(
    JSON.stringify({
      event: "customers_data_request",
      shop,
      customerId: p?.customer?.id,
    }),
  );
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop, payload } = await authenticate.webhook(request, ctx);

  if (topic !== "CUSTOMERS_DATA_REQUEST") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  handleCustomersDataRequest(shop, payload);
  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
