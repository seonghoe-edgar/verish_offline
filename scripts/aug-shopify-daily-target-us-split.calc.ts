import fs from "fs";

const TOTAL_CSV = process.argv[2];
const US_CSV = process.argv[3];
const TARGET = 3125608605;
const PROMO = { from: "2026-08-10", to: "2026-08-23", mult: 1.8 };

const KOR_DOW = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadCsv(path: string): Map<string, number> {
  const lines = fs.readFileSync(path, "utf-8").trim().split("\n").slice(1);
  const m = new Map<string, number>();
  for (const l of lines) {
    const [date, amount] = l.split(",");
    m.set(date, Number(amount));
  }
  return m;
}

const totalMap = loadCsv(TOTAL_CSV);
const usMap = loadCsv(US_CSV);

const rows: { date: string; dow: number; us: number; nonUs: number }[] = [];
for (const [date, total] of totalMap) {
  const us = usMap.get(date)!;
  const d = new Date(date + "T00:00:00");
  rows.push({ date, dow: d.getDay(), us, nonUs: total - us });
}
rows.sort((a, b) => (a.date < b.date ? -1 : 1));

function avgByDow(rows: { dow: number; val: number }[]): Map<number, number> {
  const byDow = new Map<number, { sum: number; count: number }>();
  for (const r of rows) {
    const e = byDow.get(r.dow) ?? { sum: 0, count: 0 };
    e.sum += r.val;
    e.count += 1;
    byDow.set(r.dow, e);
  }
  const avg = new Map<number, number>();
  for (let d = 0; d < 7; d++) avg.set(d, byDow.get(d)!.sum / byDow.get(d)!.count);
  return avg;
}

const usAvg = avgByDow(rows.map((r) => ({ dow: r.dow, val: r.us })));
const nonUsAvg = avgByDow(rows.map((r) => ({ dow: r.dow, val: r.nonUs })));

console.log("요일별 평균 (USD) — 미국 / 미국외:");
for (let d = 0; d < 7; d++) {
  console.log(`  ${KOR_DOW[d]}: 미국=${usAvg.get(d)!.toFixed(0)}  미국외=${nonUsAvg.get(d)!.toFixed(0)}`);
}

// build august calendar: US index never uplifted, non-US index uplifted on promo days
const aug: { date: string; dow: number; mult: number; usIdx: number; nonUsIdx: number }[] = [];
const cur = new Date(2026, 7, 1);
const end = new Date(2026, 7, 31);
while (cur <= end) {
  const dstr = ymd(cur);
  const dow = cur.getDay();
  const mult = dstr >= PROMO.from && dstr <= PROMO.to ? PROMO.mult : 1.0;
  aug.push({ date: dstr, dow, mult, usIdx: usAvg.get(dow)!, nonUsIdx: nonUsAvg.get(dow)! * mult });
  cur.setDate(cur.getDate() + 1);
}

const grandTotalIdx = aug.reduce((s, r) => s + r.usIdx + r.nonUsIdx, 0);
const scale = TARGET / grandTotalIdx;

let allocatedUs = 0;
let allocatedNonUs = 0;
const results = aug.map((r, i) => {
  let usAmt = Math.round(r.usIdx * scale);
  let nonUsAmt = Math.round(r.nonUsIdx * scale);
  allocatedUs += usAmt;
  allocatedNonUs += nonUsAmt;
  return { ...r, usAmt, nonUsAmt };
});
// reconcile rounding: last day's non-US amount absorbs whatever remainder
// is needed so the grand total hits the fixed target exactly
const sumSoFar = results.reduce((s, r) => s + r.usAmt + r.nonUsAmt, 0);
results[results.length - 1].nonUsAmt += TARGET - sumSoFar;

console.log("\n=== 8월 일별 배분 (미국 vs 미국외, 프로모션은 미국외에만 적용) ===");
console.log("date,dow,mult,us_amount,non_us_amount,total");
for (const r of results) {
  console.log(`${r.date},${KOR_DOW[r.dow]},${r.mult}x,${r.usAmt},${r.nonUsAmt},${r.usAmt + r.nonUsAmt}`);
}

const finalUsTotal = results.reduce((s, r) => s + r.usAmt, 0);
const finalNonUsTotal = results.reduce((s, r) => s + r.nonUsAmt, 0);
const finalTotal = finalUsTotal + finalNonUsTotal;
console.log(`\n미국 합계: ${finalUsTotal.toLocaleString()}`);
console.log(`미국외 합계: ${finalNonUsTotal.toLocaleString()}`);
console.log(`전체 합계: ${finalTotal.toLocaleString()} (목표 ${TARGET.toLocaleString()}, 일치: ${finalTotal === TARGET})`);

const promoNonUs = results.filter((r) => r.mult > 1).reduce((s, r) => s + r.nonUsAmt, 0);
const promoUs = results.filter((r) => r.mult > 1).reduce((s, r) => s + r.usAmt, 0);
console.log(`\n프로모션 구간(8.10~8.23) 미국외 합계: ${promoNonUs.toLocaleString()} (업리프트 적용됨)`);
console.log(`프로모션 구간(8.10~8.23) 미국 합계: ${promoUs.toLocaleString()} (업리프트 미적용, 평시 요일 지수 그대로)`);
