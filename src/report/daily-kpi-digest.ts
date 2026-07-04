import { getShop, getSalesDetailInfo } from "../endpoints/index.js";
import { getDashboardData } from "../mash/index.js";

// 사용법: npx tsx src/report/daily-kpi-digest.ts [targetDateISO]
// targetDateISO 생략 시 어제(로컬 기준). 비교 기준일은 항상 targetDate - 7일(전주 동요일).
const TARGET = process.argv[2] ?? (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
})();

const THRESHOLDS = {
  visitors: 0.25,
  conversionRate: 0.25,
  aov: 0.15,
  paymentAmount: 0.25,
};

// PLAY MD shopCode <-> mAsh place / 한글 매장명 (Slack VOC 로그의 store 값과 동일하게 맞춤)
const STORE_MAP: Record<string, { mashPlace: string; label: string }> = {
  VRAGFS: { mashPlace: "안국", label: "안국" },
  VRDJCS: { mashPlace: "대전", label: "신세계-대전" },
  VRDSFS: { mashPlace: "도산", label: "도산" },
  VREBCS: { mashPlace: "동부산", label: "동부산-아울렛" },
  VRHSCS: { mashPlace: "하남", label: "스타필드-하남" },
  VRJAFS: { mashPlace: "애월", label: "애월" },
  VRMDFS: { mashPlace: "명동", label: "명동" },
  VRNJFS: { mashPlace: "신제주", label: "신제주" },
  VRSSFS: { mashPlace: "성수", label: "성수" },
};

function toYyyyMmDd(iso: string): string {
  return iso.replaceAll("-", "");
}

function sameWeekdayLastWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

interface StoreMetrics {
  visitors: number;
  receipts: number;
  paymentAmount: number;
  conversionRate: number | null;
  aov: number | null;
}

async function fetchDay(dateIso: string): Promise<Map<string, StoreMetrics>> {
  const yyyymmdd = Number(toYyyyMmDd(dateIso));
  // mAsh는 startDate===endDate(하루짜리 범위)면 빈 배열을 반환하는 버그가 있어
  // 하루를 더 넣어 조회한 뒤 원하는 날짜의 레코드만 걸러낸다.
  const mashRangeEnd = new Date(`${dateIso}T00:00:00Z`);
  mashRangeEnd.setUTCDate(mashRangeEnd.getUTCDate() + 1);

  const [detailInfo, dashboard] = await Promise.all([
    getSalesDetailInfo({ fromDate: yyyymmdd, toDate: yyyymmdd }),
    getDashboardData({
      dashboardUid: process.env.MASH_DASHBOARD_UID!,
      startDate: dateIso,
      endDate: mashRangeEnd.toISOString().slice(0, 10),
    }),
  ]);

  const visitorsByPlace = new Map<string, number>();
  for (const widget of Object.values(dashboard.widgets)) {
    if (widget.name !== "일별 매장 방문 횟수") continue;
    for (const record of widget.data.records as any[]) {
      if (record.place_enter_daily !== dateIso) continue;
      visitorsByPlace.set(record.place, record.total_count);
    }
  }

  const receiptsByShop = new Map<string, Set<string>>();
  const paymentByShop = new Map<string, number>();
  for (const line of detailInfo) {
    if (!receiptsByShop.has(line.shopCode)) receiptsByShop.set(line.shopCode, new Set());
    receiptsByShop.get(line.shopCode)!.add(line.receiptNo);
    paymentByShop.set(line.shopCode, (paymentByShop.get(line.shopCode) ?? 0) + Number(line.totalPaymentPrice || 0));
  }

  const result = new Map<string, StoreMetrics>();
  for (const [shopCode, { mashPlace }] of Object.entries(STORE_MAP)) {
    const visitors = visitorsByPlace.get(mashPlace) ?? 0;
    const receipts = receiptsByShop.get(shopCode)?.size ?? 0;
    const paymentAmount = paymentByShop.get(shopCode) ?? 0;
    result.set(shopCode, {
      visitors,
      receipts,
      paymentAmount,
      conversionRate: visitors > 0 ? receipts / visitors : null,
      aov: receipts > 0 ? paymentAmount / receipts : null,
    });
  }
  return result;
}

function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return (cur - prev) / prev;
}

function flag(change: number | null, threshold: number): string {
  if (change === null) return "";
  return Math.abs(change) >= threshold ? " ⚠️" : "";
}

function fmtPct(change: number | null): string {
  if (change === null) return "N/A";
  const sign = change >= 0 ? "+" : "";
  return `${sign}${(change * 100).toFixed(1)}%`;
}

async function main() {
  const compareDate = sameWeekdayLastWeek(TARGET);
  console.log(`대상일: ${TARGET} vs 전주 동요일: ${compareDate}`);

  const [cur, prev] = await Promise.all([fetchDay(TARGET), fetchDay(compareDate)]);

  let totalVisitorsCur = 0, totalVisitorsPrev = 0;
  let totalReceiptsCur = 0, totalReceiptsPrev = 0;
  let totalPaymentCur = 0, totalPaymentPrev = 0;

  const rows: string[] = [];
  rows.push("| 매장 | 방문객수 | 전환율 | 객단가 | 실결제액 |");
  rows.push("|---|---|---|---|---|");

  for (const [shopCode, { label }] of Object.entries(STORE_MAP)) {
    const c = cur.get(shopCode)!;
    const p = prev.get(shopCode)!;
    totalVisitorsCur += c.visitors;
    totalVisitorsPrev += p.visitors;
    totalReceiptsCur += c.receipts;
    totalReceiptsPrev += p.receipts;
    totalPaymentCur += c.paymentAmount;
    totalPaymentPrev += p.paymentAmount;

    const visitChange = pctChange(c.visitors, p.visitors);
    const convChange = pctChange(c.conversionRate, p.conversionRate);
    const aovChange = pctChange(c.aov, p.aov);
    const payChange = pctChange(c.paymentAmount, p.paymentAmount);

    rows.push(
      `| ${label} | ${c.visitors.toLocaleString()} (${fmtPct(visitChange)}${flag(visitChange, THRESHOLDS.visitors)}) ` +
        `| ${c.conversionRate ? (c.conversionRate * 100).toFixed(1) + "%" : "N/A"} (${fmtPct(convChange)}${flag(convChange, THRESHOLDS.conversionRate)}) ` +
        `| ${c.aov ? Math.round(c.aov).toLocaleString() + "원" : "N/A"} (${fmtPct(aovChange)}${flag(aovChange, THRESHOLDS.aov)}) ` +
        `| ${c.paymentAmount.toLocaleString()}원 (${fmtPct(payChange)}${flag(payChange, THRESHOLDS.paymentAmount)}) |`
    );
  }

  const totalConvCur = totalVisitorsCur > 0 ? totalReceiptsCur / totalVisitorsCur : null;
  const totalConvPrev = totalVisitorsPrev > 0 ? totalReceiptsPrev / totalVisitorsPrev : null;
  const totalAovCur = totalReceiptsCur > 0 ? totalPaymentCur / totalReceiptsCur : null;
  const totalAovPrev = totalReceiptsPrev > 0 ? totalPaymentPrev / totalReceiptsPrev : null;

  console.log("\n" + rows.join("\n"));

  console.log("\n=== 전체 합계 ===");
  console.log("방문객수:", totalVisitorsCur, `(${fmtPct(pctChange(totalVisitorsCur, totalVisitorsPrev))})`);
  console.log(
    "전환율:",
    totalConvCur ? (totalConvCur * 100).toFixed(1) + "%" : "N/A",
    `(${fmtPct(pctChange(totalConvCur, totalConvPrev))})`
  );
  console.log(
    "객단가:",
    totalAovCur ? Math.round(totalAovCur).toLocaleString() + "원" : "N/A",
    `(${fmtPct(pctChange(totalAovCur, totalAovPrev))})`
  );
  console.log(
    "실결제액:",
    totalPaymentCur.toLocaleString() + "원",
    `(${fmtPct(pctChange(totalPaymentCur, totalPaymentPrev))})`
  );
}

main();
