import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { shopifyGraphql } from "../shopify/index.js";

// 사용법: npx tsx src/report/bra-combo-detail.ts "<스타일A>" "<스타일B>" [fromDate] [toDate] [국가당 표본수]
// 예:    npx tsx src/report/bra-combo-detail.ts "COOL FIT BRA SIGNATURE" "COOL FIT BRA VOLUME FIT" 2026-01-01 2026-08-12 400
// 목적: 특정 두 스타일이 같은 주문에 같이 담긴 경우, 수량은 어느 쪽을 더 많이 넣는지 +
// 각 스타일별로 어떤 색상을 고르는지 상세 분해.
const STYLE_A = process.argv[2];
const STYLE_B = process.argv[3];
if (!STYLE_A || !STYLE_B) {
  console.error(`사용법: npx tsx src/report/bra-combo-detail.ts "<스타일A>" "<스타일B>" [fromDate] [toDate] [표본수]`);
  process.exit(1);
}
const TO = process.argv[5] ?? new Date().toISOString().slice(0, 10);
const FROM = process.argv[4] ?? (() => {
  const d = new Date(`${TO}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 7);
  return d.toISOString().slice(0, 10);
})();
const SAMPLE_PER_COUNTRY = Number(process.argv[6] ?? 400);
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

function colorOf(variantTitle: string | null): string {
  if (!variantTitle) return "(옵션없음)";
  return variantTitle.split("/")[0].trim();
}
function sizeOf(variantTitle: string | null): string {
  if (!variantTitle) return "(옵션없음)";
  const parts = variantTitle.split("/");
  return (parts[1] ?? "").trim() || "(사이즈없음)";
}
function bump<K>(m: Map<K, number>, k: K, n = 1) { m.set(k, (m.get(k) ?? 0) + n); }

async function main() {
  console.log(`조합: "${STYLE_A}" + "${STYLE_B}" / 기간 ${FROM}~${TO} / 국가당 표본 최대 ${SAMPLE_PER_COUNTRY}명`);
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
    // 1차/2차 둘 다 대상 (구매 순서 구분 없이 이 조합이 나온 모든 주문을 봄)
    const candidateIds = sample.flatMap((s) => [s[0].id, s[1].id]);
    const lineItemMap = await fetchLineItems(candidateIds);

    let comboOrders = 0;
    let aMoreCount = 0, bMoreCount = 0, tieCount = 0;
    const qtyPairFreq = new Map<string, number>(); // "A수량:B수량"
    let totalAQty = 0, totalBQty = 0;
    const colorFreqA = new Map<string, number>();
    const colorFreqB = new Map<string, number>();
    const sizeFreqA = new Map<string, number>();
    const sizeFreqB = new Map<string, number>();
    const thirdStyleFreq = new Map<string, number>();

    for (const id of candidateIds) {
      const items = lineItemMap.get(id) ?? [];
      const braLines = items.filter((i) => i.productType === "Bra");
      const hasA = braLines.some((l) => l.title === STYLE_A);
      const hasB = braLines.some((l) => l.title === STYLE_B);
      if (!hasA || !hasB) continue;
      comboOrders++;

      const linesA = braLines.filter((l) => l.title === STYLE_A);
      const linesB = braLines.filter((l) => l.title === STYLE_B);
      const qtyA = linesA.reduce((s, l) => s + l.quantity, 0);
      const qtyB = linesB.reduce((s, l) => s + l.quantity, 0);
      totalAQty += qtyA;
      totalBQty += qtyB;
      bump(qtyPairFreq, `${STYLE_A.split(" ").pop()}${qtyA} : ${STYLE_B.split(" ").pop()}${qtyB}`);
      if (qtyA > qtyB) aMoreCount++;
      else if (qtyB > qtyA) bMoreCount++;
      else tieCount++;

      for (const l of linesA) { bump(colorFreqA, colorOf(l.variantTitle), l.quantity); bump(sizeFreqA, sizeOf(l.variantTitle), l.quantity); }
      for (const l of linesB) { bump(colorFreqB, colorOf(l.variantTitle), l.quantity); bump(sizeFreqB, sizeOf(l.variantTitle), l.quantity); }

      const others = new Set(braLines.map((l) => l.title));
      others.delete(STYLE_A); others.delete(STYLE_B);
      for (const o of others) bump(thirdStyleFreq, o);
    }

    console.log(`\n\n========== ${country}: "${STYLE_A}" + "${STYLE_B}" 동시구매 주문 n=${comboOrders} ==========`);
    console.log(`총 ${STYLE_A} 수량 ${totalAQty} / 총 ${STYLE_B} 수량 ${totalBQty} (합산 비율 ${(totalAQty / (totalAQty + totalBQty) * 100).toFixed(1)}% : ${(totalBQty / (totalAQty + totalBQty) * 100).toFixed(1)}%)`);
    console.log(`주문별 비교: A(${STYLE_A}) 더 많음 ${aMoreCount}건(${((aMoreCount / comboOrders) * 100).toFixed(1)}%) / B(${STYLE_B}) 더 많음 ${bMoreCount}건(${((bMoreCount / comboOrders) * 100).toFixed(1)}%) / 동일 ${tieCount}건(${((tieCount / comboOrders) * 100).toFixed(1)}%)`);

    console.log("\n수량 조합 분포 (상위 10):");
    console.table([...qtyPairFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ 조합: k, count: v, share: `${((v / comboOrders) * 100).toFixed(1)}%` })));

    console.log(`\n${STYLE_A} 색상 분포 (수량 기준):`);
    console.table([...colorFreqA.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ color: c, qty: n, share: `${((n / totalAQty) * 100).toFixed(1)}%` })));
    console.log(`${STYLE_B} 색상 분포 (수량 기준):`);
    console.table([...colorFreqB.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ color: c, qty: n, share: `${((n / totalBQty) * 100).toFixed(1)}%` })));

    console.log(`\n${STYLE_A} 사이즈 분포:`);
    console.table([...sizeFreqA.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ size: s, qty: n, share: `${((n / totalAQty) * 100).toFixed(1)}%` })));
    console.log(`${STYLE_B} 사이즈 분포:`);
    console.table([...sizeFreqB.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ size: s, qty: n, share: `${((n / totalBQty) * 100).toFixed(1)}%` })));

    console.log("\n이 조합에 함께 곁들여지는 세번째 스타일 (있는 경우, 상위 10):");
    console.table([...thirdStyleFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, n]) => ({ style: s, count: n, share: `${((n / comboOrders) * 100).toFixed(1)}%` })));
  }
}

main();
