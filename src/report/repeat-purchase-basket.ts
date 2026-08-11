import { writeFileSync } from "node:fs";
import { shopifyGraphql } from "../shopify/index.js";

// 사용법: npx tsx src/report/repeat-purchase-basket.ts [fromDate] [toDate] [국가당 표본수]
// 예:    npx tsx src/report/repeat-purchase-basket.ts 2026-01-01 2026-08-12 400
// 목적: 국가별 "1차구매"와 "2차구매"의 장바구니 구성(카테고리 믹스, 개수, 대표 상품)을 비교.
// repeat-purchase-timing.ts와 동일한 orders 루트 스캔 방식 재사용(Customer.orders 커넥션 불신 이슈 회피).
const TO = process.argv[3] ?? new Date().toISOString().slice(0, 10);
const FROM = process.argv[2] ?? (() => {
  const d = new Date(`${TO}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 7);
  return d.toISOString().slice(0, 10);
})();
const SAMPLE_PER_COUNTRY = Number(process.argv[4] ?? 400);
const TARGET_COUNTRIES = ["Hong Kong", "Taiwan"];
const PAGE_SIZE = 250;

interface OrderLite { id: string; createdAt: string; customerId: string | null; country: string | null; }

const ORDERS_QUERY = `
query Orders($query: String!, $first: Int!, $after: String) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    edges { node { id createdAt customer { id } billingAddress { country } } }
  }
}`;

async function fetchAllOrders(from: string, to: string): Promise<OrderLite[]> {
  const q = `created_at:>=${from} AND created_at:<${to}`;
  const out: OrderLite[] = [];
  let after: string | null = null;
  let page = 0;
  while (true) {
    const data: any = await shopifyGraphql(ORDERS_QUERY, { query: q, first: PAGE_SIZE, after });
    const edges = data.orders.edges;
    for (const e of edges) {
      out.push({ id: e.node.id, createdAt: e.node.createdAt, customerId: e.node.customer?.id ?? null, country: e.node.billingAddress?.country ?? null });
    }
    page++;
    if (page % 10 === 0 || !data.orders.pageInfo.hasNextPage) console.log(`  page ${page}, 누적 주문 ${out.length}건...`);
    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }
  return out;
}

interface LineItem { title: string; quantity: number; variantTitle: string | null; productType: string | null; paidTotal: number }
const NODES_QUERY = `
query Nodes($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Order {
      id
      lineItems(first: 15) {
        edges { node { title quantity variantTitle product { productType } discountedTotalSet { shopMoney { amount } } } }
      }
    }
  }
}`;
// 증정품(GWP) 제외: 자동할인으로 결제금액이 0원이 된 라인은 "구매"가 아니라 사은품이므로
// 장바구니 구성 통계(개수/카테고리믹스/상품랭킹)에서 뺀다. 상품명이 아니라 실결제액(discountedTotalSet)
// 기준으로 판별 — 같은 상품이 정가로 결제된 경우(사은품 조건 미달)는 그대로 구매로 집계.
async function fetchLineItems(ids: string[]): Promise<Map<string, LineItem[]>> {
  const map = new Map<string, LineItem[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const data: any = await shopifyGraphql(NODES_QUERY, { ids: batch });
    for (const n of data.nodes) {
      if (!n) continue;
      const items: LineItem[] = n.lineItems.edges
        .map((e: any) => ({
          title: e.node.title,
          quantity: e.node.quantity,
          variantTitle: e.node.variantTitle,
          productType: e.node.product?.productType ?? "기타",
          paidTotal: Number(e.node.discountedTotalSet?.shopMoney?.amount ?? 0),
        }))
        .filter((li: LineItem) => li.paidTotal > 0); // 증정품(실결제 0원) 제외
      map.set(n.id, items);
    }
  }
  return map;
}

interface BasketStats {
  orders: number;
  itemCountDist: Map<number, number>; // distinct SKU lines per order
  unitCountDist: Map<number, number>; // total units per order
  categoryUnits: Map<string, number>;
  categoryOrderCount: Map<string, number>; // # orders containing this category at all
  comboFreq: Map<string, number>; // set-of-categories signature
  productFreq: Map<string, { count: number; totalQty: number }>;
  braQtyWhenPresent: number[]; // Bra 카테고리가 있는 주문에서의 Bra 총 수량
}
function newStats(): BasketStats {
  return { orders: 0, itemCountDist: new Map(), unitCountDist: new Map(), categoryUnits: new Map(), categoryOrderCount: new Map(), comboFreq: new Map(), productFreq: new Map(), braQtyWhenPresent: [] };
}
function bump(map: Map<any, number>, key: any, n = 1) { map.set(key, (map.get(key) ?? 0) + n); }

function addOrder(stats: BasketStats, items: LineItem[]) {
  if (items.length === 0) return;
  stats.orders++;
  const distinctLines = items.length;
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
  bump(stats.itemCountDist, distinctLines);
  bump(stats.unitCountDist, totalUnits);

  const categoriesInOrder = new Set<string>();
  let braQty = 0;
  for (const li of items) {
    const cat = li.productType || "기타";
    categoriesInOrder.add(cat);
    bump(stats.categoryUnits, cat, li.quantity);
    if (cat === "Bra") braQty += li.quantity;
    const key = `${li.title}${li.variantTitle ? " / " + li.variantTitle : ""}`;
    const cur = stats.productFreq.get(key) ?? { count: 0, totalQty: 0 };
    cur.count++;
    cur.totalQty += li.quantity;
    stats.productFreq.set(key, cur);
  }
  for (const cat of categoriesInOrder) bump(stats.categoryOrderCount, cat);
  if (braQty > 0) stats.braQtyWhenPresent.push(braQty);
  const combo = [...categoriesInOrder].sort().join(" + ");
  bump(stats.comboFreq, combo);
}

function summarize(stats: BasketStats) {
  const distTable = (m: Map<number, number>) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ n: k, orders: v, share: v / stats.orders }));
  const catTable = [...stats.categoryUnits.entries()].sort((a, b) => b[1] - a[1]).map(([cat, units]) => ({
    category: cat, units, unitShare: units / [...stats.categoryUnits.values()].reduce((s, x) => s + x, 0),
    orderCount: stats.categoryOrderCount.get(cat) ?? 0, orderShare: (stats.categoryOrderCount.get(cat) ?? 0) / stats.orders,
  }));
  const comboTable = [...stats.comboFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([combo, count]) => ({ combo, count, share: count / stats.orders }));
  const topProducts = [...stats.productFreq.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 15).map(([title, v]) => ({ title, orderCount: v.count, avgQtyPerOrder: v.totalQty / v.count }));
  const braQty = stats.braQtyWhenPresent;
  const braAvg = braQty.length > 0 ? braQty.reduce((s, x) => s + x, 0) / braQty.length : null;
  return {
    orders: stats.orders,
    avgDistinctLines: [...stats.itemCountDist.entries()].reduce((s, [k, v]) => s + k * v, 0) / stats.orders,
    avgUnits: [...stats.unitCountDist.entries()].reduce((s, [k, v]) => s + k * v, 0) / stats.orders,
    itemCountDist: distTable(stats.itemCountDist),
    categoryMix: catTable,
    topCombos: comboTable,
    topProducts,
    braUnitsWhenBraPresent: { avg: braAvg, n: braQty.length },
  };
}

async function main() {
  console.log(`기간: ${FROM} ~ ${TO} / 국가당 표본 최대 ${SAMPLE_PER_COUNTRY}명`);
  const orders = await fetchAllOrders(FROM, TO);
  console.log(`총 수집 주문: ${orders.length}건`);

  const byCountryCustomer = new Map<string, Map<string, OrderLite[]>>();
  for (const o of orders) {
    if (!o.country || !o.customerId || !TARGET_COUNTRIES.includes(o.country)) continue;
    if (!byCountryCustomer.has(o.country)) byCountryCustomer.set(o.country, new Map());
    const cm = byCountryCustomer.get(o.country)!;
    if (!cm.has(o.customerId)) cm.set(o.customerId, []);
    cm.get(o.customerId)!.push(o);
  }

  for (const country of TARGET_COUNTRIES) {
    const cm = byCountryCustomer.get(country) ?? new Map();
    const repeatCustomers = [...cm.values()].map((list) => [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))).filter((l) => l.length >= 2);
    const sample = repeatCustomers.slice(0, SAMPLE_PER_COUNTRY);
    console.log(`\n${country}: 윈도우 내 2회+ 구매 고객 ${repeatCustomers.length}명 중 ${sample.length}명 표본`);

    const firstIds = sample.map((s) => s[0].id);
    const secondIds = sample.map((s) => s[1].id);
    const allIds = [...firstIds, ...secondIds];
    const lineItemMap = await fetchLineItems(allIds);

    const stats1 = newStats();
    const stats2 = newStats();
    for (const id of firstIds) addOrder(stats1, lineItemMap.get(id) ?? []);
    for (const id of secondIds) addOrder(stats2, lineItemMap.get(id) ?? []);

    const summary1 = summarize(stats1);
    const summary2 = summarize(stats2);

    console.log(`\n--- ${country} 1차구매 (n=${summary1.orders}) ---`);
    console.log(`평균 SKU라인수 ${summary1.avgDistinctLines.toFixed(2)} / 평균 총수량 ${summary1.avgUnits.toFixed(2)}개`);
    console.table(summary1.itemCountDist.map((r) => ({ SKU라인수: r.n, 주문수: r.orders, 비중: `${(r.share * 100).toFixed(1)}%` })));
    console.table(summary1.categoryMix.map((r) => ({ 카테고리: r.category, 수량비중: `${(r.unitShare * 100).toFixed(1)}%`, 주문포함비중: `${(r.orderShare * 100).toFixed(1)}%` })));
    console.log("상위 구성 조합(카테고리 셋):");
    console.table(summary1.topCombos.map((r) => ({ ...r, share: `${(r.share * 100).toFixed(1)}%` })));
    console.log(`브라 포함 주문의 브라 평균 수량: ${summary1.braUnitsWhenBraPresent.avg?.toFixed(2)} (n=${summary1.braUnitsWhenBraPresent.n})`);
    console.log("상위 상품:");
    console.table(summary1.topProducts.slice(0, 10).map((r) => ({ ...r, avgQtyPerOrder: r.avgQtyPerOrder.toFixed(2) })));

    console.log(`\n--- ${country} 2차구매 (n=${summary2.orders}) ---`);
    console.log(`평균 SKU라인수 ${summary2.avgDistinctLines.toFixed(2)} / 평균 총수량 ${summary2.avgUnits.toFixed(2)}개`);
    console.table(summary2.itemCountDist.map((r) => ({ SKU라인수: r.n, 주문수: r.orders, 비중: `${(r.share * 100).toFixed(1)}%` })));
    console.table(summary2.categoryMix.map((r) => ({ 카테고리: r.category, 수량비중: `${(r.unitShare * 100).toFixed(1)}%`, 주문포함비중: `${(r.orderShare * 100).toFixed(1)}%` })));
    console.log("상위 구성 조합(카테고리 셋):");
    console.table(summary2.topCombos.map((r) => ({ ...r, share: `${(r.share * 100).toFixed(1)}%` })));
    console.log(`브라 포함 주문의 브라 평균 수량: ${summary2.braUnitsWhenBraPresent.avg?.toFixed(2)} (n=${summary2.braUnitsWhenBraPresent.n})`);
    console.log("상위 상품:");
    console.table(summary2.topProducts.slice(0, 10).map((r) => ({ ...r, avgQtyPerOrder: r.avgQtyPerOrder.toFixed(2) })));

    writeFileSync(
      `reports/repeat-purchase-basket-${country.replace(/\s+/g, "-").toLowerCase()}.json`,
      JSON.stringify({ country, period: { from: FROM, to: TO }, sampleSize: sample.length, firstPurchase: summary1, secondPurchase: summary2 }, null, 2),
      "utf8"
    );
  }
}

main();
