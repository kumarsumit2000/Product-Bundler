import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleCustomersRedact } from "../app/lib/webhooks/handlers/customers-redact";

describe("handleCustomersRedact", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("logs the redact event with shop and customerId", () => {
    handleCustomersRedact("test.myshopify.com", { customer: { id: 12345 } });
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ event: "customers_redact", shop: "test.myshopify.com", customerId: 12345 }),
    );
  });

  it("logs even when customerId is missing from payload", () => {
    handleCustomersRedact("test.myshopify.com", {});
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ event: "customers_redact", shop: "test.myshopify.com", customerId: undefined }),
    );
  });

  it("does not throw on null payload", () => {
    expect(() => handleCustomersRedact("test.myshopify.com", null)).not.toThrow();
  });
});
