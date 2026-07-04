import { getDashboardData, MashApiError } from "./mash/index.js";

async function main() {
  const dashboardUid = process.env.MASH_DASHBOARD_UID;
  if (!dashboardUid) throw new Error("Missing MASH_DASHBOARD_UID in .env");

  try {
    const data = await getDashboardData({
      dashboardUid,
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });

    console.log("연결 성공.", `대시보드: ${data.dashboard_name} (${data.dashboard_uid})`);
    if (data.is_all_data_available === false) {
      console.log("일부 데이터 누락:", JSON.stringify(data.missing_data, null, 2));
    }

    const widgetEntries = Object.entries(data.widgets);
    console.log(`\n위젯 ${widgetEntries.length}개:`);
    for (const [widgetId, widget] of widgetEntries) {
      const sample = widget.data?.records?.[0];
      console.log(`- [${widgetId}] ${widget.name} (records: ${widget.data?.records?.length ?? 0})`);
      if (sample) console.log(`  예시: ${JSON.stringify(sample).slice(0, 200)}`);
    }
  } catch (err) {
    if (err instanceof MashApiError) {
      console.error(`연결 실패 (status: ${err.status ?? "unknown"}): ${err.message}`);
      if (err.body) console.error(JSON.stringify(err.body, null, 2));
    } else {
      console.error("예상치 못한 오류:", err);
    }
    process.exitCode = 1;
  }
}

main();
