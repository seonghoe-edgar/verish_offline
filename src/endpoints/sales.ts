import { playMdRequest } from "../client.js";

export interface SalesCreateDetail {
  barcode: string;
  tagPrice?: number;
  salesPrice?: number;
  qty?: number;
  margin?: number;
  desc: string;
}

export interface SalesCreateRequest {
  /** format: yyyyMMdd (ex.20191231) */
  salesDate: string;
  shopCode: string;
  /** 1: 판매, 2: 환불 (refunds use negative amounts/quantities) */
  salesType: "1" | "2";
  /** sum of discountAmount + creditCard + cash + point + coupon */
  plannedAmount: number;
  discountAmount: number;
  creditCard: number;
  cash: number;
  point: number;
  coupon: number;
  customerId: string;
  customerName: string;
  desc: string;
  detail: SalesCreateDetail[];
}

export async function createSales(data: SalesCreateRequest[]): Promise<void> {
  await playMdRequest<void>("POST", "/api/open/sales", { data });
}

export interface SalesPayments {
  creditCard: number;
  cash: number;
  point: number;
  coupon: number;
  /** fixed at 0; use immediateRefund instead */
  giftCard: number;
  immediateRefund?: number;
  /** planned field: 카카오페이, 알리/위젯 */
  easyPay?: number;
}

export interface SalesDetail {
  seq: number;
  productCode: string;
  productName: string;
  colorCode: string;
  colorName: string;
  sizeCode: string;
  sizeName: string;
  barcode: string[];
  tagPrice: number;
  salesPrice: number;
  discount: number;
  paymentPrice: number;
  qty: number;
  costPrice: number;
  avgCostPrice: number;
  margin: number;
  interimManagementFees: number;
  supplierName: string;
  brandName: string;
  /** format: yyyyMMdd (ex.20191231) */
  firstReleaseDate: string;
}

export interface Sales {
  /** format: yyyyMMdd (ex.20191231) */
  salesDate: string;
  shopCode: string;
  /** 1: 판매, 2: 환불 */
  salesType: "1" | "2";
  receiptNo: string;
  plannedAmount: number;
  discountAmount: number;
  /** creditCard + cash + easyPay */
  paymentAmount: number;
  customerId: string;
  customerName: string;
  earningPoints: number;
  /** used when customer info is managed externally */
  externalCustomerId?: string | null;
  online_coupon_num?: string;
  online_coupon_name?: string;
  /** temporary unique order id, used when customer info is managed externally */
  externalOrderId?: string;
  /** only present for refund receipts */
  prevReceiptNo?: string | null;
  /** format: yyyy-MM-dd HH:mm:ss.fff */
  salesDateTime: string;
  desc: string;
  payments: SalesPayments;
  detail: SalesDetail[];
}

export interface SalesGetRequest {
  /** format: yyyyMMdd (ex.20191231) */
  from: string;
  /** planned field, format: HHmm (ex.1200) */
  timeFrom?: string;
  /** format: yyyyMMdd (ex.20191231) */
  to: string;
  /** planned field, format: HHmm (ex.1300) */
  timeTo?: string;
  shop: string;
  /** 1: 판매, 2: 환불 */
  type?: "1" | "2";
  receipt?: string;
  brand?: string;
}

export async function getSales(data: SalesGetRequest): Promise<Sales[]> {
  return playMdRequest<Sales[]>("GET", "/api/open/sales", { data });
}

export interface SalesDetailInfo {
  salesDate: string;
  shopCategory: string;
  shopCode: string;
  shopName: string;
  receiptNo: string;
  receiptSeq: string;
  salesCategory: string;
  itemCode: string;
  supplierBusinessNumber: string;
  supplierCode: string;
  supplierName: string;
  designerCode: string;
  planningCategory: string;
  productCode: string;
  productName: string;
  colorCode: string;
  colorName: string;
  sizeCode: string;
  sizeName: string;
  barcode: string;
  salesType: string;
  paymentMethod: string;
  returnYN: string;
  /** DEFAULT '' */
  tagPrice: string;
  costPrice: string;
  avgCostPrice: string;
  currentPrice: string;
  retailPrice: string;
  qty: string;
  discount: string;
  flexibleDiscount: string;
  point: string;
  giftCard: string;
  taxFree: string;
  salesPrice: string;
  totalSalesPrice: string;
  totalPaymentPrice: string;
  salesProfitExDiscount: string;
  salesProfit: string;
  totalTagPrice: string;
  totalCostPrice: string;
  totalAvgCostPrice: string;
  eventType: string;
  margin: string;
  intermediateMargin: string;
  customerCode: string;
  customerName: string;
  customerCardNumber: string | null;
  salesperson: string;
  recipient: string | null;
  desc: string;
  desc2: string;
  receiptDesc: string;
  inputID: string;
  inputDT: string;
  updateID: string | null;
  updateDT: string | null;
}

export interface SalesDetailInfoGetRequest {
  /** format: yyyyMMdd (ex.20191231) */
  fromDate: number;
  /** format: yyyyMMdd (ex.20191231) */
  toDate: number;
  shopType?: string;
  shopCode?: string;
  productCode?: string;
  planningType?: string;
  eventType?: string;
  customerCode?: string;
  supplierCode?: string;
  salesCategory?: string;
  salesType?: string;
  designerCode?: string;
  /** shopCode + salesDate + slip number */
  receipt?: string;
}

export async function getSalesDetailInfo(data: SalesDetailInfoGetRequest): Promise<SalesDetailInfo[]> {
  return playMdRequest<SalesDetailInfo[]>("GET", "/api/open/sales-detailinfo", { data });
}

export interface SalesPgInfo {
  /** 1: 승인, 2: 승인 후 등록 */
  paymentType: "1" | "2";
  cardNo: string;
  cardName: string;
  cardType: string;
  authAmount: number;
  installmentMonths: string;
  authNo: string;
  /**
   * D1/D2: 신용승인/취소, K1/K2: 간편결제승인/취소,
   * H1/H2: 일반현금결제 또는 소득공제승인/취소, A1: ICB알리페이/ICB위쳇페이.
   * Case-sensitive: match exactly as returned by the API.
   */
  authCode: string;
  authName: string;
  /** format: yyyy-MM-dd HH:mm */
  authTime: string;
}

export interface SalesPgInfoResult {
  /** format: yyyyMMdd (ex.20191231) */
  salesDate: string;
  shopCode: string;
  shopName: string;
  receiptNo: string;
  PGInfo: SalesPgInfo[];
}

export interface SalesPgInfoGetRequest {
  /** format: yyyyMMdd (ex.20191231) */
  date: string;
  shop: string;
  receipt?: string;
}

export async function getSalesPgInfo(data: SalesPgInfoGetRequest): Promise<SalesPgInfoResult[]> {
  return playMdRequest<SalesPgInfoResult[]>("GET", "/api/open/sales/PG_info", { data });
}

export interface ExchangeInfo {
  originItem: string;
  originColor: string;
  originSize: string;
  exchangedItem: string;
  exchangedColor: string;
  exchangedSize: string;
  qty: string;
}

export interface Exchange {
  /** format: yyyyMMdd (ex.20191231) */
  salesDate: string;
  shopCode: string;
  shopName: string;
  receiptNo: string;
  exchangeInfo: ExchangeInfo[];
}

export interface ExchangeGetRequest {
  /** format: yyyyMMdd (ex.20191231) */
  date: string;
  shop?: string;
  /** 1: 전체, 2: 마지막교환데이터 */
  gubn: "1" | "2";
}

export async function getExchange(data: ExchangeGetRequest): Promise<Exchange[]> {
  return playMdRequest<Exchange[]>("GET", "/api/open/exchange", { data });
}

export interface ExchangeBalanceDetail {
  productCode: string;
  productName: string;
  colorCode: string;
  colorName: string;
  sizeCode: string;
  sizeName: string;
  barcode: string[];
  seq: number;
  tagPrice: number;
  salesPrice: number;
  paymentPrice: number;
  discount: number;
  /** negative for the returned item, positive for the received item */
  qty: number;
  costPrice: number;
  avgCostPrice: number;
  margin: number;
  interimManagementFees: number;
  supplierName: string;
  brandName: string;
  /** format: yyyyMMdd (ex.20191231) */
  firstReleaseDate: string;
}

export interface ExchangeBalance {
  /** format: yyyyMMdd (ex.20191231) */
  salesDate: string;
  shopCode: string;
  /** 1: 판매, 2: 환불 */
  salesType: "1" | "2";
  receiptNo: string;
  plannedAmount: number;
  discountAmount: number;
  paymentAmount: number;
  customerId: string;
  customerName: string;
  earningPoints: number;
  payments: SalesPayments;
  externalCustomerId?: string;
  /** only present for refund receipts */
  prevReceiptNo?: string;
  /** format: yyyy-MM-dd HH:mm:ss.fff */
  salesDateTime: string;
  externalOrderId?: string;
  desc: string;
  detail: ExchangeBalanceDetail[];
}

export interface ExchangeBalanceGetRequest {
  /** format: yyyyMMdd (ex.20191231) */
  date: string;
  shop: string;
  receipt?: string;
}

export async function getExchangeBalance(data: ExchangeBalanceGetRequest): Promise<ExchangeBalance[]> {
  return playMdRequest<ExchangeBalance[]>("GET", "/api/open/exchange/balance", { data });
}

export interface TaxFreePassportInfo {
  /** space-padded fixed-length field; not trimmed by the API */
  passportNum: string;
  passportName: string;
  passportNation: string;
  /** F / M */
  passportSex: "F" | "M" | "";
  /** format: yyMMdd (ex.001231) */
  passportBirth: string;
}

export interface TaxFreeInfo {
  receiptNo: string;
  /** 1: 판매, 2: 환불 */
  salesType: "1" | "2";
  /** format: yyyyMMdd (ex.20191231) */
  salesDate: string;
  /** 1: 즉시, 2: 사후 */
  refundGubn: "1" | "2";
  /** creditCard + cash + easyPay */
  paymentAmount: string;
  refundAmount: string;
  /** only present for refund receipts */
  prevReceiptNo?: string;
  authNo: string;
  /** format: yyyy-MM-dd HH:mm:ss */
  salesDateTime: string;
  taxFreeNo: string;
  PassportInfo: TaxFreePassportInfo[];
}

export interface TaxFreeInfoGetRequest {
  /** format: yyyyMMdd (ex.20191231) */
  from: string;
  /** format: yyyyMMdd (ex.20191231) */
  to: string;
  shop: string;
  receipt?: string;
  /** 1: 즉시, 2: 사후 */
  gubn?: "1" | "2";
}

export async function getTaxFreeInfo(data: TaxFreeInfoGetRequest): Promise<TaxFreeInfo[]> {
  return playMdRequest<TaxFreeInfo[]>("GET", "/api/open/sales/taxFree_info", { data });
}
