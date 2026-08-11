import { writeFileSync } from "node:fs";
import { shopifyGraphql } from "../shopify/index.js";

// 사용법: npx tsx src/report/repeat-purchase-timing.ts [fromDate] [toDate]
// 예:    npx tsx src/report/repeat-purchase-timing.ts 2026-02-12 2026-08-12
// 목적: 국가별 재구매 "골든타임"(직전 구매 -> 다음 구매 소요일 분포)과
//       재구매 시 같은 상품/다른 상품을 사는지 양상을 확인.
//
// 주의: Customer.orders 커넥션은 numberOfOrders와 불일치하는 경우가 많고(구버전 주문 누락 등),
// orders(query:) 검색은 country 필드를 지원하지 않아(무시됨) 두 방법 모두 신뢰 불가.
// 그래서 orders 루트를 생성일 기준으로 전량 스캔해 billingAddress.country로 직접 분류한다.
const TO = process.argv[3] ?? new Date().toISOString().slice(0, 10);
const FROM = process.argv[2] ?? (() => {
  const d = new Date(`${TO}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 6);
  return d.toISOString().slice(0, 10);
})();

const TARGET_COUNTRIES = ["Hong Kong", "Taiwan"];
const PAGE_SIZE = 250;

interface OrderLite {
  id: string;
  createdAt: string;
  customerId: string | null;
  country: string | null;
}

const ORDERS_QUERY = `
query Orders($query: String!, $first: Int!, $after: String) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        createdAt
        customer { id }
        billingAddress { country }
      }
    }
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
      out.push({
        id: e.node.id,
        createdAt: e.node.createdAt,
        customerId: e.node.customer?.id ?? null,
        country: e.node.billingAddress?.country ?? null,
      });
    }
    page++;
    if (page % 10 === 0 || !data.orders.pageInfo.hasNextPage) {
      console.log(`  page ${page}, 누적 주문 ${out.length}건...`);
    }
    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }
  return out;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

const BUCKET_DEFS: [string, number, number][] = [
  ["0-3일", 0, 3], ["4-7일", 4, 7], ["8-14일", 8, 14], ["15-21일", 15, 21],
  ["22-30일", 22, 30], ["31-45일", 31, 45], ["46-60일", 46, 60], ["61-90일", 61, 90],
  ["91-120일", 91, 120], ["121-180일", 121, 180], ["181일+", 181, Infinity],
];
function bucketOf(days: number): string {
  for (const [name, lo, hi] of BUCKET_DEFS) if (days >= lo && days <= hi) return name;
  return "181일+";
}
function bucketWidth(name: string): number {
  const def = BUCKET_DEFS.find((b) => b[0] === name);
  if (!def) return 1;
  return def[2] === Infinity ? 30 : def[2] - def[1] + 1;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

const NODES_QUERY = `
query Nodes($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Order {
      id
      lineItems(first: 3) { edges { node { title } } }
    }
  }
}`;

async function fetchLineItemTitles(ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const data: any = await shopifyGraphql(NODES_QUERY, { ids: batch });
    for (const n of data.nodes) {
      if (!n) continue;
      map.set(n.id, n.lineItems.edges.map((e: any) => e.node.title));
    }
  }
  return map;
}

async function main() {
  console.log(`기간: ${FROM} ~ ${TO} (전체 국가 스캔 후 국가별로 분류)`);
  const orders = await fetchAllOrders(FROM, TO);
  console.log(`총 수집 주문: ${orders.length}건`);

  const byCountryCustomer = new Map<string, Map<string, OrderLite[]>>();
  for (const o of orders) {
    if (!o.country || !o.customerId) continue;
    if (!TARGET_COUNTRIES.includes(o.country)) continue;
    if (!byCountryCustomer.has(o.country)) byCountryCustomer.set(o.country, new Map());
    const custMap = byCountryCustomer.get(o.country)!;
    if (!custMap.has(o.customerId)) custMap.set(o.customerId, []);
    custMap.get(o.customerId)!.push(o);
  }

  for (const country of TARGET_COUNTRIES) {
    const custMap = byCountryCustomer.get(country) ?? new Map();
    console.log(`\n\n========== ${country} (윈도우 내 고유 고객 ${custMap.size}명) ==========`);

    const gap1Days: number[] = [];
    const gap2Days: number[] = [];
    const gap1Bucket = new Map<string, number>();
    const gap2Bucket = new Map<string, number>();
    const firstTwoOrderIdPairs: { first: string; second: string }[] = [];

    for (const list of custMap.values()) {
      const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (sorted.length < 2) continue;
      const g1 = daysBetween(sorted[0].createdAt, sorted[1].createdAt);
      gap1Days.push(g1);
      const b1 = bucketOf(g1);
      gap1Bucket.set(b1, (gap1Bucket.get(b1) ?? 0) + 1);
      firstTwoOrderIdPairs.push({ first: sorted[0].id, second: sorted[1].id });

      if (sorted.length >= 3) {
        const g2 = daysBetween(sorted[1].createdAt, sorted[2].createdAt);
        gap2Days.push(g2);
        const b2 = bucketOf(g2);
        gap2Bucket.set(b2, (gap2Bucket.get(b2) ?? 0) + 1);
      }
    }

    gap1Days.sort((a, b) => a - b);
    gap2Days.sort((a, b) => a - b);

    const gap1Table = [...gap1Bucket.entries()]
      .sort((a, b) => BUCKET_DEFS.findIndex((d) => d[0] === a[0]) - BUCKET_DEFS.findIndex((d) => d[0] === b[0]))
      .map(([bucket, count]) => ({ bucket, count, share: count / gap1Days.length, density: count / bucketWidth(bucket) }));
    const gap2Table = [...gap2Bucket.entries()]
      .sort((a, b) => BUCKET_DEFS.findIndex((d) => d[0] === a[0]) - BUCKET_DEFS.findIndex((d) => d[0] === b[0]))
      .map(([bucket, count]) => ({ bucket, count, share: gap2Days.length > 0 ? count / gap2Days.length : 0, density: count / bucketWidth(bucket) }));

    const topGolden1 = [...gap1Table].sort((a, b) => b.density - a.density).slice(0, 3);
    const topGolden2 = [...gap2Table].sort((a, b) => b.density - a.density).slice(0, 3);

    console.log(`윈도우 내 2회+ 구매 고객: ${gap1Days.length}명`);
    console.log(`1차->2차 구입 간격(일): median=${percentile(gap1Days, 50)}, p25=${percentile(gap1Days, 25)}, p75=${percentile(gap1Days, 75)}, mean=${(gap1Days.reduce((s, x) => s + x, 0) / (gap1Days.length || 1)).toFixed(1)}`);
    if (gap2Days.length > 0) {
      console.log(`2차->3차 구입 간격(일): median=${percentile(gap2Days, 50)}, p25=${percentile(gap2Days, 25)}, p75=${percentile(gap2Days, 75)}, mean=${(gap2Days.reduce((s, x) => s + x, 0) / gap2Days.length).toFixed(1)}, n=${gap2Days.length}`);
    }
    console.log("밀도 상위 구간(골든타임 후보, 1→2차):");
    console.table(topGolden1);
    console.log("전체 간격 분포 (1→2차):");
    console.table(gap1Table.map((r) => ({ ...r, share: `${(r.share * 100).toFixed(1)}%`, density: r.density.toFixed(2) })));
    if (gap2Table.length > 0) {
      console.log("전체 간격 분포 (2→3차):");
      console.table(gap2Table.map((r) => ({ ...r, share: `${(r.share * 100).toFixed(1)}%`, density: r.density.toFixed(2) })));
    }

    // 상품 패턴: 표본 최대 125명 (nodes 250개 이내)
    const sample = firstTwoOrderIdPairs.slice(0, 125);
    const ids = sample.flatMap((p) => [p.first, p.second]);
    let sameProductRepeat = 0;
    let diffProductOnly = 0;
    if (ids.length > 0) {
      const titleMap = await fetchLineItemTitles(ids);
      for (const pair of sample) {
        const t1 = new Set(titleMap.get(pair.first) ?? []);
        const t2 = new Set(titleMap.get(pair.second) ?? []);
        if (t1.size === 0 || t2.size === 0) continue;
        const overlap = [...t1].some((t) => t2.has(t));
        if (overlap) sameProductRepeat++;
        else diffProductOnly++;
      }
    }
    const productComparable = sameProductRepeat + diffProductOnly;
    console.log(`\n재구매(1→2차) 상품 패턴 표본 ${productComparable}건: 동일상품 재구매 ${productComparable > 0 ? ((sameProductRepeat / productComparable) * 100).toFixed(1) : "-"}% / 신규상품만 ${productComparable > 0 ? ((diffProductOnly / productComparable) * 100).toFixed(1) : "-"}%`);

    const result = {
      country,
      period: { from: FROM, to: TO },
      uniqueCustomersInWindow: custMap.size,
      repeaters1to2: gap1Days.length,
      repeaters2to3: gap2Days.length,
      gap1Stats: { median: percentile(gap1Days, 50), p25: percentile(gap1Days, 25), p75: percentile(gap1Days, 75), mean: gap1Days.reduce((s, x) => s + x, 0) / (gap1Days.length || 1) },
      gap2Stats: gap2Days.length > 0 ? { median: percentile(gap2Days, 50), p25: percentile(gap2Days, 25), p75: percentile(gap2Days, 75), mean: gap2Days.reduce((s, x) => s + x, 0) / gap2Days.length } : null,
      topGoldenBuckets_1to2: topGolden1,
      topGoldenBuckets_2to3: topGolden2,
      gap1Distribution: gap1Table,
      gap2Distribution: gap2Table,
      productPattern_1to2: { comparable: productComparable, sameProductShare: productComparable > 0 ? sameProductRepeat / productComparable : null, newProductOnlyShare: productComparable > 0 ? diffProductOnly / productComparable : null },
    };
    writeFileSync(`reports/repeat-purchase-timing-${country.replace(/\s+/g, "-").toLowerCase()}.json`, JSON.stringify(result, null, 2), "utf8");
  }
}

main();
