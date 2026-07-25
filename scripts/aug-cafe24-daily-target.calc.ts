import fs from "fs";

const CSV_PATH = process.argv[2];
const TARGET = 4177348798;
const PROMO1 = { from: "20260803", to: "20260814", mult: 1.5 };
const PROMO2 = { from: "20260818", to: "20260824", mult: 4.0 };
// exclude 7/14 onward: settlement-lag artifact (near-zero recorded), not real demand
const CLEAN_FROM = "20260601";
const CLEAN_TO = "20260713";

const KOR_DOW = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

const lines = fs.readFileSync(CSV_PATH, "utf-8").trim().split("\n").slice(1);
const rows = lines.map((l) => {
  const [date, dow, amount] = l.split(",");
  return { date, dow: Number(dow), amount: Number(amount) };
});

const clean = rows.filter((r) => r.date >= CLEAN_FROM && r.date <= CLEAN_TO);

const byDow = new Map<number, { sum: number; count: number }>();
for (const r of clean) {
  const e = byDow.get(r.dow) ?? { sum: 0, count: 0 };
  e.sum += r.amount;
  e.count += 1;
  byDow.set(r.dow, e);
}

console.log(`clean window: ${CLEAN_FROM}~${CLEAN_TO} (${clean.length} days)`);
console.log("\n요일별 평균 매출 (기준: 6/1~7/13, 정산 지연으로 7/14 이후 제외)");
const avgByDow = new Map<number, number>();
for (let d = 0; d < 7; d++) {
  const e = byDow.get(d)!;
  const avg = e.sum / e.count;
  avgByDow.set(d, avg);
  console.log(`  ${KOR_DOW[d]}: 평균 ${Math.round(avg).toLocaleString()}원 (n=${e.count})`);
}
const totalAvg = [...avgByDow.values()].reduce((a, b) => a + b, 0);
console.log("\n요일별 비중 (합 100%):");
for (let d = 0; d < 7; d++) {
  console.log(`  ${KOR_DOW[d]}: ${((avgByDow.get(d)! / totalAvg) * 100).toFixed(2)}%`);
}

// build august calendar
const aug: { date: string; dow: number; baseIndex: number; mult: number }[] = [];
const cur = new Date(2026, 7, 1);
const end = new Date(2026, 7, 31);
while (cur <= end) {
  const dstr = ymd(cur);
  const dow = cur.getDay();
  let mult = 1.0;
  if (dstr >= PROMO1.from && dstr <= PROMO1.to) mult = PROMO1.mult;
  if (dstr >= PROMO2.from && dstr <= PROMO2.to) mult = PROMO2.mult;
  aug.push({ date: dstr, dow, baseIndex: avgByDow.get(dow)!, mult });
  cur.setDate(cur.getDate() + 1);
}

const adjIndexSum = aug.reduce((s, r) => s + r.baseIndex * r.mult, 0);

let allocated = 0;
const results = aug.map((r, i) => {
  const adjIndex = r.baseIndex * r.mult;
  let amount = Math.round((adjIndex / adjIndexSum) * TARGET);
  allocated += amount;
  return { ...r, amount };
});
// reconcile rounding remainder onto the last day
results[results.length - 1].amount += TARGET - allocated;

console.log("\n=== 8월 일별 배분 ===");
console.log("date,dow,promo_mult,amount");
for (const r of results) {
  console.log(`${r.date},${KOR_DOW[r.dow]},${r.mult}x,${r.amount}`);
}

const sumCheck = results.reduce((s, r) => s + r.amount, 0);
console.log(`\n합계 검증: ${sumCheck.toLocaleString()} (목표: ${TARGET.toLocaleString()}, 일치: ${sumCheck === TARGET})`);

const promo1Sum = results.filter((r) => r.date >= PROMO1.from && r.date <= PROMO1.to).reduce((s, r) => s + r.amount, 0);
const promo2Sum = results.filter((r) => r.date >= PROMO2.from && r.date <= PROMO2.to).reduce((s, r) => s + r.amount, 0);
const restSum = sumCheck - promo1Sum - promo2Sum;
console.log(`\n1차 프로모션(8.3~8.14, x1.5) 합계: ${promo1Sum.toLocaleString()}`);
console.log(`2차 프로모션(8.18~8.24, x4.0) 합계: ${promo2Sum.toLocaleString()}`);
console.log(`나머지 기간 합계: ${restSum.toLocaleString()}`);
