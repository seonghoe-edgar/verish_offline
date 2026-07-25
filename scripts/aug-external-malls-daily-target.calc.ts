import fs from "fs";

const CSV_PATH = process.argv[2]; // cafe24_daily.csv (reused for weekday mix)
const TARGET = 1823000000;
const CLEAN_FROM = "20260601";
const CLEAN_TO = "20260713";
const FIXED_DATE = "2026-08-03";
const FIXED_AMOUNT = 47000000; // 지그재그 단독 라이브

const KOR_DOW = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
const avgByDow = new Map<number, number>();
for (let d = 0; d < 7; d++) avgByDow.set(d, byDow.get(d)!.sum / byDow.get(d)!.count);

console.log("요일별 기준지수 (자사몰 CAFE24 6/1~7/13 평균, 재사용):");
for (let d = 0; d < 7; d++) console.log(`  ${KOR_DOW[d]}: ${Math.round(avgByDow.get(d)!).toLocaleString()}`);

const aug: { date: string; dow: number; idx: number; fixed: boolean }[] = [];
const cur = new Date(2026, 7, 1);
const end = new Date(2026, 7, 31);
while (cur <= end) {
  const dstr = ymd(cur);
  const dow = cur.getDay();
  aug.push({ date: dstr, dow, idx: avgByDow.get(dow)!, fixed: dstr === FIXED_DATE });
  cur.setDate(cur.getDate() + 1);
}

const remaining = TARGET - FIXED_AMOUNT;
const idxSumExclFixed = aug.filter((r) => !r.fixed).reduce((s, r) => s + r.idx, 0);

let allocated = 0;
const nonFixed = aug.filter((r) => !r.fixed);
const results = aug.map((r) => {
  if (r.fixed) return { ...r, amount: FIXED_AMOUNT };
  const amount = Math.round((r.idx / idxSumExclFixed) * remaining);
  allocated += amount;
  return { ...r, amount };
});

// reconcile rounding on the last non-fixed day
const lastNonFixed = [...results].reverse().find((r) => !r.fixed)!;
const sumNonFixed = results.filter((r) => !r.fixed).reduce((s, r) => s + r.amount, 0);
lastNonFixed.amount += remaining - sumNonFixed;

console.log("\n=== 8월 일별 배분 (국내 외부몰 합산, 자사몰 요일비중 적용 + 8/3 지그재그 라이브 고정) ===");
console.log("date,dow,fixed,amount");
for (const r of results) {
  console.log(`${r.date},${KOR_DOW[r.dow]},${r.fixed ? "고정" : ""},${r.amount}`);
}

const total = results.reduce((s, r) => s + r.amount, 0);
console.log(`\n합계 검증: ${total.toLocaleString()} (목표: ${TARGET.toLocaleString()}, 일치: ${total === TARGET})`);
