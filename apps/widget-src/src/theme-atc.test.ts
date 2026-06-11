import { describe, it, expect, vi } from "vitest";
import { findProductForm, syncThemeQuantity, bindThemeAddToCart } from "./theme-atc";

function makeForm() {
  document.body.innerHTML = `
    <form action="/cart/add" method="post">
      <input name="quantity" value="1" />
      <button type="submit" name="add">Add to cart</button>
    </form>`;
  return document.querySelector("form") as HTMLFormElement;
}

describe("findProductForm", () => {
  it("finds the cart-add form in the document", () => {
    makeForm();
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    expect(findProductForm(mount)).not.toBeNull();
  });
});

describe("syncThemeQuantity", () => {
  it("sets the quantity input and dispatches input/change", () => {
    const form = makeForm();
    const input = form.querySelector('input[name="quantity"]') as HTMLInputElement;
    const onChange = vi.fn();
    input.addEventListener("change", onChange);
    syncThemeQuantity(form, 3);
    expect(input.value).toBe("3");
    expect(onChange).toHaveBeenCalled();
  });
  it("no-ops on null form", () => {
    expect(() => syncThemeQuantity(null, 2)).not.toThrow();
  });
});

describe("bindThemeAddToCart", () => {
  it("intercepts submit and runs addLines when hasExtras is true", async () => {
    const form = makeForm();
    const addLines = vi.fn().mockResolvedValue(undefined);
    bindThemeAddToCart(form, { hasExtras: () => true, addLines });
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(addLines).toHaveBeenCalled();
  });
  it("lets submit proceed and does not run addLines when hasExtras is false", () => {
    const form = makeForm();
    const addLines = vi.fn();
    bindThemeAddToCart(form, { hasExtras: () => false, addLines });
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(addLines).not.toHaveBeenCalled();
  });
});
