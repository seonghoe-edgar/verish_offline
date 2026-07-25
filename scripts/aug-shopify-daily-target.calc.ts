import fs from "fs";

const CSV_PATH = process.argv[2];
const TARGET = 3125608605;
const PROMO = { from: "2026-08-10", to: "2026-08-23", mult: 1.8 };

const KOR_DOW = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const lines = fs.readFileSync(CSV_PATH, "utf-8").trim().split("\n").slice(1);
const rows = lines.map((l) => {
  const [date, amount] = l.split(",");
  const d = new Date(date + "T00:00:00");
  return { date, dow: d.getDay(), amount: Number(amount) };
});

const byDow = new Map<number, { sum: number; count: number }>();
for (const r of rows) {
  const e = byDow.get(r.dow) ?? { sum: 0, count: 0 };
  e.sum += r.amount;
  e.count += 1;
  byDow.set(r.dow, e);
}

console.log(`clean window: ${rows[0].date}~${rows[rows.length - 1].date} (${rows.length}일, Shopify 해외 자사몰, USD)`);
console.log("\n요일별 평균 매출(USD):");
const avgByDow = new Map<number, number>();
for (let d = 0; d < 7; d++) {
  const e = byDow.get(d)!;
  const avg = e.sum / e.count;
  avgByDow.set(d, avg);
  console.log(`  ${KOR_DOW[d]}: 평균 ${avg.toFixed(2)} (n=${e.count})`);
}
const totalAvg = [...avgByDow.values()].reduce((a, b) => a + b, 0);
console.log("\n요일별 비중 (합 100%):");
for (let d = 0; d < 7; d++) {
  console.log(`  ${KOR_DOW[d]}: ${((avgByDow.get(d)! / totalAvg) * 100).toFixed(2)}%`);
}

const aug: { date: string; dow: number; baseIndex: number; mult: number }[] = [];
const cur = new Date(2026, 7, 1);
const end = new Date(2026, 7, 31);
while (cur <= end) {
  const dstr = ymd(cur);
  const dow = cur.getDay();
  const mult = dstr >= PROMO.from && dstr <= PROMO.to ? PROMO.mult : 1.0;
  aug.push({ date: dstr, dow, baseIndex: avgByDow.get(dow)!, mult });
  cur.setDate(cur.getDate() + 1);
}

const adjIndexSum = aug.reduce((s, r) => s + r.baseIndex * r.mult, 0);

let allocated = 0;
const results = aug.map((r) => {
  const adjIndex = r.baseIndex * r.mult;
  let amount = Math.round((adjIndex / adjIndexSum) * TARGET);
  allocated += amount;
  return { ...r, amount };
});
results[results.length - 1].amount += TARGET - allocated;

console.log("\n=== 8월 일별 배분 (해외 자사몰, 원화 목표 기준) ===");
console.log("date,dow,promo_mult,amount");
for (const r of results) {
  console.log(`${r.date},${KOR_DOW[r.dow]},${r.mult}x,${r.amount}`);
}

const sumCheck = results.reduce((s, r) => s + r.amount, 0);
console.log(`\n합계 검증: ${sumCheck.toLocaleString()} (목표: ${TARGET.toLocaleString()}, 일치: ${sumCheck === TARGET})`);

const promoSum = results.filter((r) => r.date >= PROMO.from && r.date <= PROMO.to).reduce((s, r) => s + r.amount, 0);
const restSum = sumCheck - promoSum;
console.log(`\n프로모션(8.10~8.23, x1.8) 합계: ${promoSum.toLocaleString()}`);
console.log(`나머지 기간 합계: ${restSum.toLocaleString()}`);
