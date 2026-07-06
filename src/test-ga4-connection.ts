import { runReport, Ga4ApiError } from "./ga4/index.js";

async function main() {
  try {
    console.log("1) 기본 연결 확인 (최근 7일 국가별 세션/페이지뷰)...");
    const basic = await runReport({
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      dimensions: [{ name: "country" }],
      metrics: [{ name: "sessions" }, { name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    });
    console.log("연결 성공. 상위 국가:");
    for (const row of basic.rows ?? []) {
      console.log(" ", row.dimensionValues.map((d) => d.value).join(" / "), "→", row.metricValues.map((m) => m.value).join(" / "));
    }

    console.log("\n2) 페이지 경로 × 국가별 조회수 (대만/홍콩, 최근 7일)...");
    const byPage = await runReport({
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      dimensions: [{ name: "pagePath" }, { name: "country" }],
      metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
      dimensionFilter: {
        filter: {
          fieldName: "country",
          inListFilter: { values: ["Taiwan", "Hong Kong"] },
        },
      },
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 15,
    });
    for (const row of byPage.rows ?? []) {
      console.log(" ", row.dimensionValues.map((d) => d.value).join(" | "), "→", row.metricValues.map((m) => m.value).join(" / "));
    }
  } catch (err) {
    if (err instanceof Ga4ApiError) {
      console.error(`연결 실패 (status: ${err.status ?? "unknown"}): ${err.message}`);
    } else {
      console.error("예상치 못한 오류:", err);
    }
    process.exitCode = 1;
  }
}

main();
