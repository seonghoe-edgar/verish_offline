import { writeFileSync } from "node:fs";
import { getShop, getTaxFreeInfo, getSalesDetailInfo } from "../endpoints/index.js";

// 사용법: npx tsx src/report/exclude-nation-comparison.ts <제외할 ISO3166-1 alpha-3 국가코드> [fromDate] [toDate]
// 예:    npx tsx src/report/exclude-nation-comparison.ts USA 2026-04-01 2026-06-30
// country-comparison.ts와 동일한 API 패턴이지만, 특정 국적 "만" 보는 게 아니라
// 특정 국적을 "제외한" 나머지 전체 외국인 면세 매출을 집계한다.
const EXCLUDE_NATION = process.argv[2];
if (!EXCLUDE_NATION) {
  console.error("사용법: npx tsx src/report/exclude-nation-comparison.ts <제외국가코드(예: USA)> [fromDate] [toDate]");
  process.exit(1);
}
const TO = process.argv[4] ?? new Date().toISOString().slice(0, 10);
const FROM = process.argv[3] ?? (() => {
  const d = new Date(`${TO}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d.toISOString().slice(0, 10);
})();

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
  receipts: Set<string>;
}
function bump(map: Map<string, Agg>, key: string, qty: number, amount: number, receiptNo: string) {
  const cur = map.get(key) ?? { qty: 0, amount: 0, receipts: new Set<string>() };
  cur.qty += qty;
  cur.amount += amount;
  cur.receipts.add(receiptNo);
  map.set(key, cur);
}

async function main() {
  console.log(`제외 국가: ${EXCLUDE_NATION} / 기간: ${FROM} ~ ${TO}`);
  const shops = (await getShop()).filter((s) => !["CAFE24", "TEST"].includes(s.shopCode));
  console.log(`대상 매장 ${shops.length}개:`, shops.map((s) => s.shopCode).join(", "));

  const taxWindows = splitWindows(FROM, TO, 4);
  const taxJobs = shops.flatMap((shop) => taxWindows.map((window) => ({ shop: shop.shopCode, window })));
  console.log(`taxFreeInfo 총 ${taxJobs.length}건 동시 요청 시작...`);
  let taxDone = 0;
  // receiptNo -> 그 영수증에 찍힌 국적들(보통 1개)
  const receiptNations = new Map<string, Set<string>>();
  await Promise.all(
    taxJobs.map(async ({ shop, window: [start, end] }) => {
      const rows = await getTaxFreeInfo({ from: toYyyyMmDd(start), to: toYyyyMmDd(end), shop });
      for (const r of rows) {
        for (const p of r.PassportInfo ?? []) {
          const set = receiptNations.get(r.receiptNo) ?? new Set<string>();
          set.add(p.passportNation);
          receiptNations.set(r.receiptNo, set);
        }
      }
      taxDone++;
      if (taxDone % 30 === 0) console.log(`taxFreeInfo ${taxDone}/${taxJobs.length}...`);
    })
  );
  // 제외 국가를 제외한 나머지 외국인 면세 영수증만 채택
  const keptReceipts = new Set<string>();
  for (const [receiptNo, nations] of receiptNations) {
    const hasOther = [...nations].some((n) => n !== EXCLUDE_NATION);
    if (hasOther) keptReceipts.add(receiptNo);
  }
  console.log(`${EXCLUDE_NATION} 제외 외국인 면세 영수증 수:`, keptReceipts.size, `(전체 면세 영수증:`, receiptNations.size, ")");

  const detailWindows = splitWindows(FROM, TO, 3);
  const byCategory = new Map<string, Agg>();
  const byProduct = new Map<string, Agg>();
  let totalLines = 0;
  let keptLines = 0;

  console.log(`getSalesDetailInfo 총 ${detailWindows.length}건 동시 요청 시작...`);
  const detailResults = await Promise.all(
    detailWindows.map(([start, end]) =>
      getSalesDetailInfo({ fromDate: Number(toYyyyMmDd(start)), toDate: Number(toYyyyMmDd(end)) })
    )
  );
  for (const rows of detailResults) {
    totalLines += rows.length;
    for (const l of rows) {
      const compositeReceiptNo = `${l.shopCode}${l.salesDate}${l.receiptNo}`;
      if (!keptReceipts.has(compositeReceiptNo)) continue;
      keptLines++;
      const qty = Number(l.qty) || 0;
      const amount = Number(l.totalPaymentPrice) || 0;
      const cat = styleOf(l.productCode);
      const productKey = `${l.productCode} | ${l.productName}`;

      bump(byCategory, cat, qty, amount, l.receiptNo);
      bump(byProduct, `${cat} > ${productKey}`, qty, amount, l.receiptNo);
    }
  }

  console.log("\n전체 라인 수:", totalLines, `/ ${EXCLUDE_NATION} 제외 라인 수:`, keptLines);

  const toSorted = (map: Map<string, Agg>) =>
    [...map.entries()]
      .map(([key, v]) => ({ key, qty: v.qty, amount: v.amount, receiptCount: v.receipts.size }))
      .sort((a, b) => b.amount - a.amount);

  const result = {
    excludeNation: EXCLUDE_NATION,
    period: { from: FROM, to: TO },
    keptReceiptCount: keptReceipts.size,
    totalLines,
    keptLines,
    byCategory: toSorted(byCategory),
    byProduct: toSorted(byProduct),
  };

  const outFile = `reports/offline-exclude-${EXCLUDE_NATION.toLowerCase()}-breakdown.json`;
  writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  console.log(`\n저장 완료: ${outFile}`);
  console.log("\n=== 카테고리별 ===");
  console.table(result.byCategory);
  console.log("\n=== 상위 30개 상품(브라탑) ===");
  console.table(result.byProduct.filter((p) => p.key.startsWith("브라탑")).slice(0, 30));
}

main();
