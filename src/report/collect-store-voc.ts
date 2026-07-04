import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  listStoreReportChannels,
  getChannelMessages,
  storeNameFromChannel,
  dateFromSlackTs,
} from "../slack/index.js";

const LOG_FILE = "reports/store-voc-log.json";

interface VocEntry {
  store: string;
  channelId: string;
  channelName: string;
  ts: string;
  date: string;
  text: string;
}

function loadLog(): VocEntry[] {
  if (!existsSync(LOG_FILE)) return [];
  return JSON.parse(readFileSync(LOG_FILE, "utf8"));
}

function saveLog(entries: VocEntry[]) {
  entries.sort((a, b) => (a.channelName === b.channelName ? a.ts.localeCompare(b.ts) : a.channelName.localeCompare(b.channelName)));
  writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2), "utf8");
}

async function main() {
  const existing = loadLog();
  const seenTs = new Set(existing.map((e) => `${e.channelId}:${e.ts}`));

  // 채널별로 이미 수집한 가장 최근 메시지 시각 이후만 새로 가져온다 (증분 수집).
  const lastTsByChannel = new Map<string, string>();
  for (const e of existing) {
    const prev = lastTsByChannel.get(e.channelId);
    if (!prev || e.ts > prev) lastTsByChannel.set(e.channelId, e.ts);
  }

  const channels = await listStoreReportChannels();
  console.log(`오픈마감보고 채널 ${channels.length}개 발견:`, channels.map((c) => c.name).join(", "));

  const added: VocEntry[] = [];
  for (const channel of channels) {
    const store = storeNameFromChannel(channel.name);
    const oldest = lastTsByChannel.get(channel.id);
    const messages = await getChannelMessages(channel.id, oldest);

    for (const m of messages) {
      if (!m.text?.trim()) continue;
      const key = `${channel.id}:${m.ts}`;
      if (seenTs.has(key)) continue;
      seenTs.add(key);
      added.push({
        store,
        channelId: channel.id,
        channelName: channel.name,
        ts: m.ts,
        date: dateFromSlackTs(m.ts),
        text: m.text,
      });
    }
    console.log(`- ${channel.name}: 신규 ${messages.length}건 확인`);
  }

  const merged = [...existing, ...added];
  saveLog(merged);
  console.log(`\n신규 ${added.length}건 추가, 누적 총 ${merged.length}건 -> ${LOG_FILE}`);
}

main();
