import { playMdRequest } from "../client.js";

export interface SupplierRegisterRequest {
  supplierCode: string;
  supplierName: string;
  supplierType: string;
  companyNumber?: string;
  coperateNumber?: string;
  repName?: string;
  repTelNumber?: string;
  repFaxNumber?: string;
  repMobileNumber?: string;
  zipCode?: string;
  address?: string;
  addressDetail?: string;
  businessType?: string;
  businessCategory?: string;
  bank?: string;
  bankAccount?: string;
  bankAccountName?: string;
}

export interface SupplierUpdateRequest extends SupplierRegisterRequest {}

export interface Supplier {
  supplierCode: string;
  supplierName: string;
  supplierType: string;
  companyNumber?: string;
  coperateNumber?: string;
  repName?: string;
  repTelNumber?: string;
  repFaxNumber?: string;
  repMobileNumber?: string;
  zipCode?: string;
  address?: string;
  addressDetail?: string;
  businessType?: string;
  businessCategory?: string;
  bank?: string;
  bankAccount?: string;
  bankAccountName?: string;
}

export interface SupplierGetRequest {
  supplierCode?: string;
}

// NOTE: The vendor's Notion doc for this endpoint ("(딥) 거래처 등록", api/open/productMaster)
// has empty Request/Response tables and no example payload. This shape is inferred from the
// plain "거래처 등록" (POST /api/open/supplier) endpoint as a best guess and should be confirmed
// against the actual SAP sync contract before use.
export interface DeepSupplierSyncRequest {
  supplierCode: string;
  supplierName: string;
  supplierType: string;
  companyNumber?: string;
  coperateNumber?: string;
  repName?: string;
  repTelNumber?: string;
  repFaxNumber?: string;
  repMobileNumber?: string;
  zipCode?: string;
  address?: string;
  addressDetail?: string;
  businessType?: string;
  businessCategory?: string;
  bank?: string;
  bankAccount?: string;
  bankAccountName?: string;
}

export async function createDeepSupplier(data: DeepSupplierSyncRequest): Promise<void> {
  await playMdRequest<void>("POST", "api/open/productMaster", { data });
}

export async function getSupplier(data: SupplierGetRequest = {}): Promise<Supplier[]> {
  return playMdRequest<Supplier[]>("GET", "/api/open/supplier", { data });
}

export async function createSupplier(data: SupplierRegisterRequest[]): Promise<void> {
  await playMdRequest<void>("POST", "/api/open/supplier", { data });
}

export async function updateSupplier(data: SupplierUpdateRequest[]): Promise<void> {
  await playMdRequest<void>("PUT", "/api/open/supplier", { data });
}
