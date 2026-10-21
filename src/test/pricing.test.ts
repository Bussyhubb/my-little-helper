import { describe, it, expect } from "vitest";
import { priceFor } from "@/lib/pricing";

const p = { retail_price: 3000, wholesale_price: 2500, agent_price: 2200 };

describe("priceFor", () => {
  it("walk-in customers pay retail", () => expect(priceFor(p, null)).toBe(3000));
  it("retail customers pay retail", () => expect(priceFor(p, "retail")).toBe(3000));
  it("supermarkets pay wholesale", () => expect(priceFor(p, "supermarket")).toBe(2500));
  it("distributors pay agent price", () => expect(priceFor(p, "distributor")).toBe(2200));
});
