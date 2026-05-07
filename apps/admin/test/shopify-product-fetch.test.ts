import { describe, it, expect, vi } from "vitest";
import { fetchProductDetails, fetchCollectionTopProducts } from "../app/lib/shopify-product-fetch";

const productNodesResponse = {
  data: {
    nodes: [
      {
        __typename: "Product",
        id: "gid://shopify/Product/1",
        title: "Snowboard",
        featuredImage: { url: "https://cdn.example.com/snowboard.jpg" },
        variants: { nodes: [
          { id: "gid://shopify/ProductVariant/11", title: "Default", availableForSale: true, price: "729.95" },
        ]},
      },
    ],
  },
};

const collectionResponse = {
  data: {
    collection: {
      products: { nodes: [
        {
          id: "gid://shopify/Product/2",
          title: "Tee",
          featuredImage: { url: "https://cdn.example.com/tee.jpg" },
          variants: { nodes: [
            { id: "gid://shopify/ProductVariant/22", title: "Default", availableForSale: true, price: "24.00" },
          ]},
        },
      ]},
    },
  },
};

function mockAdmin(json: unknown) {
  return {
    graphql: vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } })),
  };
}

describe("fetchProductDetails", () => {
  it("returns title + image + variants for each requested product", async () => {
    const admin = mockAdmin(productNodesResponse);
    const out = await fetchProductDetails(admin, ["gid://shopify/Product/1"]);
    expect(out["gid://shopify/Product/1"]?.title).toBe("Snowboard");
    expect(out["gid://shopify/Product/1"]?.image).toBe("https://cdn.example.com/snowboard.jpg");
    expect(out["gid://shopify/Product/1"]?.variants[0]?.priceCents).toBe(72995);
    expect(out["gid://shopify/Product/1"]?.variants[0]?.available).toBe(true);
  });

  it("returns empty object when the input list is empty", async () => {
    const admin = mockAdmin(productNodesResponse);
    const out = await fetchProductDetails(admin, []);
    expect(out).toEqual({});
    expect(admin.graphql).not.toHaveBeenCalled();
  });
});

describe("fetchCollectionTopProducts", () => {
  it("returns top N products from a collection", async () => {
    const admin = mockAdmin(collectionResponse);
    const out = await fetchCollectionTopProducts(admin, "gid://shopify/Collection/1", 12);
    expect(out.length).toBe(1);
    expect(out[0]?.productId).toBe("gid://shopify/Product/2");
    expect(out[0]?.priceCents).toBe(2400);
  });
});
