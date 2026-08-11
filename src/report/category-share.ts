import { writeFileSync } from "node:fs";
import { getSalesDetailInfo } from "../endpoints/index.js";

// 사용법: npx tsx src/report/category-share.ts <fromDate> <toDate>
// 예:    npx tsx src/report/category-share.ts 2026-04-01 2026-06-30
// 국적 구분 없이(전체 오프라인 매장 전체 고객) 스타일 카테고리별 매출비중을 계산한다.
const FROM = process.argv[2];
const TO = process.argv[3];
if (!FROM || !TO) {
  console.error("사용법: npx tsx src/report/category-share.ts <fromDate:YYYY-MM-DD> <toDate:YYYY-MM-DD>");
  process.exit(1);
}

const STYLE_NAMES: Record<string, string> = {
  AP: "어패럴",
  AU: "부자재(비매품)",
  AW: "액티브웨어",
  BR: "브라",
  BRT: "브라탑",
  EW: "이지웨어",
  FA: "패션잡화",
  GS: "굿즈",
  IW: "이너웨어",
  PT: "팬티",
  UW: "언더웨어",
};

function styleOf(productCode: string): string {
  const m = productCode.slice(3).match(/^[A-Za-z]+/);
  const code = m?.[0]?.toUpperCase();
  return (code && STYLE_NAMES[code]) || "기타";
}

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

interface Agg {
  qty: number;
  amount: number;
}
function bump(map: Map<string, Agg>, key: string, qty: number, amount: number) {
  const cur = map.get(key) ?? { qty: 0, amount: 0 };
  cur.qty += qty;
  cur.amount += amount;
  map.set(key, cur);
}

// yyyy-mm 단위로 월별 집계도 같이 낸다.
function monthKeyOf(salesDateYyyyMmDd: string): string {
  return `${salesDateYyyyMmDd.slice(0, 4)}-${salesDateYyyyMmDd.slice(4, 6)}`;
}

async function main() {
  console.log(`기간: ${FROM} ~ ${TO} (전체 매장, 국적 구분 없음)`);
  const detailWindows = splitWindows(FROM, TO, 3);

  const byCategoryTotal = new Map<string, Agg>();
  const byMonthCategory = new Map<string, Map<string, Agg>>();
  const totalByMonth = new Map<string, Agg>();
  let totalLines = 0;
  let totalAmount = 0;
  let totalQty = 0;

  console.log(`getSalesDetailInfo 총 ${detailWindows.length}건 동시 요청 시작...`);
  const detailResults = await Promise.all(
    detailWindows.map(([start, end]) =>
      getSalesDetailInfo({ fromDate: Number(toYyyyMmDd(start)), toDate: Number(toYyyyMmDd(end)) })
    )
  );

  for (const rows of detailResults) {
    if (!Array.isArray(rows)) {
      console.error("배열이 아닌 응답 수신 (기간 제한 등 API 오류 가능성):", JSON.stringify(rows));
      continue;
    }
    totalLines += rows.length;
    for (const l of rows) {
      const qty = Number(l.qty) || 0;
      const amount = Number(l.totalPaymentPrice) || 0;
      const cat = styleOf(l.productCode);
      const month = monthKeyOf(l.salesDate);

      bump(byCategoryTotal, cat, qty, amount);
      if (!byMonthCategory.has(month)) byMonthCategory.set(month, new Map());
      bump(byMonthCategory.get(month)!, cat, qty, amount);
      bump(totalByMonth, month, qty, amount);

      totalAmount += amount;
      totalQty += qty;
    }
  }

  console.log("\n전체 라인 수:", totalLines, "/ 전체 매출액:", totalAmount, "/ 전체 수량:", totalQty);

  const toSortedWithShare = (map: Map<string, Agg>, denomAmount: number) =>
    [...map.entries()]
      .map(([key, v]) => ({
        key,
        qty: v.qty,
        amount: v.amount,
        amountShare: denomAmount > 0 ? v.amount / denomAmount : null,
      }))
      .sort((a, b) => b.amount - a.amount);

  const overallByCategory = toSortedWithShare(byCategoryTotal, totalAmount);

  const byMonth = [...byMonthCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, catMap]) => {
      const monthTotal = totalByMonth.get(month)!;
      return {
        month,
        totalAmount: monthTotal.amount,
        totalQty: monthTotal.qty,
        byCategory: toSortedWithShare(catMap, monthTotal.amount),
      };
    });

  const result = {
    period: { from: FROM, to: TO },
    totalLines,
    totalAmount,
    totalQty,
    overallByCategory,
    byMonth,
  };

  const outFile = "reports/offline-category-share.json";
  writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  console.log(`\n저장 완료: ${outFile}`);

  console.log("\n=== 전체 기간 카테고리별 매출비중 ===");
  console.table(
    overallByCategory.map((c) => ({
      category: c.key,
      amount: c.amount,
      qty: c.qty,
      share: c.amountShare != null ? `${(c.amountShare * 100).toFixed(2)}%` : "-",
    }))
  );

  console.log("\n=== 월별 브라탑(BRT) 매출비중 ===");
  console.table(
    byMonth.map((m) => {
      const brt = m.byCategory.find((c) => c.key === "브라탑");
      return {
        month: m.month,
        totalAmount: m.totalAmount,
        brtAmount: brt?.amount ?? 0,
        brtShare: brt?.amountShare != null ? `${(brt.amountShare * 100).toFixed(2)}%` : "0.00%",
      };
    })
  );
}

main();
