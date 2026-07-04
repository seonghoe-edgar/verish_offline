import { playMdRequest } from "../client.js";

export interface ShopLedgerGetRequest {
  fromDate: string;
  toDate: string;
  storageCode?: string;
  shopCode?: string;
  ledgerNo?: string;
}

export interface ShopLedger {
  ledgerDate: string;
  storageCode: string;
  storageName: string;
  ledgerNo: string;
  shopCode: string;
  shopName: string;
  productCode: string;
  productName: string;
  colorCode: string;
  colorName: string;
  sizeCode: string;
  sizeName: string;
  sizePosition: string;
  barcode: string[];
  unitPrice: string;
  ledgerQty: string;
  confirmYn: "Y" | "N";
  confirmDate: string;
  confirmQty: string;
}

export async function getShopLedger(request: ShopLedgerGetRequest): Promise<ShopLedger[]> {
  return playMdRequest<ShopLedger[]>("GET", "/api/open/ledger/shop", { data: request });
}

export interface ShopReturnGetRequest {
  fromDate: string;
  toDate: string;
  shopCode?: string;
  storageCode?: string;
  returnNo?: string;
}

export interface ShopReturn {
  returnDate: string;
  shopCode: string;
  shopName: string;
  returnNo: string;
  storageCode: string;
  storageName: string;
  productCode: string;
  productName: string;
  colorCode: string;
  colorName: string;
  sizeCode: string;
  sizeName: string;
  sizePosition: string;
  barcode: string[];
  unitPrice: string;
  returnQty: string;
  confirmYn: "Y" | "N";
  confirmDate: string;
  confirmQty: string;
}

export async function getShopReturn(request: ShopReturnGetRequest): Promise<ShopReturn[]> {
  return playMdRequest<ShopReturn[]>("GET", "/api/open/return/shop", { data: request });
}

export interface ShopRotateGetRequest {
  fromDate: string;
  toDate: string;
  fromShopCode: string;
  toShopCode: string;
}

export interface ShopRotate {
  returnDate: string;
  shopCode: string;
  shopName: string;
  /** destination shop, despite the "storage" naming carried over from the return endpoint */
  storageCode: string;
  storageName: string;
  productCode: string;
  productName: string;
  colorCode: string;
  colorName: string;
  sizeCode: string;
  sizeName: string;
  sizePosition: string;
  unitPrice: string;
  returnQty: string;
  confirmYn: "Y" | "N";
  confirmDate: string;
  confirmQty: string;
  barcode: string[];
}

export async function getShopRotate(request: ShopRotateGetRequest): Promise<ShopRotate[]> {
  return playMdRequest<ShopRotate[]>("GET", "/api/open/rotate/shop", { data: request });
}

/**
 * '1': 창고->매장 (매장출고), '2': 매장->창고 (매장반품), '3': 매장->매장 (매장이동),
 * '4': 매장출고판매, '5': 매장반품판매
 * storageCode/shopCode meaning flips with enterType — see field docs below.
 */
export type ShopLedgerEnterType = "1" | "2" | "3" | "4" | "5";

export interface ShopLedgerCreateRequest {
  enterDate: string;
  /** outbound: source warehouse. return: destination warehouse. transfer: sending shop. 매장반품판매: sending warehouse. */
  storageCode: string;
  /** outbound: destination shop. return: source shop. 매장반품판매: receiving shop. */
  shopCode: string;
  enterType: ShopLedgerEnterType;
  barcode: string;
  unitPrice: number;
  qty: number;
  desc?: string;
}

export async function createShopLedger(requests: ShopLedgerCreateRequest[]): Promise<void> {
  await playMdRequest<void>("POST", "/api/open/ledger/shop", { data: requests });
}

export interface ExpectedReturnShopGetRequest {
  fromDate: string;
  toDate: string;
  shopCode?: string;
  returnNo?: string;
  isConfirmed?: "Y" | "N";
}

export interface ExpectedReturnShopItem {
  productCode: string;
  productName: string;
  colorCode: string;
  colorName: string;
  sizeCode: string;
  sizeName: string;
  sizePosition?: string;
  barcode: string[];
  unitPrice: number;
  expectedQty: number;
  confirmYn: "Y" | "N";
  confirmDate: string | null;
  confirmNo: string | null;
  confirmQty: number;
  regTime: string;
  modTime: string | null;
}

export interface ExpectedReturnShop {
  expectedDate: string;
  shopCode: string;
  shopName: string;
  expectedNo: string;
  storageCode: string;
  storageName: string;
  items: ExpectedReturnShopItem[];
}

export async function getExpectedReturnShop(
  request: ExpectedReturnShopGetRequest
): Promise<ExpectedReturnShop[]> {
  return playMdRequest<ExpectedReturnShop[]>("GET", "/api/open/expected_return/shop", {
    data: request,
  });
}

export interface ExpectedReturnShopConfirmRequest {
  expectedDate: string;
  expectedNo: string;
  shopCode: string;
  productCode: string;
  colorCode: string;
  sizeCode: string;
  confirmDate: string;
  confirmQty: number;
}

export async function confirmExpectedReturnShop(
  requests: ExpectedReturnShopConfirmRequest[]
): Promise<void> {
  await playMdRequest<void>("POST", "/api/open/expected_return/shop", { data: requests });
}

export interface AssignRotateProduct {
  barcode: string;
  qty: number;
  description?: string;
}

export interface AssignRotateCreateRequest {
  enterDate: string;
  shop: {
    from: string;
    to: string;
  };
  expectedDate: string;
  managerName: string;
  products: AssignRotateProduct[];
}

export async function createAssignRotate(requests: AssignRotateCreateRequest[]): Promise<number> {
  return playMdRequest<number>("POST", "/api/open/assign/rotate", { data: requests });
}

export interface AssignRotateGetRequest {
  fromDate: string;
  toDate: string;
  fromShop?: string;
  toShop?: string;
  productCode?: string;
}

export interface AssignRotateProductResult {
  productCode: string;
  productName: string;
  colorCode: string;
  sizeCode: string;
  barcode: string[];
  assignQty: string;
  /** 1: 지시/요청, 2: 거부, 3: 이동이행 */
  state?: "1" | "2" | "3";
  rotateDate: string | null;
  rotateNo: string | null;
  performQty: string | null;
  assignDescription?: string;
  perfomDescription: string | null;
}

export interface AssignRotate {
  enterDate: string;
  shop: {
    from: { code: string; name: string };
    to: { code: string; name: string };
  };
  products: AssignRotateProductResult[];
}

export async function getAssignRotate(request: AssignRotateGetRequest): Promise<AssignRotate[]> {
  return playMdRequest<AssignRotate[]>("GET", "/api/open/assign/rotate", { data: request });
}

/** ALL: 전체, 1: 출고, 2: 반품, 3: 이동출고, 4: 이동반품 — multiple values can be pipe-delimited, e.g. "1|2" */
export type ShopLedgerDetailInfoSearchType = "ALL" | "1" | "2" | "3" | "4" | string;

export interface ShopLedgerDetailInfoGetRequest {
  fromDate: number;
  toDate: number;
  storageCode?: string;
  shopCode?: string;
  productCode?: string;
  searchType: ShopLedgerDetailInfoSearchType;
  planningCategory?: string;
}

export interface ShopLedgerDetailInfo {
  shopCode: string;
  storeName: string;
  /** 1: 출고, 2: 반품 */
  searchType: "1" | "2";
  enterDate: string;
  ledgerNo: string;
  storageCode: string;
  storageName: string;
  itemCode?: string;
  designerCode?: string;
  planningCategory?: string;
  productCode: string;
  productName: string;
  colorCode?: string;
  colorName?: string;
  sizeCode?: string;
  eventCode?: string;
  eventName?: string;
  margin?: string;
  tagPrice?: string;
  costPrice?: string;
  currentPrice?: string;
  totalCurrentPrice?: string;
  releasePrice?: string;
  totalReleasePrice?: string;
  qty: string;
  storageLocation?: string;
  returnReason?: string;
  desc?: string;
  desc2?: string;
  registeredProgram?: string;
  inputID?: string;
  inputDT?: string;
  updateID?: string | null;
  updateDT?: string | null;
}

export async function getShopLedgerDetailInfo(
  request: ShopLedgerDetailInfoGetRequest
): Promise<ShopLedgerDetailInfo[]> {
  return playMdRequest<ShopLedgerDetailInfo[]>("GET", "/api/open/ledger/detailinfo/shop", {
    data: request,
  });
}
