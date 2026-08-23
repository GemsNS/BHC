import { readFile } from "node:fs/promises";
import path from "node:path";

export type PricingItem = {
  item: string;
  cost: string;
  coverage: string;
  wasteFactor: string;
};

export async function getPricingItems(): Promise<PricingItem[]> {
  const csvPath = path.join(process.cwd(), "assets", "pricelist.csv");
  const csv = await readFile(csvPath, "utf8");

  return csv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [item = "", cost = "", coverage = "", wasteFactor = ""] = line.split(",");
      return {
        item: item.trim(),
        cost: cost.trim(),
        coverage: coverage.trim(),
        wasteFactor: wasteFactor.trim(),
      };
    })
    .filter((row) => row.item.length > 0 && row.cost.length > 0);
}
