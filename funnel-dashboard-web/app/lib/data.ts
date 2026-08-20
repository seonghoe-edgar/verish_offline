import { readFileSync } from "node:fs";
import path from "node:path";

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  sessions: number;
  validOrders: number;
  conversionRate: number;
  revenue: number;
  aov: number;
  avgAddCartRate: number;
  avgPurchaseRate: number;
}

export interface ProductRow {
  productNo: number;
  productName: string;
  views: number;
  addCartCount: number;
  addCartRate: number;
  qtySold: number;
  revenue: number;
  purchaseRate: number;
  flag: string | null;
}

export interface LatestProducts {
  weekStart: string;
  weekEnd: string;
  avgAddCartRate: number;
  avgPurchaseRate: number;
  products: ProductRow[];
}

function readJson<T>(fileName: string): T | null {
  try {
    const filePath = path.join(process.cwd(), "public", "data", fileName);
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export function getWeeklySummary(): WeeklySummary[] {
  return readJson<WeeklySummary[]>("weekly-summary.json") ?? [];
}

export function getLatestProducts(): LatestProducts | null {
  return readJson<LatestProducts>("latest-products.json");
}
