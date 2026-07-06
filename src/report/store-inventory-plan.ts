import { getShopStock } from "../endpoints/index.js";

const STORE_MAP: Record<string, string> = {
  VRDSFS: "도산",
  VRSSFS: "성수",
  VRAGFS: "안국",
  VRMDFS: "명동",
  VRNJFS: "신제주",
  VRJAFS: "애월",
};

// 매출_v2 시트(구글 스프레드시트 128mZvIyjznBIA8trhKkS1TkMMaQ7ZjfpSEUWPbzlFXs, gid=239564970)에서
// 2026-07-05에 직접 조회한 다음 주(2026-07-06~07-12) 매장별 일단위 목표매출 합계.
// 시트가 매일 갱신되므로 재실행 시점에는 반드시 최신 값으로 교체할 것.
const NEXT_WEEK_LABEL = "2026-07-06 ~ 2026-07-12";
const NEXT_WEEK_TARGET_REVENUE: Record<string, number> = {
  도산: 30_763_050,
  성수: 179_638_244,
  안국: 43_562_273,
  명동: 101_046_513,
  신제주: 102_169_251,
  애월: 61_301_551,
};

const DISCOUNT_RATE = 0.05;
const ORDERS_PER_WEEK = 2;

function toYyyyMmDd(d: Date): string {
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

interface StoreStockSummary {
  label: string;
  lineCount: number;
  excludedTestLines: number;
  totalQty: number;
  holdingValueAtSalesPrice: number;
}

async function summarizeStock(code: string, label: string, stockDate: string): Promise<StoreStockSummary> {
  const stock = await getShopStock({ stockDate, shop: code });
  // 테스트/음수 재고 라인 제외 (예: 애월의 productCode V00AP0001 "TEST260311", stockCount -1)
  const clean = stock.filter((x) => Number(x.stockCount) > 0 && !x.productName?.startsWith("TEST"));
  const totalQty = clean.reduce((s, x) => s + Number(x.stockCount || 0), 0);
  const holdingValueAtSalesPrice = clean.reduce(
    (s, x) => s + Number(x.stockCount || 0) * Number(x.salesPrice || 0),
    0
  );
  return {
    label,
    lineCount: clean.length,
    excludedTestLines: stock.length - clean.length,
    totalQty,
    holdingValueAtSalesPrice,
  };
}

async function main() {
  const today = new Date();
  const todayStr = toYyyyMmDd(today);

  console.log(`재고 스냅샷 기준일: ${todayStr}`);
  console.log(`목표매출 기준 주차: ${NEXT_WEEK_LABEL} (매출_v2 시트)`);
  console.log(`할인율: ${(DISCOUNT_RATE * 100).toFixed(0)}%, 주당 발주 횟수: ${ORDERS_PER_WEEK}회\n`);

  const rows: Array<{
    label: string;
    weeklyTarget: number;
    requiredInventoryValue: number;
    holdingValue: number;
    weeksOfCover: number;
    gap: number;
    excludedTestLines: number;
  }> = [];

  for (const [code, label] of Object.entries(STORE_MAP)) {
    const summary = await summarizeStock(code, label, todayStr);
    const weeklyTarget = NEXT_WEEK_TARGET_REVENUE[label];
    const requiredInventoryValue = weeklyTarget / (1 - DISCOUNT_RATE);
    const weeksOfCover = summary.holdingValueAtSalesPrice / weeklyTarget;
    const gap = summary.holdingValueAtSalesPrice - requiredInventoryValue;
    rows.push({
      label,
      weeklyTarget,
      requiredInventoryValue,
      holdingValue: summary.holdingValueAtSalesPrice,
      weeksOfCover,
      gap,
      excludedTestLines: summary.excludedTestLines,
    });
  }

  const fmt = (n: number) => Math.round(n).toLocaleString();
  console.log(
    "매장".padEnd(6),
    "주간목표매출".padStart(14),
    "필요재고금액(÷0.95)".padStart(20),
    "보유재고금액".padStart(14),
    "보유/목표(주)".padStart(12),
    "과부족".padStart(16)
  );
  for (const r of rows) {
    console.log(
      r.label.padEnd(6),
      fmt(r.weeklyTarget).padStart(14),
      fmt(r.requiredInventoryValue).padStart(20),
      fmt(r.holdingValue).padStart(14),
      r.weeksOfCover.toFixed(1).padStart(12),
      fmt(r.gap).padStart(16),
      r.excludedTestLines ? `(테스트라인 ${r.excludedTestLines}건 제외)` : ""
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
