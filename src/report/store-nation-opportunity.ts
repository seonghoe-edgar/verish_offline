import { writeFileSync } from "node:fs";
import { getShop, getTaxFreeInfo, getSalesDetailInfo, type SalesDetailInfo } from "../endpoints/index.js";

// 사용법: npx tsx src/report/store-nation-opportunity.ts [fromDate] [toDate]
// 예:    npx tsx src/report/store-nation-opportunity.ts 2026-06-28 2026-07-05  (기본값: 최근 1주)
//
// 목적: 매장 × 국적별 상품 구성비를 비교해 "국적 비중은 비슷한데 특정 상품 판매 비중만 낮은 매장"을
// 찾아 기회요소(그 매장에 해당 상품을 더 진열/추천/재고배분 하면 좋을 후보)를 뽑는다.
const TO = process.argv[3] ?? new Date().toISOString().slice(0, 10);
const FROM =
  process.argv[2] ??
  (() => {
    const d = new Date(`${TO}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  })();

// country-comparison.ts와 동일한 국적 코드 한계 — PLAY MD는 홍콩을 별도 코드로 구분하지 않고 CHN으로 잡히는 것으로 보임.
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
const UNTAXED_LABEL = "미상(내국인/면세미신청)";

// 비교 파라미터 — 짧은 기간(1주) 데이터라 노이즈를 걸러내기 위한 최소 표본 기준.
const MIN_NATION_SHARE = 0.1; // 매장 매출의 10% 이상을 차지해야 그 국적이 "유의미한 고객군"으로 취급
const MIN_NATION_RECEIPTS = 5; // 그 국적 영수증이 최소 5건은 있어야 상품 구성비를 신뢰
const COMPOSITION_CLOSE_THRESHOLD = 0.08; // 두 매장의 국적 비중 차이가 8%p 이내면 "비슷한 고객 구성"으로 간주
const MIN_HIGH_SHARE = 0.08; // 기회요소 후보의 "잘 팔리는 매장" 쪽 상품 비중 최소 8% 이상
const MIN_GAP = 0.06; // 두 매장 간 상품 비중 격차 최소 6%p 이상
const MIN_HIGH_QTY = 3; // 잘 팔리는 매장 쪽 판매수량 최소 3개 이상 (우연한 1~2건 배제)

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

  // 1) 매장별 영수증 -> 국적 매핑. getTaxFreeInfo는 shop이 필수라 매장별로 루프.
  const taxWindows = splitWindows(FROM, TO, 4);
  const taxJobs = shops.flatMap((shop) => taxWindows.map((window) => ({ shop: shop.shopCode, window })));
  console.log(`taxFreeInfo 총 ${taxJobs.length}건 동시 요청...`);
  const receiptNation = new Map<string, string>(); // compositeReceiptNo(shop+date+seq) -> nation
  let taxDone = 0;
  await Promise.all(
    taxJobs.map(async ({ shop, window: [start, end] }) => {
      const rows = await getTaxFreeInfo({ from: toYyyyMmDd(start), to: toYyyyMmDd(end), shop });
      // 날짜 범위 초과 시 배열 대신 평문 에러 문자열이 200 OK로 오는 API 함정 방어.
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

  // 2) 전체 매장 판매라인. getSalesDetailInfo는 shopCode optional이라 전체 매장 한번에.
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

  // 3) 매장 x 국적 x 상품 집계
  const storeTotal = new Map<string, Bucket>();
  const storeNationTotal = new Map<string, Map<string, Bucket>>(); // shopCode -> nation -> total
  const storeNationProduct = new Map<string, Map<string, Map<string, Bucket>>>(); // shopCode -> nation -> productKey -> bucket

  for (const l of allLines) {
    const composite = `${l.shopCode}${l.salesDate}${l.receiptNo}`;
    const nation = receiptNation.get(composite) ?? UNTAXED_LABEL;
    const qty = Number(l.qty) || 0;
    const amount = Number(l.totalPaymentPrice) || 0;
    const productKey = `${l.productCode} | ${l.productName}`;

    bump(storeTotal, l.shopCode, qty, amount, l.receiptNo);

    if (!storeNationTotal.has(l.shopCode)) storeNationTotal.set(l.shopCode, new Map());
    bump(storeNationTotal.get(l.shopCode)!, nation, qty, amount, l.receiptNo);

    if (!storeNationProduct.has(l.shopCode)) storeNationProduct.set(l.shopCode, new Map());
    const nationMap = storeNationProduct.get(l.shopCode)!;
    if (!nationMap.has(nation)) nationMap.set(nation, new Map());
    bump(nationMap.get(nation)!, productKey, qty, amount, l.receiptNo);
  }

  // 4) 매장별 국적 비중 요약
  const compositionRows: {
    shopCode: string;
    shopName: string;
    nation: string;
    nationLabel: string;
    share: number;
    receipts: number;
    amount: number;
  }[] = [];
  for (const [shopCode, nationMap] of storeNationTotal) {
    const total = storeTotal.get(shopCode)!;
    if (total.amount === 0) continue;
    for (const [nation, bucket] of nationMap) {
      compositionRows.push({
        shopCode,
        shopName: shopLabel.get(shopCode) ?? shopCode,
        nation,
        nationLabel: NATION_LABEL[nation] ?? (nation === UNTAXED_LABEL ? UNTAXED_LABEL : nation),
        share: bucket.amount / total.amount,
        receipts: bucket.receipts.size,
        amount: bucket.amount,
      });
    }
  }
  compositionRows.sort((a, b) => b.share - a.share);

  console.log("\n=== 매장별 국적 매출 비중 ===");
  console.table(
    compositionRows
      .filter((r) => r.nation !== UNTAXED_LABEL)
      .map((r) => ({
        매장: r.shopName,
        국적: r.nationLabel,
        비중: `${(r.share * 100).toFixed(1)}%`,
        영수증: r.receipts,
        매출: r.amount.toLocaleString(),
      }))
  );

  // 5) 기회요소 탐색: 같은 국적에 대해 비중이 비슷한 두 매장을 찾고, 그 국적 바스켓 내 상품별 비중을
  //    비교해 한쪽은 높고 한쪽은 낮은(=기회) 조합을 뽑는다.
  interface Opportunity {
    nation: string;
    nationLabel: string;
    productKey: string;
    highStore: string;
    highShare: number;
    highQty: number;
    lowStore: string;
    lowShare: number;
    lowQty: number;
    gap: number;
    highStoreNationShare: number;
    lowStoreNationShare: number;
  }
  const opportunities: Opportunity[] = [];

  const nations = new Set(compositionRows.map((r) => r.nation).filter((n) => n !== UNTAXED_LABEL));
  const shopCodes = shops.map((s) => s.shopCode);

  for (const nation of nations) {
    // 이 국적이 유의미한 고객군인 매장만 후보로
    const candidates = compositionRows.filter(
      (r) => r.nation === nation && r.share >= MIN_NATION_SHARE && r.receipts >= MIN_NATION_RECEIPTS
    );
    if (candidates.length < 2) continue;

    for (let i = 0; i < candidates.length; i++) {
      for (let j = 0; j < candidates.length; j++) {
        if (i === j) continue;
        const a = candidates[i];
        const b = candidates[j];
        if (Math.abs(a.share - b.share) > COMPOSITION_CLOSE_THRESHOLD) continue; // 국적 비중이 비슷한 쌍만

        const productsA = storeNationProduct.get(a.shopCode)?.get(nation);
        const productsB = storeNationProduct.get(b.shopCode)?.get(nation);
        if (!productsA) continue;
        const nationTotalA = storeNationTotal.get(a.shopCode)!.get(nation)!.amount;

        for (const [productKey, bucketA] of productsA) {
          const shareA = bucketA.amount / nationTotalA;
          if (shareA < MIN_HIGH_SHARE || bucketA.qty < MIN_HIGH_QTY) continue;

          const bucketB = productsB?.get(productKey);
          const nationTotalB = storeNationTotal.get(b.shopCode)!.get(nation)!.amount;
          const shareB = bucketB ? bucketB.amount / nationTotalB : 0;

          const gap = shareA - shareB;
          if (gap < MIN_GAP) continue;

          opportunities.push({
            nation,
            nationLabel: NATION_LABEL[nation] ?? nation,
            productKey,
            highStore: a.shopName,
            highShare: shareA,
            highQty: bucketA.qty,
            lowStore: b.shopName,
            lowShare: shareB,
            lowQty: bucketB?.qty ?? 0,
            gap,
            highStoreNationShare: a.share,
            lowStoreNationShare: b.share,
          });
        }
      }
    }
  }

  // 같은 (nation, productKey, lowStore) 조합이 여러 highStore에서 중복으로 잡힐 수 있어 gap 기준 최상위만 남김
  const dedupKey = (o: Opportunity) => `${o.nation}|${o.productKey}|${o.lowStore}`;
  const bestByKey = new Map<string, Opportunity>();
  for (const o of opportunities) {
    const key = dedupKey(o);
    const cur = bestByKey.get(key);
    if (!cur || o.gap > cur.gap) bestByKey.set(key, o);
  }
  const finalOpportunities = [...bestByKey.values()].sort((a, b) => b.gap - a.gap);

  console.log(`\n=== 🎯 기회요소 후보 (국적 비중 ±${(COMPOSITION_CLOSE_THRESHOLD * 100).toFixed(0)}%p 이내, 상품 비중 격차 ${(MIN_GAP * 100).toFixed(0)}%p 이상) ===`);
  if (finalOpportunities.length === 0) {
    console.log("해당 기간/기준으로는 유의미한 기회요소가 발견되지 않았습니다.");
  } else {
    console.table(
      finalOpportunities.slice(0, 30).map((o) => ({
        국적: o.nationLabel,
        상품: o.productKey,
        "잘팔리는매장(비중)": `${o.highStore} (${(o.highShare * 100).toFixed(1)}%, ${o.highQty}개)`,
        "저조매장(비중)": `${o.lowStore} (${(o.lowShare * 100).toFixed(1)}%, ${o.lowQty}개)`,
        격차: `${(o.gap * 100).toFixed(1)}%p`,
        "매장 국적비중(고/저)": `${(o.highStoreNationShare * 100).toFixed(1)}% / ${(o.lowStoreNationShare * 100).toFixed(1)}%`,
      }))
    );
    if (finalOpportunities.length > 30) console.log(`(그 외 ${finalOpportunities.length - 30}건 더 — JSON 파일 참고)`);
  }

  const result = {
    period: { from: FROM, to: TO },
    params: {
      MIN_NATION_SHARE,
      MIN_NATION_RECEIPTS,
      COMPOSITION_CLOSE_THRESHOLD,
      MIN_HIGH_SHARE,
      MIN_GAP,
      MIN_HIGH_QTY,
    },
    composition: compositionRows,
    opportunities: finalOpportunities,
  };
  const outFile = `reports/store-nation-opportunity-${FROM}_${TO}.json`;
  writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  console.log(`\n저장 완료: ${outFile}`);
}

main();
