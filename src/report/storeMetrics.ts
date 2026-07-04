import { getSalesDetailInfo, getTaxFreeInfo } from "../endpoints/index.js";
import { getDashboardData } from "../mash/index.js";

export interface DailyStoreMetrics {
  date: string; // YYYY-MM-DD
  visitors: number;
  receiptCount: number;
  conversionRate: number | null;
  totalQty: number;
  totalTagPrice: number;
  totalSalesPrice: number;
  discountAmount: number;
  totalPaymentAmount: number;
  foreignSalesAmount: number;
  foreignSalesRatio: number | null;
  aov: number | null;
  upt: number | null;
}

function toYyyyMmDd(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

function enumerateDates(fromIso: string, toIso: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// getSalesDetailInfo(최대 3일)와 getTaxFreeInfo(최대 4일)는 조회 기간 제한이 있어
// 초과 시 배열 대신 평문 에러 문자열을 HTTP 200으로 반환한다 — 반드시 청크로 쪼개서 호출한다.
function splitIntoWindows(fromIso: string, toIso: string, maxDays: number): [string, string][] {
  const windows: [string, string][] = [];
  let cursor = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  while (cursor <= end) {
    const windowEnd = new Date(cursor.valueOf());
    windowEnd.setUTCDate(windowEnd.getUTCDate() + maxDays - 1);
    if (windowEnd > end) windowEnd.setTime(end.getTime());
    windows.push([cursor.toISOString().slice(0, 10), windowEnd.toISOString().slice(0, 10)]);
    cursor = new Date(windowEnd.valueOf());
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return windows;
}

function assertArray<T>(value: T[], context: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context}: 배열이 아닌 응답을 받음 (기간 제한 등 API 오류 가능성) -> ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * 검증된 지표 공식 (2026-06-19 애월 매장 실데이터로 대조, 100% 일치):
 * - 영수증 건수 = getSalesDetailInfo 라인들의 고유 receiptNo 수
 * - 총 정상가/판매금액/실결제금액 = getSalesDetailInfo의 totalTagPrice/totalSalesPrice/totalPaymentPrice 합
 * - 매출 할인 = (총 정상가 - 총 판매금액) + taxFree 합계 (taxFree는 즉시할인식 면세 차감액, 외국인 매출 아님)
 * - 외국인 매출 = getTaxFreeInfo paymentAmount 합 (salesType="2" 환불 건은 음수 처리)
 *
 * mAsh는 한 번의 호출로 최대 3개월까지만 지원 — 이 함수는 그 이상 범위를 아직 분할하지 않는다.
 */
export async function getDailyStoreMetrics(
  shopCode: string,
  mashPlace: string,
  fromDateIso: string,
  toDateIso: string
): Promise<DailyStoreMetrics[]> {
  const detailInfoWindows = splitIntoWindows(fromDateIso, toDateIso, 3);
  const taxFreeWindows = splitIntoWindows(fromDateIso, toDateIso, 4);

  const [detailChunks, taxFreeChunks, dashboard] = await Promise.all([
    Promise.all(
      detailInfoWindows.map(async ([start, end]) =>
        assertArray(
          await getSalesDetailInfo({
            fromDate: Number(toYyyyMmDd(start)),
            toDate: Number(toYyyyMmDd(end)),
            shopCode,
          }),
          "getSalesDetailInfo"
        )
      )
    ),
    Promise.all(
      taxFreeWindows.map(async ([start, end]) =>
        assertArray(
          await getTaxFreeInfo({ from: toYyyyMmDd(start), to: toYyyyMmDd(end), shop: shopCode }),
          "getTaxFreeInfo"
        )
      )
    ),
    getDashboardData({
      dashboardUid: requiredEnv("MASH_DASHBOARD_UID"),
      startDate: fromDateIso,
      endDate: toDateIso,
    }),
  ]);
  const detailInfo = detailChunks.flat();
  const taxFreeInfo = taxFreeChunks.flat();

  const visitorsByDate = new Map<string, number>();
  for (const widget of Object.values(dashboard.widgets)) {
    if (widget.name !== "일별 매장 방문 횟수") continue;
    for (const record of widget.data.records as any[]) {
      if (record.place === mashPlace) visitorsByDate.set(record.place_enter_daily, record.total_count);
    }
  }

  const toIsoDate = (yyyyMmDd: string) =>
    `${yyyyMmDd.slice(0, 4)}-${yyyyMmDd.slice(4, 6)}-${yyyyMmDd.slice(6, 8)}`;

  const linesByDate = new Map<string, typeof detailInfo>();
  for (const line of detailInfo) {
    const date = toIsoDate(line.salesDate);
    if (!linesByDate.has(date)) linesByDate.set(date, []);
    linesByDate.get(date)!.push(line);
  }

  const taxFreeByDate = new Map<string, typeof taxFreeInfo>();
  for (const t of taxFreeInfo) {
    const date = toIsoDate(t.salesDate);
    if (!taxFreeByDate.has(date)) taxFreeByDate.set(date, []);
    taxFreeByDate.get(date)!.push(t);
  }

  return enumerateDates(fromDateIso, toDateIso).map((date) => {
    const lines = linesByDate.get(date) ?? [];
    const receiptCount = new Set(lines.map((l) => l.receiptNo)).size;
    const totalQty = lines.reduce((sum, l) => sum + Number(l.qty), 0);
    const totalTagPrice = lines.reduce((sum, l) => sum + Number(l.totalTagPrice || 0), 0);
    const totalSalesPrice = lines.reduce((sum, l) => sum + Number(l.totalSalesPrice || 0), 0);
    const totalPaymentAmount = lines.reduce((sum, l) => sum + Number(l.totalPaymentPrice || 0), 0);
    const taxFreeDiscountNet = lines.reduce((sum, l) => sum + Number(l.taxFree || 0), 0);
    const discountAmount = totalTagPrice - totalSalesPrice + taxFreeDiscountNet;

    const foreignSalesAmount = (taxFreeByDate.get(date) ?? []).reduce(
      (sum, t) => sum + (t.salesType === "2" ? -Number(t.paymentAmount) : Number(t.paymentAmount)),
      0
    );

    const visitors = visitorsByDate.get(date) ?? 0;

    return {
      date,
      visitors,
      receiptCount,
      conversionRate: visitors > 0 ? receiptCount / visitors : null,
      totalQty,
      totalTagPrice,
      totalSalesPrice,
      discountAmount,
      totalPaymentAmount,
      foreignSalesAmount,
      foreignSalesRatio: totalPaymentAmount > 0 ? foreignSalesAmount / totalPaymentAmount : null,
      aov: receiptCount > 0 ? totalPaymentAmount / receiptCount : null,
      upt: receiptCount > 0 ? totalQty / receiptCount : null,
    };
  });
}
