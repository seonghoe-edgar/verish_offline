import { playMdRequest } from "../client.js";

export interface Shop {
  shopCode: string;
  shopName: string;
  shopType: string;
  shopCategory: string;
  telNumber?: string;
  faxNumber?: string;
  businessNumber?: string;
  repName?: string;
  repContactNumber?: string;
  businessType?: string;
  businessCategory?: string;
  /** format: yyyyMMdd (ex.20191231) */
  shopOpenDate?: string;
  zipCode?: string;
  address?: string;
  addressDetail?: string;
}

export async function getShop(): Promise<Shop[]> {
  return playMdRequest<Shop[]>("GET", "/api/open/shop", { data: {} });
}

export interface ShopCreateRequest {
  shopCode: string;
  shopName: string;
  shopType: string;
  shopCategory: string;
  telNumber?: string;
  faxNumber?: string;
  businessNumber?: string;
  repName?: string;
  repContactNumber?: string;
  businessType?: string;
  businessCategory?: string;
  /** format: yyyyMMdd (ex.20191231) */
  shopOpenDate?: string;
  zipCode?: string;
  address?: string;
  addressDetail?: string;
}

export async function createShop(data: ShopCreateRequest[]): Promise<void> {
  await playMdRequest<void>("POST", "/api/open/shop", { data });
}

export interface ShopUpdateRequest {
  /** update key: sub-info is modified based on this field */
  shopCode: string;
  shopName: string;
  shopType: string;
  shopCategory: string;
  telNumber?: string;
  faxNumber?: string;
  businessNumber?: string;
  repName?: string;
  repContactNumber?: string;
  businessType?: string;
  businessCategory?: string;
  /** format: yyyyMMdd (ex.20191231) */
  shopOpenDate?: string;
  zipCode?: string;
  address?: string;
  addressDetail?: string;
}

export async function updateShop(data: ShopUpdateRequest[]): Promise<void> {
  await playMdRequest<void>("PUT", "/api/open/shop", { data });
}

export interface ShopOrderProduct {
  productCode: string;
  productName: string;
  colorCode: string;
  colorName: string;
  sizeCode: string;
  sizeName: string;
  orderQty: string;
  requestDeliveryDate?: string;
  description?: string;
  message?: string;
  regDate?: string;
  modDate?: string;
}

export interface ShopOrder {
  shopCode: string;
  /** format: yyyyMMdd (ex.20191231) */
  orderDate: string;
  orderNum: string;
  products: ShopOrderProduct[];
}

export interface ShopOrderGetRequest {
  /** format: yyyyMMdd (ex.20191231) */
  from: string;
  /** format: yyyyMMdd (ex.20191231) */
  to: string;
  shop: string;
  order_num?: string;
  product?: string;
}

export async function getShopOrders(data: ShopOrderGetRequest): Promise<ShopOrder[]> {
  return playMdRequest<ShopOrder[]>("GET", "/api/open/orders", { data });
}

export interface ShopOrderConfirmProduct {
  productCode: string;
  colorCode: string;
  sizeCode: string;
  confirmQty: string;
  /** format: yyyyMMdd (ex.20191231) */
  ledgerDate: string;
}

export interface ShopOrderConfirmRequest {
  /** format: yyyyMMdd (ex.20191231) */
  orderDate: string;
  shopCode: string;
  orderNum: string;
  /** stock is released from this warehouse to the ordering shop */
  storageCode: string;
  products: ShopOrderConfirmProduct[];
}

export async function confirmShopOrder(data: ShopOrderConfirmRequest[]): Promise<void> {
  await playMdRequest<void>("POST", "/api/open/orders", { data });
}

export interface ShopStock {
  shopCode: string;
  shopName: string;
  productCode: string;
  productName: string;
  colorCode: string;
  colorName: string;
  sizeCode: string;
  costPrice: number;
  tagPrice: number;
  releasePrice: number;
  releaseAmount: number;
  salesPrice: number;
  salesAmount: number;
  stockCount: number;
  barcode1?: string;
  barcode2?: string;
  /** only present when the product code has a brand segment */
  brandCode?: string;
  brandName?: string;
  /** only present when the product code has a style segment */
  styleCode?: string;
  styleName?: string;
}

export interface ShopStockGetRequest {
  /** format: yyyyMMdd (ex.20191231) */
  stockDate: string;
  shop: string;
  productCode?: string;
  /** "Y" shows zero-stock items */
  zeroQtView?: "Y";
}

export async function getShopStock(data: ShopStockGetRequest): Promise<ShopStock[]> {
  return playMdRequest<ShopStock[]>("GET", "/api/open/stock_shop", { data });
}

export interface NonSalesStock {
  shopCode: string;
  shopName: string;
  barcode: string;
  nonSalesStock: number;
}

export interface NonSalesStockGetRequest {
  // Documented as optional, but the live API rejects requests with 400
  // ("매장코드가 입력되지 않았습니다") when this is omitted.
  shopCode: string;
  barcode?: string;
}

export async function getNonSalesStock(data: NonSalesStockGetRequest): Promise<NonSalesStock[]> {
  // Unlike most endpoints in this API, the vendor's own example is a query string
  // (?shopCode=test&barcode=...) rather than a JSON body — sending it as a body returns HTTP 400.
  return playMdRequest<NonSalesStock[]>("GET", "/api/open/nonSalesProductMaster", {
    params: data as unknown as Record<string, unknown>,
  });
}
