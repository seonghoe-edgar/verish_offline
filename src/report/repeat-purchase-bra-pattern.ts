import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { shopifyGraphql } from "../shopify/index.js";

// 사용법: npx tsx src/report/repeat-purchase-bra-pattern.ts [fromDate] [toDate] [국가당 표본수]
// 목적: 1차/2차 구매의 "브라" 라인만 떼서, 믹스업(여러 스타일/색상 1개씩)으로 사는지
// vs 동일 스타일/색상을 복수로(확신구매) 사는지 패턴을 비교. 증정품(실결제 0원)은 제외.
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
    const edges = data.orders.edges;
    for (const e of edges) {
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

type Pattern = "단일 1개" | "동일SKU 복수(같은색 반복)" | "동일스타일 색상다양화" | "여러스타일 믹스(반복없음)" | "여러스타일 믹스+일부반복";

function classifyBra(braLines: LineItem[]): { pattern: Pattern; distinctSkuCount: number; totalQty: number; distinctStyles: Set<string>; distinctColors: Set<string> } {
  const distinctSkuCount = braLines.length; // (title+variant) 단위 라인 수
  const totalQty = braLines.reduce((s, l) => s + l.quantity, 0);
  const distinctStyles = new Set(braLines.map((l) => l.title));
  const distinctColors = new Set(braLines.map((l) => colorOf(l.variantTitle)));
  const maxLineQty = Math.max(...braLines.map((l) => l.quantity));

  let pattern: Pattern;
  if (totalQty <= 1) pattern = "단일 1개";
  else if (distinctStyles.size === 1 && distinctSkuCount === 1) pattern = "동일SKU 복수(같은색 반복)";
  else if (distinctStyles.size === 1 && distinctSkuCount >= 2) pattern = "동일스타일 색상다양화";
  else if (maxLineQty === 1) pattern = "여러스타일 믹스(반복없음)";
  else pattern = "여러스타일 믹스+일부반복";

  return { pattern, distinctSkuCount, totalQty, distinctStyles, distinctColors };
}

async function main() {
  console.log(`기간: ${FROM} ~ ${TO} / 국가당 표본 최대 ${SAMPLE_PER_COUNTRY}명 (브라 카테고리 구성 패턴)`);
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
    console.log(`\n\n========== ${country} (표본 ${sample.length}명) ==========`);

    const firstIds = sample.map((s) => s[0].id);
    const secondIds = sample.map((s) => s[1].id);
    const lineItemMap = await fetchLineItems([...firstIds, ...secondIds]);

    function analyze(ids: string[], label: string) {
      const patternCount = new Map<Pattern, number>();
      const qtyByPattern = new Map<Pattern, number[]>();
      let withBra = 0;
      let multiUnitBra = 0; // 2개 이상 산 주문만
      const multiPatternCount = new Map<Pattern, number>();

      for (const id of ids) {
        const items = lineItemMap.get(id) ?? [];
        const braLines = items.filter((i) => i.productType === "Bra");
        if (braLines.length === 0) continue;
        withBra++;
        const { pattern, totalQty } = classifyBra(braLines);
        patternCount.set(pattern, (patternCount.get(pattern) ?? 0) + 1);
        if (!qtyByPattern.has(pattern)) qtyByPattern.set(pattern, []);
        qtyByPattern.get(pattern)!.push(totalQty);
        if (totalQty >= 2) {
          multiUnitBra++;
          multiPatternCount.set(pattern, (multiPatternCount.get(pattern) ?? 0) + 1);
        }
      }
      console.log(`\n--- ${label} (브라 포함 주문 n=${withBra}) ---`);
      console.log("전체 분포 (브라 1개만 산 주문 포함):");
      console.table(
        [...patternCount.entries()].map(([p, c]) => ({ pattern: p, count: c, share: `${((c / withBra) * 100).toFixed(1)}%` }))
      );
      console.log(`브라 2개 이상 산 주문(n=${multiUnitBra}, 전체의 ${((multiUnitBra / withBra) * 100).toFixed(1)}%) 내에서의 분포:`);
      console.table(
        [...multiPatternCount.entries()].map(([p, c]) => ({ pattern: p, count: c, share: `${((c / multiUnitBra) * 100).toFixed(1)}%` }))
      );
      return { withBra, multiUnitBra, patternCount: Object.fromEntries(patternCount), multiPatternCount: Object.fromEntries(multiPatternCount) };
    }

    const s1 = analyze(firstIds, `${country} 1차구매`);
    const s2 = analyze(secondIds, `${country} 2차구매`);

    // 1차->2차 스타일/색상 지속성: 2차에서 산 브라 스타일/색상이 1차에도 있었는지
    let stylePersist = 0, colorPersist = 0, comparable = 0;
    for (const cust of sample) {
      const l1 = (lineItemMap.get(cust[0].id) ?? []).filter((i) => i.productType === "Bra");
      const l2 = (lineItemMap.get(cust[1].id) ?? []).filter((i) => i.productType === "Bra");
      if (l1.length === 0 || l2.length === 0) continue;
      comparable++;
      const styles1 = new Set(l1.map((l) => l.title));
      const colors1 = new Set(l1.map((l) => colorOf(l.variantTitle)));
      const styles2 = new Set(l2.map((l) => l.title));
      const colors2 = new Set(l2.map((l) => colorOf(l.variantTitle)));
      if ([...styles2].some((s) => styles1.has(s))) stylePersist++;
      if ([...colors2].some((c) => colors1.has(c))) colorPersist++;
    }
    console.log(`\n1차->2차 브라 지속성 (비교가능 n=${comparable}): 같은 스타일 재구매 ${((stylePersist / comparable) * 100).toFixed(1)}% / 같은 색상 재구매 ${((colorPersist / comparable) * 100).toFixed(1)}%`);

    writeFileSync(
      `reports/repeat-purchase-bra-pattern-${country.replace(/\s+/g, "-").toLowerCase()}.json`,
      JSON.stringify({ country, period: { from: FROM, to: TO }, firstPurchase: s1, secondPurchase: s2, persistence: { comparable, stylePersist, colorPersist } }, null, 2),
      "utf8"
    );
  }
}

main();
