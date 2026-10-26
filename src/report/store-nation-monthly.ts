import { writeFileSync } from "node:fs";
import { getShop, getTaxFreeInfo, getSalesDetailInfo, type SalesDetailInfo } from "../endpoints/index.js";

// 사용법: npx tsx src/report/store-nation-monthly.ts [fromDate] [toDate]
// 예:    npx tsx src/report/store-nation-monthly.ts 2026-01-01 2026-10-25  (기본값: 올해 1월 1일 ~ 어제)
//
// 목적: 매장 x 월 x 국적 단위로 매출/수량/영수증 건수를 집계 (신규 매장 매출 추정의 전환율 분모/분자용).
// 영수증 건수는 store-monthly-mix.ts와 달리 `shopCode+salesDate+receiptNo` 합성키로 센다 —
// getSalesDetailInfo의 receiptNo는 일련번호뿐이라 그대로 세면 날짜 간에 중복 제거되어 과소집계된다.
const TO =
  process.argv[3] ??
  (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1); // 오늘자는 마감 전 데이터라 제외
    return d.toISOString().slice(0, 10);
  })();
const FROM = process.argv[2] ?? `${TO.slice(0, 4)}-01-01`;
const DOMESTIC = "KOR_OR_NON_TAXFREE";

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

async function main() {
  console.log(`기간: ${FROM} ~ ${TO}`);
  const shops = (await getShop()).filter((s) => !["CAFE24", "TEST"].includes(s.shopCode));
  console.log(`대상 매장 ${shops.length}개:`, shops.map((s) => `${s.shopCode}(${s.shopName})`).join(", "));

  // 1) 매장별 영수증 -> 국적 매핑
  const taxWindows = splitWindows(FROM, TO, 4);
  const taxJobs = shops.flatMap((shop) => taxWindows.map((window) => ({ shop: shop.shopCode, window })));
  console.log(`taxFreeInfo 총 ${taxJobs.length}건 요청...`);
  const receiptNation = new Map<string, string>();
  let taxDone = 0;
  let taxFailed = 0;
  await Promise.all(
    taxJobs.map(async ({ shop, window: [start, end] }) => {
      const rows = await getTaxFreeInfo({ from: toYyyyMmDd(start), to: toYyyyMmDd(end), shop }).catch(() => null);
      if (Array.isArray(rows)) {
        for (const r of rows) {
          const nation = (r.PassportInfo ?? [])[0]?.passportNation?.trim();
          if (nation) receiptNation.set(r.receiptNo, nation);
        }
      } else taxFailed++;
      taxDone++;
      if (taxDone % 100 === 0) console.log(`taxFreeInfo ${taxDone}/${taxJobs.length}...`);
    })
  );
  console.log(`국적 확인된 면세 영수증 수: ${receiptNation.size} (실패/비배열 응답 ${taxFailed}건)`);

  // 2) 전체 매장 판매라인
  const detailWindows = splitWindows(FROM, TO, 3);
  console.log(`getSalesDetailInfo 총 ${detailWindows.length}건 요청...`);
  const detailResults = await Promise.all(
    detailWindows.map(([start, end]) =>
      getSalesDetailInfo({ fromDate: Number(toYyyyMmDd(start)), toDate: Number(toYyyyMmDd(end)) }).catch(() => null)
    )
  );
  const allLines: SalesDetailInfo[] = [];
  let detailFailed = 0;
  for (const rows of detailResults) {
    if (Array.isArray(rows)) allLines.push(...rows);
    else detailFailed++;
  }
  console.log(`전체 판매 라인 수: ${allLines.length} (실패/비배열 응답 ${detailFailed}건)`);

  // 3) 매장 x 월 x 국적 집계
  const agg = new Map<string, Bucket>(); // shop|yyyymm|nation
  const activeDays = new Map<string, Set<string>>(); // shop|yyyymm -> 판매 발생일
  for (const l of allLines) {
    const salesDate = String(l.salesDate);
    const composite = `${l.shopCode}${salesDate}${l.receiptNo}`;
    const nation = receiptNation.get(composite) ?? DOMESTIC;
    const month = salesDate.slice(0, 6);
    const key = `${l.shopCode}|${month}|${nation}`;
    const cur = agg.get(key) ?? { qty: 0, amount: 0, receipts: new Set<string>() };
    cur.qty += Number(l.qty) || 0;
    cur.amount += Number(l.totalPaymentPrice) || 0;
    cur.receipts.add(composite);
    agg.set(key, cur);
    const dayKey = `${l.shopCode}|${month}`;
    if (!activeDays.has(dayKey)) activeDays.set(dayKey, new Set());
    activeDays.get(dayKey)!.add(salesDate);
  }

  const rows = [...agg.entries()].map(([key, v]) => {
    const [shopCode, month, nation] = key.split("|");
    return { shopCode, month, nation, amount: v.amount, qty: v.qty, receipts: v.receipts.size };
  });
  const result = {
    period: { from: FROM, to: TO },
    shops: shops.map((s) => ({ shopCode: s.shopCode, shopName: s.shopName })),
    activeDays: Object.fromEntries([...activeDays.entries()].map(([k, v]) => [k, v.size])),
    rows,
  };
  const outFile = `reports/store-nation-monthly-${FROM}_${TO}.json`;
  writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  console.log(`\n저장 완료: ${outFile} (${rows.length} rows)`);
}

main();
