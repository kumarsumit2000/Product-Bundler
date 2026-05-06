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
