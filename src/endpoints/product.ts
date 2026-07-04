import { playMdRequest } from "../client.js";

export type UseYn = "Y" | "N";

/** searchType 1: 기본 리스트 / 2: 세부코드 포함 / 3: 칼라,사이즈,바코드 포함 (미포함시 기본값 1) */
export type ProductSearchType = "1" | "2" | "3";

export interface ProductGetRequest {
  useYN?: UseYn | "";
  supplierCode?: string;
  productCode?: string;
  searchType?: ProductSearchType;
  colorCode?: string;
  sizeCode?: string;
  /** PlayMD에서 생성된 자체바코드 */
  barcode?: string;
  /** 상품바코드 수정을 통해 저장된 바코드1 */
  barcode1?: string;
  /** 상품바코드 수정을 통해 저장된 바코드2 */
  barcode2?: string;
}

export interface ProductSubCode {
  BR?: string;
  ST?: string;
  SE?: string;
  YY?: string;
  SS?: string;
  GB?: string;
  HG?: string;
  DI?: string;
  [code: string]: string | undefined;
}

export interface Product {
  useYN: string;
  supplierCode: string;
  supplierName: string;
  storageLocation: string;
  productCode: string;
  productName: string;
  planningCategory: string;
  itemCode: string;
  designerCode: string;
  productionCountry: string;
  tagPrice: string;
  currentPrice: string;
  costPrice: string;
  /** only populated when searchType = 2 or 3 */
  subCode?: ProductSubCode;
  /** only populated when searchType = 3 */
  colorCode?: string;
  colorSize?: string;
  sizeLocation?: string;
  barcode?: string;
  barcode1?: string;
  barcode2?: string;
}

export async function getProduct(data: ProductGetRequest = {}): Promise<Product[]> {
  return playMdRequest<Product[]>("GET", "/api/open/product", { data });
}

export interface ProductSizeOption {
  sizeCode: string;
  sizeName: string;
  /** 사이즈패턴을 가로로 표현했을때 해당 사이즈의 위치, 예: S,M,L,XL 중 L은 3 */
  position: number;
  /** 최대 2개까지 입력가능 */
  barcode: string[];
}

export interface ProductColorOption {
  colorCode: string;
  colorName: string;
  sizeOptions: ProductSizeOption[];
}

export interface ProductCreateRequest {
  productCode: string;
  productName: string;
  sizePattern: string;
  sizePatternName: string;
  colorOptions: ProductColorOption[];
  /** 천만원 단위까지 입력가능 */
  tagPrice: number;
  /** 천만원 단위까지 입력가능 */
  salesPrice: number;
  /** 천만원 단위까지 입력가능 */
  costPrice: number;
  useYn: UseYn;
  /** 국가코드표(countryCode.ts) 참조 또는 고객사에서 사용중인 코드 입력 */
  madeCountryCode?: string;
  madeCountryName?: string;
}

/** 옵션추가 시 상품조회를 통해 정확한 값을 입력해주세요. 1회 요청당 100건 이하만 가능(초과 시 500 에러). */
export async function createProduct(data: ProductCreateRequest[]): Promise<void> {
  await playMdRequest<void>("POST", "/api/open/product", { data });
}

export interface ProductSizeOptionV2 {
  sizeCode: string;
  sizeName: string;
  /** 최대 2개까지 입력가능 */
  barcode: string[];
  /** 입력시 현재 시점(분단위)~999912312359 까지 가격변동 데이터 생성 */
  sizePrice?: number;
}

export interface ProductColorOptionV2 {
  colorCode: string;
  colorName: string;
  sizeOptions: ProductSizeOptionV2[];
}

export interface ProductCreateRequestV2 {
  productCode: string;
  productName: string;
  sizePattern: string;
  sizePatternName: string;
  colorOptions: ProductColorOptionV2[];
  tagPrice: number;
  salesPrice: number;
  costPrice: number;
  useYn: UseYn;
  madeCountryCode?: string;
  madeCountryName?: string;
}

/**
 * Recommended version of product create/option-add — same endpoint contract as v1
 * (createProduct) but drops the manual sizeOptions.position field (auto-assigned by
 * sequence, or by pattern order for unknown sizePattern/sizeCode) and adds optional
 * per-size sizePrice. The v1 endpoint remains usable per the vendor's doc, but v2 is
 * the newer, less error-prone option and should be preferred for new integrations.
 * 옵션추가 시 상품조회를 통해 정확한 값을 입력해주세요. 1회 요청당 100건 이하만 가능(초과 시 500 에러).
 * 사이즈 패턴 당 최대 99개 사이즈 코드까지 등록 가능.
 */
export async function createProductV2(data: ProductCreateRequestV2[]): Promise<void> {
  await playMdRequest<void>("POST", "/api/open/product/v2", { data });
}

export interface ProductBarcodeUpdateFields {
  barcode1?: string;
  barcode2?: string;
}

export interface ProductBarcodeUpdateRequest {
  /** 바코드(barcode) 입력 시 필수 아님 */
  productCode?: string;
  colorCode?: string;
  sizeCode?: string;
  /** 입력 시 productCode/colorCode/sizeCode는 무시됨 */
  barcode?: string;
  updateBarcode: ProductBarcodeUpdateFields;
}

export async function updateProductBarcode(data: ProductBarcodeUpdateRequest[]): Promise<void> {
  await playMdRequest<void>("PUT", "/api/open/product/barcode", { data });
}

export interface ProductUpdateRequest {
  productName: string;
  productCode: string;
  tagPrice: number;
  salesPrice: number;
  /** 지정한 일자부터 변경된 판매가가 적용됩니다. format: yyyyMMdd */
  applyDate: string;
  costPrice: number | string;
  useYn: UseYn;
  madeCountryCode?: string;
  madeCountryName?: string;
}

/**
 * 변경하지 않을 값도 상품조회를 통해 같이 기입해주셔야 합니다 — fields you omit are not
 * left untouched, so fetch the current product via getProduct first and pass its values
 * back for anything you don't intend to change.
 */
export async function updateProduct(data: ProductUpdateRequest): Promise<void> {
  await playMdRequest<void>("PUT", "/api/open/product", { data });
}

export interface ProductDeleteRequest {
  productCode: string;
}

export async function deleteProduct(data: ProductDeleteRequest): Promise<void> {
  await playMdRequest<void>("DELETE", "/api/open/product", { data });
}

export interface ProductPriceGetRequest {
  shop: string;
  /** format: yyyyMMdd */
  date: string;
  productCode?: string;
}

export interface ProductPrice {
  productCode: string;
  productName: string;
  tagPrice: string;
  salesPrice: string;
  eventCode: string;
  eventName: string;
  /** 마진 제외한 판매가 */
  salesPriceWithoutMargin: string;
  /** format: yyyyMMdd */
  startDate: string;
  /** format: yyyyMMdd */
  finishDate: string;
  description: string;
}

export async function getProductPrice(data: ProductPriceGetRequest): Promise<ProductPrice[]> {
  // Unlike most endpoints in this API, the vendor's own example for this one is a query
  // string (?shop=A0011&date=...) rather than a JSON body — modeled here as query params.
  // Live-tested against the test tenant on 2026-07-04: the current API key/tenant gets HTTP 401
  // "Member.사용 권한이 없습니다" (no usage permission) even with a well-formed request — this
  // endpoint needs to be enabled for the account by the vendor before it will work.
  return playMdRequest<ProductPrice[]>("GET", "/api/open/product_price", {
    params: data as unknown as Record<string, unknown>,
  });
}

/** godcd:상품 / godcr:칼라 / godsz:사이즈 / godset:세트 */
export type ProductPriceChangeGubn = "godcd" | "godcr" | "godsz" | "godset";

export interface ProductPriceChangeRequest {
  changeGubn: ProductPriceChangeGubn;
  /** changeGubn이 godcd, godcr, godsz 인경우 필수 */
  productCode?: string;
  /** changeGubn이 godcr, godsz 인경우 필수 */
  productColor?: string;
  /** changeGubn이 godsz 인경우 필수 */
  productSize?: string;
  /** changeGubn이 godsz 인경우에만 입력가능. 입력시 productCode/productColor/productSize 생략가능 */
  productBarcode?: string;
  /** 0: 전매장 / 1: 매장 */
  shopType: "0" | "1";
  /** shopType이 1인 경우 필수 */
  shopCode?: string;
  /** format: yyyyMMddHHmm — 2400은 다음날 0000으로 등록 (예: 202404012400 -> 202404020000) */
  changeStartDatetime: string;
  /** format: yyyyMMddHHmm */
  changeEndDatetime: string;
  changeDetail?: string;
  newPrice: number;
}

export async function createProductPriceChange(data: ProductPriceChangeRequest[]): Promise<void> {
  await playMdRequest<void>("POST", "/api/open/product_price/v2", { data });
}

export interface ProductPriceChangeGetRequest {
  /** 1: 현재시간으로 조회 / 2: searchTime으로 조회 */
  timeType: "1" | "2";
  /** timeType이 2인 경우 필수, format: yyyyMMddHHmm */
  searchTime?: string;
  /** 멀티바코드 중 하나로 조회가능 */
  barcode: string;
  shopCode: string;
  /** 1: 제일 최근 등록된 내용만 조회 / 2: 해당 시간에 등록된 모든 데이터 조회 (기본값 1) */
  returnType?: "1" | "2";
}

export interface ProductPriceChange {
  /** returnType이 2인 경우, 조회번호 1번의 변동가가 현재가 */
  rowNum: string;
  uniqueId: string;
  /** format: yyyyMMddHHmm */
  startTime: string;
  /** format: yyyyMMddHHmm */
  endTime: string;
  shopCode: string;
  /** 멀티바코드 조회 결과 */
  barcode: string[];
  changePrice: string;
  detail: string;
}

export async function getProductPriceChange(
  data: ProductPriceChangeGetRequest
): Promise<ProductPriceChange[]> {
  return playMdRequest<ProductPriceChange[]>("GET", "/api/open/product_price/v2", { data });
}
