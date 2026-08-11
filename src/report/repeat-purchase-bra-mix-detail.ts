import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { shopifyGraphql } from "../shopify/index.js";

// 사용법: npx tsx src/report/repeat-purchase-bra-mix-detail.ts [fromDate] [toDate] [국가당 표본수]
// 목적: "여러 스타일 믹스"로 브라를 사는 주문에서, 정확히 몇 종류를 섞는지 + 어떤 스타일 조합이
// 실제로 자주 같이 팔리는지(스타일 쌍 co-occurrence)를 본다. repeat-purchase-bra-pattern.ts의
// 세부 확장판. 같은 order-scan 캐시를 재사용.
const TO = process.argv[3] ?? new Date().toISOString().slice(0, 10);
const FROM = process.argv[2] ?? (() => {
  const d = new Date(`${TO}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 7);
  return d.toISOString().slice(0, 10);
})();
const SAMPLE_PER_COUNTRY = Number(process.argv[4] ?? 400);
const TARGET_COUNTRIES = ["Hong Kong", "Taiwan"];
const PAGE_SIZE = 250;
const CACHE_FILE = `reports/_order-scan-cache-${FROM}_${TO}.json`;

interface OrderLite { id: string; createdAt: string; customerId: string | null; country: string | null; }

const ORDERS_QUERY = `
query Orders($query: String!, $first: Int!, $after: String) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    edges { node { id createdAt customer { id } billingAddress { country } } }
  }
}`;

async function fetchAllOrders(from: string, to: string): Promise<OrderLite[]> {
  if (existsSync(CACHE_FILE)) {
    console.log(`캐시 사용: ${CACHE_FILE}`);
    return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  }
  const q = `created_at:>=${from} AND created_at:<${to}`;
  const out: OrderLite[] = [];
  let after: string | null = null;
  let page = 0;
  while (true) {
    const data: any = await shopifyGraphql(ORDERS_QUERY, { query: q, first: PAGE_SIZE, after });
    for (const e of data.orders.edges) {
      out.push({ id: e.node.id, createdAt: e.node.createdAt, customerId: e.node.customer?.id ?? null, country: e.node.billingAddress?.country ?? null });
    }
    page++;
    if (page % 10 === 0 || !data.orders.pageInfo.hasNextPage) console.log(`  page ${page}, 누적 주문 ${out.length}건...`);
    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }
  writeFileSync(CACHE_FILE, JSON.stringify(out), "utf8");
  return out;
}

interface LineItem { title: string; variantTitle: string | null; quantity: number; productType: string | null; paidTotal: number }
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
async function fetchLineItems(ids: string[]): Promise<Map<string, LineItem[]>> {
  const map = new Map<string, LineItem[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const data: any = await shopifyGraphql(NODES_QUERY, { ids: batch });
    for (const n of data.nodes) {
      if (!n) continue;
      const items: LineItem[] = n.lineItems.edges
        .map((e: any) => ({
          title: e.node.title, variantTitle: e.node.variantTitle, quantity: e.node.quantity,
          productType: e.node.product?.productType ?? "기타",
          paidTotal: Number(e.node.discountedTotalSet?.shopMoney?.amount ?? 0),
        }))
        .filter((li: LineItem) => li.paidTotal > 0);
      map.set(n.id, items);
    }
  }
  return map;
}

function bump<K>(m: Map<K, number>, k: K, n = 1) { m.set(k, (m.get(k) ?? 0) + n); }

async function main() {
  console.log(`기간: ${FROM} ~ ${TO} / 국가당 표본 최대 ${SAMPLE_PER_COUNTRY}명 (믹스 스타일 조합 상세)`);
  const orders = await fetchAllOrders(FROM, TO);
  console.log(`총 주문: ${orders.length}건`);

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

    const firstIds = sample.map((s) => s[0].id);
    const secondIds = sample.map((s) => s[1].id);
    const lineItemMap = await fetchLineItems([...firstIds, ...secondIds]);

    function analyze(ids: string[], label: string) {
      const styleCountDist = new Map<number, number>();
      const fullComboFreq = new Map<string, number>();
      const pairFreq = new Map<string, number>();
      let mixedOrders = 0;

      for (const id of ids) {
        const items = lineItemMap.get(id) ?? [];
        const braLines = items.filter((i) => i.productType === "Bra");
        const styles = [...new Set(braLines.map((l) => l.title))];
        if (styles.length < 2) continue; // "믹스"는 스타일 2종 이상인 경우만
        mixedOrders++;
        bump(styleCountDist, styles.length);
        const sorted = [...styles].sort();
        bump(fullComboFreq, sorted.join(" + "));
        for (let i = 0; i < sorted.length; i++) {
          for (let j = i + 1; j < sorted.length; j++) {
            bump(pairFreq, `${sorted[i]} + ${sorted[j]}`);
          }
        }
      }

      console.log(`\n--- ${label} (믹스 주문 n=${mixedOrders}) ---`);
      console.log("스타일 개수 분포:");
      console.table(
        [...styleCountDist.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => ({ 스타일수: n, 주문수: c, 비중: `${((c / mixedOrders) * 100).toFixed(1)}%` }))
      );
      console.log("상위 전체조합(정확히 이 스타일 셋):");
      console.table(
        [...fullComboFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([combo, c]) => ({ combo, count: c, share: `${((c / mixedOrders) * 100).toFixed(1)}%` }))
      );
      console.log("상위 스타일 쌍(co-occurrence, 셋 크기 무관하게 두 스타일이 같은 주문에 같이 있으면 카운트):");
      console.table(
        [...pairFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([pair, c]) => ({ pair, count: c, shareOfMixedOrders: `${((c / mixedOrders) * 100).toFixed(1)}%` }))
      );

      return {
        mixedOrders,
        styleCountDist: Object.fromEntries(styleCountDist),
        topFullCombos: [...fullComboFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
        topPairs: [...pairFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
      };
    }

    const s1 = analyze(firstIds, `${country} 1차구매`);
    const s2 = analyze(secondIds, `${country} 2차구매`);

    writeFileSync(
      `reports/repeat-purchase-bra-mix-detail-${country.replace(/\s+/g, "-").toLowerCase()}.json`,
      JSON.stringify({ country, period: { from: FROM, to: TO }, firstPurchase: s1, secondPurchase: s2 }, null, 2),
      "utf8"
    );
  }
}

main();
