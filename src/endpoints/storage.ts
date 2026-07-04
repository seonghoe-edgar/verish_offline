import { playMdRequest } from "../client.js";

export interface StorageGetRequest {
  storage?: string;
}

export interface Storage {
  storageCode: string;
  storageName: string;
  address?: string;
  addressDetail?: string;
  zipCode?: string;
  faxNumber?: string;
  telNumber?: string;
}

export async function getStorage(request: StorageGetRequest = {}): Promise<Storage[]> {
  return playMdRequest<Storage[]>("GET", "/api/open/storage", { data: request });
}

export interface StorageCreateRequest {
  storageCode: string;
  storageName: string;
  telNumber?: string;
  faxNumber?: string;
  zipCode?: string;
  address?: string;
  addressDetail?: string;
}

export async function createStorage(requests: StorageCreateRequest[]): Promise<void> {
  return playMdRequest<void>("POST", "/api/open/storage", { data: requests });
}

export interface StorageUpdateRequest {
  storageCode: string;
  storageName: string;
  telNumber?: string;
  faxNumber?: string;
  zipCode?: string;
  address?: string;
  addressDetail?: string;
}

export async function updateStorage(requests: StorageUpdateRequest[]): Promise<void> {
  return playMdRequest<void>("PUT", "/api/open/storage", { data: requests });
}

export interface StockStorageGetRequest {
  stockDate: string;
  storage: string;
  productCode?: string;
  productName?: string;
}

export interface StockStorage {
  storageCode: string;
  storageName: string;
  productCode: string;
  productName: string;
  productLocation?: string;
  colorCode?: string;
  colorName?: string;
  sizeCode?: string;
  costPrice?: number;
  tagPrice?: number;
  stockCount: number;
  barcode?: string;
  barcode1?: string;
  barcode2?: string;
  brandCode?: string;
  brandName?: string;
  styleCode?: string;
  styleName?: string;
}

export async function getStockStorage(request: StockStorageGetRequest): Promise<StockStorage[]> {
  return playMdRequest<StockStorage[]>("GET", "/api/open/stock_storage", { data: request });
}

export interface StorageLedgerDetailInfoGetRequest {
  fromDate: number;
  toDate: number;
  /** 0: 전체, 1: 입고, 2: 반품 */
  searchType: "0" | "1" | "2";
  storageCode?: string;
  productCode?: string;
  supplierCode?: string;
  planningCategory?: string;
}

export interface StorageLedgerDetailInfo {
  enterDate: string;
  /** 1: 입고, 2: 반품 */
  enterType: "1" | "2";
  ledgerNo: string;
  storageType: string;
  storageCode: string;
  storageName: string;
  supplierCode: string;
  supplierName: string;
  supplierBusinessNumber?: string;
  designerCode?: string;
  planningCategory?: string;
  itemCode?: string;
  productCode: string;
  productName: string;
  colorCode?: string;
  colorName?: string;
  sizePattern?: string;
  sizeCode?: string;
  tagPrice?: string;
  salesPrice?: string;
  costPrice?: string;
  unitPrice?: string;
  totalQty?: string;
  desc?: string;
  totalTag?: string;
  totalUnit?: string;
  prodOrderNo?: string;
  barcode?: string;
  barcode1?: string | null;
  barcode2?: string | null;
  mixing?: string;
  desc2?: string;
  inputID?: string;
  inputDT?: string;
  updateID?: string | null;
  updateDT?: string | null;
}

export async function getStorageLedgerDetailInfo(
  request: StorageLedgerDetailInfoGetRequest
): Promise<StorageLedgerDetailInfo[]> {
  return playMdRequest<StorageLedgerDetailInfo[]>("GET", "/api/open/ledger/detailinfo/storage", {
    data: request,
  });
}

export interface StorageLedgerCreateRequest {
  enterDate: string;
  supplierCode: string;
  storageCode: string;
  /** 1: 입고, 2: 입고반품, 3: 창고간이동 */
  enterType: "1" | "2" | "3";
  barcode: string;
  unitPrice: number;
  qty: number;
}

export async function createStorageLedger(requests: StorageLedgerCreateRequest[]): Promise<void> {
  return playMdRequest<void>("POST", "/api/open/ledger/storage", { data: requests });
}
