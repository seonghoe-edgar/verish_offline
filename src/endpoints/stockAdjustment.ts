import { playMdRequest } from "../client.js";

export interface StockAdjustmentGetRequest {
  fromDate: number;
  toDate: number;
  /** 창고: 1, 매장: 2 */
  spaceType?: "1" | "2";
  spaceCode?: string;
  productCode?: string;
  /** N: 타계정처리, Y: loss처리 */
  processingType?: "N" | "Y";
}

export interface StockAdjustment {
  processingDate: string;
  /** 창고: 1, 매장: 2 */
  spaceType: "1" | "2";
  spaceCode: string;
  spaceName: string;
  itemCode?: string;
  designerCode?: string;
  planningCategory?: string;
  productCode: string;
  productName: string;
  colorCode?: string;
  colorName?: string;
  sizeCode?: string;
  /** 입고: 1, 출고: 2 */
  transactionType: "1" | "2";
  /** 로스처리 시 "LS", 그 외에는 타계정구분명 */
  processingType: string;
  tagPrice?: string;
  avgCostPrice?: string;
  totalCostPrice?: string;
  qty: string;
  worker?: string;
  desc?: string;
  inputID?: string;
  inputDT?: string;
  updateID?: string | null;
  updateDT?: string | null;
}

export async function getStockAdjustment(
  request: StockAdjustmentGetRequest
): Promise<StockAdjustment[]> {
  return playMdRequest<StockAdjustment[]>("GET", "/api/open/stock-adjustment", { data: request });
}
