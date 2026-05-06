import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleCustomersDataRequest } from "../app/routes/webhooks.customers.data-request";

describe("handleCustomersDataRequest", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("logs the data request event with shop and customerId", () => {
    handleCustomersDataRequest("test.myshopify.com", { customer: { id: 67890 } });
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ event: "customers_data_request", shop: "test.myshopify.com", customerId: 67890 }),
    );
  });

  it("logs even when customerId is missing", () => {
    handleCustomersDataRequest("test.myshopify.com", {});
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ event: "customers_data_request", shop: "test.myshopify.com", customerId: undefined }),
    );
  });

  it("does not throw on null payload", () => {
    expect(() => handleCustomersDataRequest("test.myshopify.com", null)).not.toThrow();
  });
});
