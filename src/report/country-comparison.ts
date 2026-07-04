import { writeFileSync } from "node:fs";
import { getShop, getTaxFreeInfo, getSalesDetailInfo } from "../endpoints/index.js";

// 사용법: npx tsx src/report/country-comparison.ts <ISO3166-1 alpha-3 국가코드> [fromDate] [toDate]
// 예:    npx tsx src/report/country-comparison.ts JPN 2026-04-05 2026-07-04
// 국가코드는 getTaxFreeInfo 응답의 PassportInfo[].passportNation 값 (TWN, JPN, USA, CHN 등).
const NATION = process.argv[2];
if (!NATION) {
  console.error("사용법: npx tsx src/report/country-comparison.ts <국가코드(예: TWN)> [fromDate] [toDate]");
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

// productCode 구조: [브랜드 1자][시즈널 2자][스타일 2~3자][일련번호 4자리]
// (commonCode의 "브랜드"/"시즈널" 코드 테이블이 각각 1자/2자 고정 길이임을 확인함)
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
  console.log(`국가: ${NATION} / 기간: ${FROM} ~ ${TO}`);
  const shops = (await getShop()).filter((s) => !["CAFE24", "TEST"].includes(s.shopCode));
  console.log(`대상 매장 ${shops.length}개:`, shops.map((s) => s.shopCode).join(", "));

  // 매장×기간 조합을 전부 동시에 큐에 던지고, client.ts의 rateLimiter가 5req/s로 페이싱한다.
  // (순차 await 방식은 매 요청의 네트워크 왕복시간이 그대로 누적되어 훨씬 느림)
  const taxWindows = splitWindows(FROM, TO, 4);
  const taxJobs = shops.flatMap((shop) => taxWindows.map((window) => ({ shop: shop.shopCode, window })));
  console.log(`taxFreeInfo 총 ${taxJobs.length}건 동시 요청 시작...`);
  let taxDone = 0;
  const nationReceipts = new Set<string>();
  await Promise.all(
    taxJobs.map(async ({ shop, window: [start, end] }) => {
      const rows = await getTaxFreeInfo({ from: toYyyyMmDd(start), to: toYyyyMmDd(end), shop });
      for (const r of rows) {
        if ((r.PassportInfo ?? []).some((p) => p.passportNation === NATION)) {
          nationReceipts.add(r.receiptNo);
        }
      }
      taxDone++;
      if (taxDone % 30 === 0) console.log(`taxFreeInfo ${taxDone}/${taxJobs.length}...`);
    })
  );
  console.log(`${NATION} 면세 영수증 수:`, nationReceipts.size);

  const detailWindows = splitWindows(FROM, TO, 3);
  const byCategory = new Map<string, Agg>();
  const byProduct = new Map<string, Agg>();
  const bySize = new Map<string, Agg>();
  const byColor = new Map<string, Agg>();
  const byCategoryProductSizeColor = new Map<string, Agg>();
  let totalLines = 0;
  let nationLines = 0;

  console.log(`getSalesDetailInfo 총 ${detailWindows.length}건 동시 요청 시작...`);
  const detailResults = await Promise.all(
    detailWindows.map(([start, end]) =>
      getSalesDetailInfo({ fromDate: Number(toYyyyMmDd(start)), toDate: Number(toYyyyMmDd(end)) })
    )
  );
  for (const rows of detailResults) {
    totalLines += rows.length;
    for (const l of rows) {
      // getTaxFreeInfo의 receiptNo는 "매장코드+판매일자+일련번호" 합성키인 반면
      // getSalesDetailInfo의 receiptNo는 일련번호만 담긴다 — 같은 방식으로 합쳐서 매칭해야 한다.
      const compositeReceiptNo = `${l.shopCode}${l.salesDate}${l.receiptNo}`;
      if (!nationReceipts.has(compositeReceiptNo)) continue;
      nationLines++;
      const qty = Number(l.qty) || 0;
      const amount = Number(l.totalPaymentPrice) || 0;
      const cat = styleOf(l.productCode);
      const productKey = `${l.productCode} | ${l.productName}`;
      const sizeKey = l.sizeName || l.sizeCode || "(사이즈없음)";
      const colorKey = l.colorName || l.colorCode || "(컬러없음)";

      bump(byCategory, cat, qty, amount, l.receiptNo);
      bump(byProduct, `${cat} > ${productKey}`, qty, amount, l.receiptNo);
      bump(bySize, sizeKey, qty, amount, l.receiptNo);
      bump(byColor, colorKey, qty, amount, l.receiptNo);
      bump(
        byCategoryProductSizeColor,
        `${cat} > ${productKey} > ${colorKey} > ${sizeKey}`,
        qty,
        amount,
        l.receiptNo
      );
    }
  }

  console.log("\n전체 라인 수:", totalLines, `/ ${NATION} 라인 수:`, nationLines);

  const toSorted = (map: Map<string, Agg>) =>
    [...map.entries()]
      .map(([key, v]) => ({ key, qty: v.qty, amount: v.amount, receiptCount: v.receipts.size }))
      .sort((a, b) => b.amount - a.amount);

  const result = {
    nation: NATION,
    period: { from: FROM, to: TO },
    nationReceiptCount: nationReceipts.size,
    totalLines,
    nationLines,
    byCategory: toSorted(byCategory),
    byProduct: toSorted(byProduct),
    bySize: toSorted(bySize),
    byColor: toSorted(byColor),
    byCategoryProductSizeColor: toSorted(byCategoryProductSizeColor),
  };

  const outFile = `reports/offline-${NATION.toLowerCase()}-breakdown.json`;
  writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  console.log(`\n저장 완료: ${outFile}`);
  console.log("\n=== 카테고리별 ===");
  console.table(result.byCategory);
  console.log("\n=== 상위 30개 상품 ===");
  console.table(result.byProduct.slice(0, 30));
}

main();
