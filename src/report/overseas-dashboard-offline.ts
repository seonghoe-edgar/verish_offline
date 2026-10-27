import { writeFileSync } from "node:fs";
import { getTaxFreeInfo, type TaxFreeInfo } from "../endpoints/index.js";

// 사용법: npx tsx src/report/overseas-dashboard-offline.ts <fromDate> <toDate>
// 예:    npx tsx src/report/overseas-dashboard-offline.ts 2026-01-01 2026-09-30
//
// 목적: "해외 고객 매출 대시보드" 아티팩트의 오프라인(PlayMD) 섹션(2·4·5) 원천 데이터.
// - 매출 = 면세 영수증의 (paymentAmount - refundAmount) 합. 환불 영수증은 API가 음수로 주므로 그대로 더한다.
// - 주문 = 같은 매장·같은 날·같은 여권(국적+성별+생년월일 — passportNum은 API가 비워서 줌)으로 묶은 영수증 묶음.
// - 대리구매 허들 = 국적별 주문금액 p95를 만원 단위 반올림, 주문금액 >= 허들이면 대리구매 추정.
// 출력: reports/overseas-dashboard-offline-<from>_<to>.json — 대시보드 DATA의 해당 키들
const FROM = process.argv[2];
const TO = process.argv[3];
if (!FROM || !TO) throw new Error("fromDate, toDate 필요 (yyyy-MM-dd)");
const SHOPS = ["VRAGFS", "VRDSFS", "VRJAFS", "VRMDFS", "VRNJFS", "VRSSFS", "VRESFS"];
const NATIONS = ["TWN", "CHN", "USA", "AUS", "SGP", "JPN", "CAN", "MYS", "GBR"]; // 그 외는 OTHER
const PERCENTILE = 0.95;
const MIN_N = 200;

function toYyyyMmDd(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

function splitWindows(fromIso: string, toIso: string, maxDays: number): [string, string][] {
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

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

async function main() {
  const windows = splitWindows(FROM, TO, 4);
  const jobs = SHOPS.flatMap((shop) => windows.map((window) => ({ shop, window })));
  console.log(`taxFreeInfo 총 ${jobs.length}건 요청...`);
  const receipts: (TaxFreeInfo & { shop: string })[] = [];
  let failed = 0;
  await Promise.all(
    jobs.map(async ({ shop, window: [start, end] }) => {
      const rows = await getTaxFreeInfo({ from: toYyyyMmDd(start), to: toYyyyMmDd(end), shop }).catch(() => null);
      if (Array.isArray(rows)) receipts.push(...rows.map((r) => ({ ...r, shop })));
      else failed++;
    })
  );
  console.log(`영수증 ${receipts.length}건 (실패/비배열 응답 ${failed}건)`);
  if (failed) throw new Error("일부 구간 조회 실패 — 재실행 필요");

  const orders = new Map<string, { shop: string; month: string; nation: string; amount: number }>();
  for (const r of receipts) {
    const p = (r.PassportInfo ?? [])[0];
    const rawNation = p?.passportNation?.trim() ?? "";
    const nation = NATIONS.includes(rawNation) ? rawNation : "OTHER";
    const passport = p ? `${rawNation}${p.passportSex}${p.passportBirth}` : `NOPASS-${r.receiptNo}`;
    const key = `${r.shop}|${r.salesDate}|${passport}`;
    const month = `${r.salesDate.slice(0, 4)}-${r.salesDate.slice(4, 6)}`;
    const cur = orders.get(key) ?? { shop: r.shop, month, nation, amount: 0 };
    cur.amount += (Number(r.paymentAmount) || 0) - (Number(r.refundAmount) || 0);
    orders.set(key, cur);
  }
  const list = [...orders.values()];
  const months = [...new Set(list.map((o) => o.month))].sort();

  // 섹션 2: 월 x 매장 x 국적
  const section2: Record<string, Record<string, Record<string, { revenue: number; orders: number }>>> = {};
  for (const m of months) section2[m] = Object.fromEntries(SHOPS.map((s) => [s, {}]));
  for (const o of list) {
    const cell = (section2[o.month][o.shop][o.nation] ??= { revenue: 0, orders: 0 });
    cell.revenue += o.amount;
    cell.orders += 1;
  }

  // 섹션 5: 국적별 허들 + 월별 대리구매
  const statsByNation: Record<string, object> = {};
  const thresholdsByNation: Record<string, number> = {};
  for (const n of [...NATIONS, "OTHER"]) {
    const amts = list.filter((o) => o.nation === n).map((o) => o.amount).sort((a, b) => a - b);
    const p95 = quantile(amts, PERCENTILE);
    const threshold = Math.round(p95 / 10000) * 10000;
    thresholdsByNation[n] = threshold;
    statsByNation[n] = {
      n: amts.length,
      mean: Math.round(amts.reduce((a, b) => a + b, 0) / amts.length),
      p50: Math.round(quantile(amts, 0.5)),
      p90: Math.round(quantile(amts, 0.9)),
      p95: Math.round(p95),
      p99: Math.round(quantile(amts, 0.99)),
      threshold,
      lowConfidence: amts.length < MIN_N,
    };
  }
  const section5: Record<string, Record<string, { totalOrders: number; proxyOrders: number; totalRevenue: number; proxyRevenue: number }>> = {};
  for (const o of list) {
    const isProxy = o.amount >= thresholdsByNation[o.nation];
    for (const n of [o.nation, "ALL"]) {
      const c = ((section5[o.month] ??= {})[n] ??= { totalOrders: 0, proxyOrders: 0, totalRevenue: 0, proxyRevenue: 0 });
      c.totalOrders += 1;
      c.totalRevenue += o.amount;
      if (isProxy) {
        c.proxyOrders += 1;
        c.proxyRevenue += o.amount;
      }
    }
  }
  const pooled = list.map((o) => o.amount).sort((a, b) => a - b);
  const orderValueStatsPooled = {
    mean: Math.round(pooled.reduce((a, b) => a + b, 0) / pooled.length),
    p50: Math.round(quantile(pooled, 0.5)),
    p75: Math.round(quantile(pooled, 0.75)),
    p90: Math.round(quantile(pooled, 0.9)),
    p95: Math.round(quantile(pooled, 0.95)),
    p99: Math.round(quantile(pooled, 0.99)),
    n: pooled.length,
    aboveThresholdPct: (list.filter((o) => o.amount >= thresholdsByNation[o.nation]).length / list.length) * 100,
  };

  const outFile = `reports/overseas-dashboard-offline-${FROM}_${TO}.json`;
  writeFileSync(
    outFile,
    JSON.stringify({ months, thresholdsByNation, statsByNation, orderValueStatsPooled, section2_playmdByMonthShopNation: section2, section5_proxyByMonthNation: section5 }),
    "utf8"
  );
  console.log(`저장 완료: ${outFile} (${list.length} orders)`);
}

main();
