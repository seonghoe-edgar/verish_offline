import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { askClaude } from "../shopify-bot/claude-agent.js";
import { getPending, clearPending } from "../shopify-bot/pending-store.js";
import { executeMutation } from "../shopify-bot/shopify-tools.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const PASSCODE = requiredEnv("WEB_APP_PASSCODE");
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const CONFIRM_WORDS = ["확인", "실행", "ok", "yes", "confirm"];
const CANCEL_WORDS = ["취소", "아니", "cancel", "no"];

// 팀 전체가 공유하는 비밀번호 한 개로만 접근을 막는다 (계정 시스템 없이 최소한의 보호).
function requirePasscode(req: express.Request, res: express.Response, next: express.NextFunction) {
  const provided = req.header("x-passcode");
  if (provided !== PASSCODE) {
    res.status(401).json({ error: "비밀번호가 틀렸습니다." });
    return;
  }
  next();
}

app.post("/api/login", (req, res) => {
  const { passcode } = req.body as { passcode?: string };
  if (passcode !== PASSCODE) {
    res.status(401).json({ ok: false });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/chat", requirePasscode, async (req, res) => {
  const { sessionId, message } = req.body as { sessionId?: string; message?: string };
  if (!sessionId || !message) {
    res.status(400).json({ error: "sessionId와 message가 필요합니다." });
    return;
  }

  const pending = getPending(sessionId);
  if (pending) {
    const text = message.trim().toLowerCase();
    if (CONFIRM_WORDS.some((w) => text.includes(w))) {
      const result = await executeMutation(pending.mutation, pending.variables);
      clearPending(sessionId);
      res.json({ reply: `실행했습니다: ${pending.summary}\n\n결과: ${result}` });
      return;
    }
    if (CANCEL_WORDS.some((w) => text.includes(w))) {
      clearPending(sessionId);
      res.json({ reply: "취소했습니다. 아무것도 변경되지 않았습니다." });
      return;
    }
    res.json({
      reply: `아직 확인 대기 중인 변경이 있습니다: "${pending.summary}"\n실행하려면 "확인", 취소하려면 "취소"라고 답해주세요.`,
    });
    return;
  }

  try {
    const result = await askClaude(message, sessionId, sessionId);
    res.json({ reply: result.text });
  } catch (err) {
    res.status(500).json({ reply: `오류가 발생했습니다: ${(err as Error).message}` });
  }
});

app.get("/api/session-id", (_req, res) => {
  res.json({ sessionId: crypto.randomUUID() });
});

app.listen(PORT, () => {
  console.log(`Verish Shopify 웹챗이 http://localhost:${PORT} 에서 실행 중입니다.`);
});
