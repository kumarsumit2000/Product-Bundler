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
