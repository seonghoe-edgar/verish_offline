import { writeFileSync } from "node:fs";
import { getDailyStoreMetrics, DailyStoreMetrics } from "./storeMetrics.js";

// ISO 8601 주차: 월요일 시작, 1/1이 포함된 주가 1주차가 아니라 이 스프레드시트는
// "1/1이 속한 목~일 조각"을 그대로 1주차로 쓰고 다음 월요일부터 2주차 — 즉 표준 ISO 주차와 동일.
function isoWeek(dateIso: string): number {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7; // 월=0 ... 일=6
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  return 1 + Math.round((firstThursday - target.valueOf()) / (7 * 24 * 60 * 60 * 1000));
}

function sumRows(rows: DailyStoreMetrics[]) {
  const visitors = rows.reduce((s, r) => s + r.visitors, 0);
  const receiptCount = rows.reduce((s, r) => s + r.receiptCount, 0);
  const totalQty = rows.reduce((s, r) => s + r.totalQty, 0);
  const totalTagPrice = rows.reduce((s, r) => s + r.totalTagPrice, 0);
  const totalSalesPrice = rows.reduce((s, r) => s + r.totalSalesPrice, 0);
  const discountAmount = rows.reduce((s, r) => s + r.discountAmount, 0);
  const totalPaymentAmount = rows.reduce((s, r) => s + r.totalPaymentAmount, 0);
  const foreignSalesAmount = rows.reduce((s, r) => s + r.foreignSalesAmount, 0);
  return {
    visitors,
    receiptCount,
    conversionRate: visitors > 0 ? receiptCount / visitors : null,
    totalQty,
    totalTagPrice,
    totalSalesPrice,
    discountAmount,
    totalPaymentAmount,
    foreignSalesAmount,
    foreignSalesRatio: totalPaymentAmount > 0 ? foreignSalesAmount / totalPaymentAmount : null,
    aov: receiptCount > 0 ? totalPaymentAmount / receiptCount : null,
    upt: receiptCount > 0 ? totalQty / receiptCount : null,
  };
}

async function main() {
  const shopCode = "VRJAFS";
  const mashPlace = "애월";
  const fromDate = "2026-06-19";
  const toDate = "2026-07-04";

  const daily = await getDailyStoreMetrics(shopCode, mashPlace, fromDate, toDate);

  const byMonth = new Map<string, DailyStoreMetrics[]>();
  const byMonthWeek = new Map<string, DailyStoreMetrics[]>();
  for (const row of daily) {
    const month = row.date.slice(0, 7);
    const week = isoWeek(row.date);
    const monthKey = month;
    const monthWeekKey = `${month}#${week}`;
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, []);
    byMonth.get(monthKey)!.push(row);
    if (!byMonthWeek.has(monthWeekKey)) byMonthWeek.set(monthWeekKey, []);
    byMonthWeek.get(monthWeekKey)!.push(row);
  }

  const months = [...byMonth.keys()].sort();
  const report = {
    shopCode,
    mashPlace,
    fromDate,
    toDate,
    total: sumRows(daily),
    months: months.map((month) => {
      const monthRows = byMonth.get(month)!;
      const weekKeys = [...byMonthWeek.keys()].filter((k) => k.startsWith(`${month}#`));
      const weekNumbers = [...new Set(weekKeys.map((k) => Number(k.split("#")[1])))].sort((a, b) => a - b);
      return {
        month,
        summary: sumRows(monthRows),
        weeks: weekNumbers.map((week) => ({
          week,
          summary: sumRows(byMonthWeek.get(`${month}#${week}`)!),
        })),
      };
    }),
    daily: daily.map((row) => ({ ...row, week: isoWeek(row.date) })),
  };

  writeFileSync("store-report-preview.json", JSON.stringify(report, null, 2), "utf8");
  console.log(`애월 (${fromDate} ~ ${toDate}) 리포트 생성 완료 -> store-report-preview.json`);
  console.log("전체 합계:", report.total);
}

main();
