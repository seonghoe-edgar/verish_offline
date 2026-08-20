// 상품별 퍼널(조회수/장바구니담기/구매전환) 주간 스냅샷.
// 실행 시점 기준 "완료된 지난 주"(월~일, KST)를 집계해 funnel-dashboard-web/public/data 에 저장한다.
// 매주 월요일 11시 스케줄 실행 전제.
// 실행: npx tsx scripts/funnel-dashboard-snapshot.ts [기준일 YYYY-MM-DD, 기본 오늘 KST]
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { cafe24AdminRequest, cafe24DataRequest, Cafe24ApiError } from "../src/cafe24/index.js";

const OUT_DIR = "funnel-dashboard-web/public/data";
const MAX_WEEKS_HISTORY = 12;
const BELOW_AVG_THRESHOLD = 0.7; // 사이트 평균의 70% 미만이면 "below_avg" 플래그
const MIN_VIEWS_FOR_FLAG = 30; // 조회수가 너무 적은 상품은 비율이 튀므로 플래그 대상에서 제외

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function requestWithRetry<T = any>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err instanceof Cafe24ApiError ? err.status : undefined;
      if (status === 429) {
        await sleep(attempt * 3000);
        continue;
      }
      throw err;
    }
  }
  throw new Error("재시도 초과");
}

// 아래 날짜 헬퍼들은 전부 "KST 달력 날짜"를 Date.UTC(...)로 만든 순수 달력값으로 다룬다.
// (시스템 타임존이 KST가 아니어도 정확하도록, toISOString/local getter를 섞어 쓰지 않음)
function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, delta: number): Date {
  const nd = new Date(d.getTime());
  nd.setUTCDate(nd.getUTCDate() + delta);
  return nd;
}

function ymdToDate(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, day));
}

/** 현재 KST(UTC+9) 기준 달력 날짜를 반환 (시스템 타임존 무관). */
function kstToday(): Date {
  const shifted = new Date(Date.now() + 9 * 3600000);
  return ymdToDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return ymdToDate(y, m, d);
}

async function fetchAllProductRows(path: string, field: string, start: string, end: string): Promise<any[]> {
  const rows: any[] = [];
  let offset = 0;
  const limit = 500;
  while (true) {
    const res: any = await requestWithRetry(() =>
      cafe24DataRequest(path, { start_date: start, end_date: end, limit, offset })
    );
    const batch = res[field] ?? [];
    rows.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
    await sleep(200);
  }
  return rows;
}

interface ProductOrderAgg {
  product_no: number;
  product_name: string;
  qtySold: number;
  revenue: number;
}

async function fetchOrderAggregates(start: string, end: string) {
  const dayList: string[] = [];
  let d = parseYmd(start);
  const endD = parseYmd(end);
  while (d.getTime() <= endD.getTime()) {
    dayList.push(dateStr(d));
    d = addDays(d, 1);
  }

  const productMap = new Map<number, ProductOrderAgg>();
  let validOrders = 0;
  let totalRevenue = 0;

  for (const day of dayList) {
    let offset = 0;
    const limit = 500;
    let dayOrders = 0;
    while (true) {
      const res: any = await requestWithRetry(() =>
        cafe24AdminRequest("GET", "/admin/orders", {
          params: { start_date: day, end_date: day, embed: "items", limit, offset },
        })
      );
      const orders = res.orders ?? [];
      dayOrders += orders.length;

      for (const o of orders) {
        if (o.canceled === "T") continue;
        validOrders++;
        totalRevenue += Number(o.payment_amount) || 0;
        for (const it of o.items ?? []) {
          const productNo = Number(it.product_no);
          if (!productNo) continue;
          const status = String(it.order_status ?? "");
          const canceledItem = status.startsWith("C");
          const qty = Number(it.quantity) || 0;
          const claim = Number(it.claim_quantity) || 0;
          const netQty = canceledItem ? 0 : Math.max(0, qty - claim);
          const amount = canceledItem ? 0 : Number(it.payment_amount) || 0;

          let pa = productMap.get(productNo);
          if (!pa) {
            pa = { product_no: productNo, product_name: it.product_name ?? `product_${productNo}`, qtySold: 0, revenue: 0 };
            productMap.set(productNo, pa);
          }
          pa.qtySold += netQty;
          pa.revenue += amount;
        }
      }

      if (orders.length < limit) break;
      offset += limit;
      await sleep(150);
    }
    console.log(`  ${day}: 주문 ${dayOrders}건 스캔`);
  }

  return { productMap, validOrders, totalRevenue };
}

async function main() {
  const refArg = process.argv[2];
  const refDate = refArg ? parseYmd(refArg) : kstToday();

  // 완료된 지난 주(월~일) 계산: refDate가 속한 주의 전주
  const dow = refDate.getUTCDay(); // 0=일 ... 6=토
  const daysSinceMonday = (dow + 6) % 7;
  const thisWeekMonday = addDays(refDate, -daysSinceMonday);
  const weekEnd = addDays(thisWeekMonday, -1); // 지난주 일요일
  const weekStart = addDays(weekEnd, -6); // 지난주 월요일

  const start = dateStr(weekStart);
  const end = dateStr(weekEnd);
  console.log(`대상 주: ${start} ~ ${end}`);

  console.log("1) 상품별 조회수(/products/view) 수집...");
  const viewRows = await fetchAllProductRows("/products/view", "view", start, end);
  console.log(`   ${viewRows.length}개 상품`);

  console.log("2) 상품별 장바구니(/carts/action) 수집...");
  const cartRows = await fetchAllProductRows("/carts/action", "action", start, end);
  console.log(`   ${cartRows.length}개 상품`);

  console.log("3) 세션수(/visitors/view) 수집...");
  const visitorRes: any = await requestWithRetry(() =>
    cafe24DataRequest("/visitors/view", { start_date: start, end_date: end })
  );
  const sessions = (visitorRes.view ?? []).reduce((sum: number, r: any) => sum + (Number(r.visit_count) || 0), 0);
  console.log(`   세션수: ${sessions}`);

  console.log("4) 주문 집계(/admin/orders, 날짜별)...");
  const { productMap: orderMap, validOrders, totalRevenue } = await fetchOrderAggregates(start, end);
  console.log(`   유효주문 ${validOrders}건, 매출 ${Math.round(totalRevenue)}`);

  // 상품별 통합 (조회/장바구니/주문 중 하나라도 있으면 포함)
  const viewByNo = new Map<number, any>(viewRows.map((r) => [Number(r.product_no), r]));
  const cartByNo = new Map<number, any>(cartRows.map((r) => [Number(r.product_no), r]));
  const allProductNos = new Set<number>([...viewByNo.keys(), ...cartByNo.keys(), ...orderMap.keys()]);

  const products = [...allProductNos].map((no) => {
    const v = viewByNo.get(no);
    const c = cartByNo.get(no);
    const o = orderMap.get(no);
    const views = Number(v?.count ?? c?.count ?? 0);
    const addCartCount = Number(c?.add_cart_count ?? 0);
    const addCartRate = views > 0 ? Number(((addCartCount / views) * 100).toFixed(2)) : 0;
    const qtySold = o?.qtySold ?? 0;
    const revenue = Math.round(o?.revenue ?? 0);
    const purchaseRate = views > 0 ? Number(((qtySold / views) * 100).toFixed(2)) : 0;
    const productName = v?.product_name ?? c?.product_name ?? o?.product_name ?? `product_${no}`;
    return {
      productNo: no,
      productName,
      views,
      addCartCount,
      addCartRate,
      qtySold,
      revenue,
      purchaseRate,
      flag: null as string | null,
    };
  });

  const withViews = products.filter((p) => p.views > 0);
  const avgAddCartRate = withViews.length ? withViews.reduce((s, p) => s + p.addCartRate, 0) / withViews.length : 0;
  const avgPurchaseRate = withViews.length ? withViews.reduce((s, p) => s + p.purchaseRate, 0) / withViews.length : 0;

  for (const p of products) {
    if (p.views < MIN_VIEWS_FOR_FLAG) continue;
    if (p.addCartRate < avgAddCartRate * BELOW_AVG_THRESHOLD || p.purchaseRate < avgPurchaseRate * BELOW_AVG_THRESHOLD) {
      p.flag = "below_avg";
    }
  }

  products.sort((a, b) => b.revenue - a.revenue);

  const conversionRate = sessions > 0 ? Number(((validOrders / sessions) * 100).toFixed(3)) : 0;
  const aov = validOrders > 0 ? Math.round(totalRevenue / validOrders) : 0;

  mkdirSync(OUT_DIR, { recursive: true });

  // weekly-summary.json: 이번 주 값을 append(이미 있으면 덮어쓰기), 최근 N주만 유지 (트렌드용)
  const summaryPath = `${OUT_DIR}/weekly-summary.json`;
  let history: any[] = [];
  if (existsSync(summaryPath)) {
    try {
      history = JSON.parse(readFileSync(summaryPath, "utf8"));
    } catch {
      history = [];
    }
  }
  history = history.filter((w) => w.weekStart !== start);
  history.push({
    weekStart: start,
    weekEnd: end,
    sessions,
    validOrders,
    conversionRate,
    revenue: Math.round(totalRevenue),
    aov,
    avgAddCartRate: Number(avgAddCartRate.toFixed(2)),
    avgPurchaseRate: Number(avgPurchaseRate.toFixed(2)),
  });
  history.sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  if (history.length > MAX_WEEKS_HISTORY) history = history.slice(history.length - MAX_WEEKS_HISTORY);
  writeFileSync(summaryPath, JSON.stringify(history, null, 2), "utf8");

  writeFileSync(
    `${OUT_DIR}/latest-products.json`,
    JSON.stringify(
      { weekStart: start, weekEnd: end, avgAddCartRate, avgPurchaseRate, products },
      null,
      2
    ),
    "utf8"
  );

  console.log(`\n완료. ${OUT_DIR}/weekly-summary.json, latest-products.json 저장됨.`);
  console.log(`전환율: ${conversionRate}% (주문 ${validOrders} / 세션 ${sessions})`);
}

main().catch((err) => {
  console.error(err instanceof Cafe24ApiError ? JSON.stringify(err.body) : err);
  process.exitCode = 1;
});
