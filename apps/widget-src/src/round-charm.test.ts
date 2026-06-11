import { describe, it, expect } from "vitest";
import { roundCharmCents } from "./round-charm";
describe("roundCharmCents", () => {
  it("rounds to nearest .99", () => { expect(roundCharmCents(1996, 99)).toBe(1999); expect(roundCharmCents(1940, 99)).toBe(1899); expect(roundCharmCents(2000, 99)).toBe(1999); });
  it("rounds to nearest .00", () => { expect(roundCharmCents(1996, 0)).toBe(2000); expect(roundCharmCents(1940, 0)).toBe(1900); });
  it("never returns negative", () => { expect(roundCharmCents(40, 99)).toBe(99); });
});
