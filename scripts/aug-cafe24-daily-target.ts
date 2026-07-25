import { getSales } from "../src/endpoints/sales.js";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function dailyNet(shop: string, from: Date, to: Date): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  // API caps date-range queries at 4 days per call, so chunk the window.
  const CHUNK_DAYS = 4;
  let chunkStart = new Date(from);
  while (chunkStart <= to) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + (CHUNK_DAYS - 1));
    if (chunkEnd > to) chunkEnd.setTime(to.getTime());

    console.error(`fetching ${ymd(chunkStart)}..${ymd(chunkEnd)}`);
    const sales = await getSales({ from: ymd(chunkStart), to: ymd(chunkEnd), shop });
    console.error(`  -> ${sales.length} records`);
    for (const s of sales) {
      const key = s.salesDate; // yyyyMMdd
      const signed = s.salesType === "2" ? -Math.abs(s.paymentAmount) : s.paymentAmount;
      result.set(key, (result.get(key) ?? 0) + signed);
    }

    chunkStart = new Date(chunkEnd);
    chunkStart.setDate(chunkStart.getDate() + 1);
  }
  return result;
}

async function main() {
  const shop = "CAFE24";
  const from = new Date(2026, 5, 1); // 2026-06-01
  const to = new Date(2026, 6, 24); // 2026-07-24 (yesterday, last full day)

  const daily = await dailyNet(shop, from, to);

  // fill zero for missing dates in range
  const cur = new Date(from);
  const rows: { date: string; dow: number; amount: number }[] = [];
  while (cur <= to) {
    const key = ymd(cur);
    rows.push({ date: key, dow: cur.getDay(), amount: daily.get(key) ?? 0 });
    cur.setDate(cur.getDate() + 1);
  }

  console.log("date,dow,amount");
  for (const r of rows) console.log(`${r.date},${r.dow},${r.amount}`);

  const byDow = new Map<number, { sum: number; count: number }>();
  for (const r of rows) {
    const e = byDow.get(r.dow) ?? { sum: 0, count: 0 };
    e.sum += r.amount;
    e.count += 1;
    byDow.set(r.dow, e);
  }

  console.error("\n--- dow averages (0=Sun..6=Sat) ---");
  for (let d = 0; d < 7; d++) {
    const e = byDow.get(d);
    console.error(`${d}: avg=${e ? Math.round(e.sum / e.count) : 0} sum=${e?.sum ?? 0} count=${e?.count ?? 0}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
