import { writeFileSync } from "node:fs";
import { getShop, getTaxFreeInfo, getSalesDetailInfo, type SalesDetailInfo } from "../endpoints/index.js";

// 사용법: npx tsx src/report/store-monthly-mix.ts [fromDate] [toDate]
// 예:    npx tsx src/report/store-monthly-mix.ts 2026-09-01 2026-09-28  (기본값: 이번 달 1일 ~ 어제)
//
// 목적: 매장별로 (1) 해외 매출 비중, (2) 국가별 매출 비중, (3) 카테고리별 매출 비중을 한번에 집계.
const TO =
  process.argv[3] ??
  (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1); // 오늘자는 마감 전 데이터라 제외
    return d.toISOString().slice(0, 10);
  })();
const FROM = process.argv[2] ?? `${TO.slice(0, 7)}-01`;

// country-comparison.ts / store-nation-opportunity.ts와 동일한 국적 코드 한계 —
// PLAY MD는 홍콩을 별도 코드로 구분하지 않고 CHN으로 잡히는 것으로 보임.
const NATION_LABEL: Record<string, string> = {
  CHN: "중국(홍콩 포함 추정)",
  TWN: "대만",
  JPN: "일본",
  USA: "미국",
  THA: "태국",
  VNM: "베트남",
  SGP: "싱가포르",
  MYS: "말레이시아",
};
const DOMESTIC_LABEL = "내국인(면세미신청 포함)";

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

interface Bucket {
  qty: number;
  amount: number;
  receipts: Set<string>;
}
function bump(map: Map<string, Bucket>, key: string, qty: number, amount: number, receiptNo: string) {
  const cur = map.get(key) ?? { qty: 0, amount: 0, receipts: new Set<string>() };
  cur.qty += qty;
  cur.amount += amount;
  cur.receipts.add(receiptNo);
  map.set(key, cur);
}

async function main() {
  console.log(`기간: ${FROM} ~ ${TO}`);
  const shops = (await getShop()).filter((s) => !["CAFE24", "TEST"].includes(s.shopCode));
  console.log(`대상 매장 ${shops.length}개:`, shops.map((s) => s.shopCode).join(", "));
  const shopLabel = new Map(shops.map((s) => [s.shopCode, s.shopName]));

  // 1) 매장별 영수증 -> 국적 매핑 (getTaxFreeInfo는 shop 필수라 매장별 루프)
  const taxWindows = splitWindows(FROM, TO, 4);
  const taxJobs = shops.flatMap((shop) => taxWindows.map((window) => ({ shop: shop.shopCode, window })));
  console.log(`taxFreeInfo 총 ${taxJobs.length}건 동시 요청...`);
  const receiptNation = new Map<string, string>(); // compositeReceiptNo(shop+date+seq) -> nation
  let taxDone = 0;
  await Promise.all(
    taxJobs.map(async ({ shop, window: [start, end] }) => {
      const rows = await getTaxFreeInfo({ from: toYyyyMmDd(start), to: toYyyyMmDd(end), shop });
      if (Array.isArray(rows)) {
        for (const r of rows) {
          const nation = (r.PassportInfo ?? [])[0]?.passportNation;
          if (nation) receiptNation.set(r.receiptNo, nation);
        }
      }
      taxDone++;
      if (taxDone % 30 === 0) console.log(`taxFreeInfo ${taxDone}/${taxJobs.length}...`);
    })
  );
  console.log(`국적 확인된 면세 영수증 수: ${receiptNation.size}`);

  // 2) 전체 매장 판매라인
  const detailWindows = splitWindows(FROM, TO, 3);
  console.log(`getSalesDetailInfo 총 ${detailWindows.length}건 동시 요청...`);
  const detailResults = await Promise.all(
    detailWindows.map(([start, end]) =>
      getSalesDetailInfo({ fromDate: Number(toYyyyMmDd(start)), toDate: Number(toYyyyMmDd(end)) })
    )
  );
  const allLines: SalesDetailInfo[] = [];
  for (const rows of detailResults) if (Array.isArray(rows)) allLines.push(...rows);
  console.log(`전체 판매 라인 수: ${allLines.length}`);

  // 3) 매장 x 국적, 매장 x 카테고리 집계
  const storeTotal = new Map<string, Bucket>();
  const storeNation = new Map<string, Map<string, Bucket>>();
  const storeCategory = new Map<string, Map<string, Bucket>>();

  for (const l of allLines) {
    const composite = `${l.shopCode}${l.salesDate}${l.receiptNo}`;
    const nation = receiptNation.get(composite) ?? DOMESTIC_LABEL;
    const qty = Number(l.qty) || 0;
    const amount = Number(l.totalPaymentPrice) || 0;
    const cat = styleOf(l.productCode);

    bump(storeTotal, l.shopCode, qty, amount, l.receiptNo);

    if (!storeNation.has(l.shopCode)) storeNation.set(l.shopCode, new Map());
    bump(storeNation.get(l.shopCode)!, nation, qty, amount, l.receiptNo);

    if (!storeCategory.has(l.shopCode)) storeCategory.set(l.shopCode, new Map());
    bump(storeCategory.get(l.shopCode)!, cat, qty, amount, l.receiptNo);
  }

  const toShareRows = (map: Map<string, Bucket>, denom: number, labelOf: (k: string) => string) =>
    [...map.entries()]
      .map(([key, v]) => ({
        key,
        label: labelOf(key),
        amount: v.amount,
        qty: v.qty,
        receipts: v.receipts.size,
        share: denom > 0 ? v.amount / denom : null,
      }))
      .sort((a, b) => b.amount - a.amount);

  const storeRows = shops
    .map((s) => {
      const total = storeTotal.get(s.shopCode);
      if (!total || total.amount === 0) return null;
      const nationMap = storeNation.get(s.shopCode) ?? new Map();
      const categoryMap = storeCategory.get(s.shopCode) ?? new Map();
      const foreignAmount = [...nationMap.entries()]
        .filter(([nation]) => nation !== DOMESTIC_LABEL)
        .reduce((sum, [, v]) => sum + v.amount, 0);

      return {
        shopCode: s.shopCode,
        shopName: s.shopName,
        totalAmount: total.amount,
        totalQty: total.qty,
        receiptCount: total.receipts.size,
        foreignAmount,
        foreignShare: total.amount > 0 ? foreignAmount / total.amount : null,
        byNation: toShareRows(nationMap, total.amount, (k) => NATION_LABEL[k] ?? (k === DOMESTIC_LABEL ? k : k)),
        byCategory: toShareRows(categoryMap, total.amount, (k) => k),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const result = {
    period: { from: FROM, to: TO },
    stores: storeRows,
  };

  const outFile = `reports/store-monthly-mix-${FROM}_${TO}.json`;
  writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  console.log(`\n저장 완료: ${outFile}`);

  console.log("\n=== 매장별 해외 매출 비중 ===");
  console.table(
    storeRows.map((r) => ({
      매장: r.shopName,
      총매출: r.totalAmount.toLocaleString(),
      해외매출: r.foreignAmount.toLocaleString(),
      해외비중: r.foreignShare != null ? `${(r.foreignShare * 100).toFixed(1)}%` : "-",
    }))
  );

  console.log("\n=== 매장별 국가 매출 비중 (상위 국적만) ===");
  for (const r of storeRows) {
    console.log(`\n[${r.shopName}]`);
    console.table(
      r.byNation
        .filter((n) => n.share != null && n.share >= 0.01)
        .map((n) => ({ 국적: n.label, 비중: `${((n.share ?? 0) * 100).toFixed(1)}%`, 매출: n.amount.toLocaleString() }))
    );
  }

  console.log("\n=== 매장별 카테고리 매출 비중 ===");
  for (const r of storeRows) {
    console.log(`\n[${r.shopName}]`);
    console.table(
      r.byCategory.map((c) => ({ 카테고리: c.label, 비중: `${((c.share ?? 0) * 100).toFixed(1)}%`, 매출: c.amount.toLocaleString() }))
    );
  }
}

main();
