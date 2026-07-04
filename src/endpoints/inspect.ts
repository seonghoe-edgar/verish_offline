import { playMdRequest } from "../client.js";

export type InspectTarget = "storage" | "shop";

export interface InspectProduct {
  productCode: string;
  colorCode: string;
  sizeCode: string;
  inspectQty: number;
}

export interface InspectCreateRequest {
  inspectDate: string;
  targetCode: string;
  /** Y: delete existing inspection data for the same date, N (default): keep it */
  removePrev?: "Y" | "N";
  /** Y (default): apply to stock immediately, N: register only, apply stock separately */
  lossYn?: "Y" | "N";
  /** Y: zero out stock for products not included in this inspection, N (default): only apply inspected products */
  lossForAll?: "Y" | "N";
  products: InspectProduct[];
}

export async function createInspection(
  target: InspectTarget,
  request: InspectCreateRequest
): Promise<string> {
  return playMdRequest<string>("POST", `/api/open/inspect/${target}`, { data: request });
}
