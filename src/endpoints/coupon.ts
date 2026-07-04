import { playMdRequest } from "../client.js";

export interface UsedCouponGetRequest {
  from: string;
  to: string;
  couponCode?: string;
  couponNo?: string;
  customer?: string;
  shopCode?: string;
}

export interface UsedCoupon {
  couponUsedDate: string;
  couponUsedStore: string;
  couponUsedStoreName: string;
  couponUsedreciept: string;
  couponNo: string;
  customerCode: string | null;
  customerName: string;
  sendPhoneNumber?: string;
  couponCode: string;
  couponName: string;
  /** 3 digits or fewer: discount rate (%), 4+ digits: fixed monetary voucher amount */
  couponPrice: string;
  sendDate: string;
  discountAmount: string;
  registerStore?: string;
  registerStoreName?: string;
}

export async function getUsedCoupon(request: UsedCouponGetRequest): Promise<UsedCoupon[]> {
  return playMdRequest<UsedCoupon[]>("GET", "/api/open/used_coupon", { data: request });
}

export interface SendCouponGetRequest {
  from: string;
  to: string;
  couponCode?: string;
  customer?: string;
  phoneNumber?: string;
}

export interface SendCoupon {
  sendDate: string;
  couponNo: string;
  customerName: string;
  sendPhoneNumber?: string;
  couponCode: string;
  couponName: string;
  /** 3 digits or fewer: discount rate (%), 4+ digits: fixed monetary voucher amount */
  couponPrice: string;
  couponUseYn: "Y" | "N";
  couponUseDate?: string;
  couponStartDate: string;
  couponEndDate: string;
  registerStore?: string;
  registerStoreName?: string;
}

export async function getSendCoupon(request: SendCouponGetRequest): Promise<SendCoupon[]> {
  return playMdRequest<SendCoupon[]>("GET", "/api/open/send_coupon", { data: request });
}
