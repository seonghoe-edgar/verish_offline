import { readFileSync } from "node:fs";

// 사용법: npx tsx src/report/voc-for-date.ts <YYYY-MM-DD>
// reports/store-voc-log.json에서 대상일 항목만 매장별로 그룹핑하고, 마감보고로 보이는
// 메시지(:pushpin: 포함, 여러 건이면 가장 긴 것)의 전체 원문을 stdout으로 바로 출력한다.
// 별도 임시 파일 덤프 없이 한 번의 호출로 끝내기 위한 스크립트 — 오픈보고/봇알림 등
// 노이즈 메시지는 자동으로 걸러낸다.
const LOG_FILE = "reports/store-voc-log.json";

const target = process.argv[2];
if (!target) {
  console.error("사용법: npx tsx src/report/voc-for-date.ts <YYYY-MM-DD>");
  process.exit(1);
}

interface VocEntry {
  store: string;
  channelId: string;
  channelName: string;
  ts: string;
  date: string;
  text: string;
}

const all: VocEntry[] = JSON.parse(readFileSync(LOG_FILE, "utf8"));
const forDate = all.filter((e) => e.date === target);

const byStore = new Map<string, VocEntry[]>();
for (const e of forDate) {
  if (!byStore.has(e.store)) byStore.set(e.store, []);
  byStore.get(e.store)!.push(e);
}

const stores = [...byStore.keys()].sort();
console.log(`대상일: ${target} — ${forDate.length}건 / ${stores.length}개 매장`);

for (const store of stores) {
  const entries = byStore.get(store)!;
  const closingCandidates = entries.filter((e) => e.text.includes(":pushpin:"));
  const closing = closingCandidates.sort((a, b) => b.text.length - a.text.length)[0];

  console.log(`\n${"#".repeat(5)} ${store} ${"#".repeat(5)}`);
  if (closing) {
    console.log(closing.text);
    const skipped = entries.length - 1;
    if (skipped > 0) console.log(`\n(같은 날 오픈보고/노이즈 등 ${skipped}건은 생략함)`);
  } else {
    console.log(`마감보고 형식(:pushpin:) 메시지를 찾지 못함 — 원문 ${entries.length}건 미리보기:`);
    for (const e of entries) {
      console.log(`  ts=${e.ts} len=${e.text.length} ${e.text.slice(0, 80).replace(/\n/g, " ")}`);
    }
  }
}

const missing = ["도산", "성수", "안국", "명동", "신제주", "애월", "신세계-대전", "스타필드-하남", "동부산-아울렛"].filter(
  (s) => !byStore.has(s)
);
if (missing.length > 0) console.log(`\n(데이터 없는 매장: ${missing.join(", ")})`);
