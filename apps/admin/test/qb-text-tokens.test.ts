import { describe, it, expect } from "vitest";
import { insertToken, QB_TEXT_TOKENS } from "../app/lib/qb-text-tokens";

describe("insertToken", () => {
  it("appends a token to an empty string with no leading space", () => { expect(insertToken("", "{qty}")).toBe("{qty}"); });
  it("appends with a single separating space when needed", () => { expect(insertToken("Buy", "{qty}")).toBe("Buy {qty}"); });
  it("does not double the space when the value already ends with one", () => { expect(insertToken("Buy ", "{qty}")).toBe("Buy {qty}"); });
});
describe("QB_TEXT_TOKENS", () => {
  it("lists the supported tokens", () => { expect(QB_TEXT_TOKENS).toEqual(["{qty}", "{DiscountPercentage}", "{DiscountAmountTotal}"]); });
});
