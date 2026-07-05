import "dotenv/config";
import pkg from "@slack/bolt";
const { App } = pkg;
import { askClaude } from "./claude-agent.js";
import { getPending, clearPending } from "./pending-store.js";
import { executeMutation } from "./shopify-tools.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const app = new App({
  token: requiredEnv("SHOPIFY_BOT_SLACK_BOT_TOKEN"),
  appToken: requiredEnv("SHOPIFY_BOT_SLACK_APP_TOKEN"),
  socketMode: true,
});

const CONFIRM_WORDS = ["확인", "실행", "ok", "yes", "confirm"];
const CANCEL_WORDS = ["취소", "아니", "cancel", "no"];

// @Verish Shopify Bot 멘션 — 새 요청을 Claude에게 넘긴다.
app.event("app_mention", async ({ event, client, say }) => {
  const threadTs = event.thread_ts ?? event.ts;
  const text = event.text.replace(/<@[^>]+>/g, "").trim();
  if (!text) {
    await say({ text: "무엇을 도와드릴까요? (예: @Verish Shopify Bot 이번 달 브라탑 카테고리 매출 top5 알려줘)", thread_ts: threadTs });
    return;
  }

  await client.reactions.add({ channel: event.channel, timestamp: event.ts, name: "hourglass_flowing_sand" }).catch(() => {});

  try {
    const result = await askClaude(text, threadTs, event.user ?? "unknown");
    await say({ text: result.text, thread_ts: threadTs });
  } catch (err) {
    await say({ text: `오류가 발생했습니다: ${(err as Error).message}`, thread_ts: threadTs });
  } finally {
    await client.reactions.remove({ channel: event.channel, timestamp: event.ts, name: "hourglass_flowing_sand" }).catch(() => {});
  }
});

// 스레드 안에서의 후속 답장 — "확인"/"취소" 처리 (pending mutation이 있을 때만 반응).
app.message(async ({ message, say }) => {
  if (message.subtype) return; // bot 메시지, 삭제 등은 무시
  const msg = message as { thread_ts?: string; ts: string; text?: string; user?: string };
  const threadTs = msg.thread_ts;
  if (!threadTs) return;

  const pending = getPending(threadTs);
  if (!pending) return;

  const text = (msg.text ?? "").trim().toLowerCase();
  if (msg.user !== pending.requestedByUserId) return; // 요청한 사람만 확인/취소 가능

  if (CONFIRM_WORDS.some((w) => text.includes(w))) {
    await say({ text: `실행합니다: ${pending.summary}`, thread_ts: threadTs });
    const result = await executeMutation(pending.mutation, pending.variables);
    clearPending(threadTs);
    await say({ text: `완료: ${result}`, thread_ts: threadTs });
    return;
  }

  if (CANCEL_WORDS.some((w) => text.includes(w))) {
    clearPending(threadTs);
    await say({ text: "취소했습니다. 아무것도 변경되지 않았습니다.", thread_ts: threadTs });
  }
});

(async () => {
  await app.start();
  console.log("Verish Shopify Bot이 Socket Mode로 실행 중입니다.");
})();
