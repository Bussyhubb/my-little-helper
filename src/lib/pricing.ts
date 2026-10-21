export type CustomerCategory = "retail" | "wholesale" | "supermarket" | "distributor" | "corporate";

export interface PricedProduct { retail_price: number; wholesale_price: number; agent_price: number }

/** Mirrors the price rule in the post_sale database function (the server is authoritative). */
export function priceFor(p: PricedProduct, category: CustomerCategory | null): number {
  if (!category || category === "retail") return Number(p.retail_price);
  if (category === "distributor") return Number(p.agent_price);
  return Number(p.wholesale_price);
}
