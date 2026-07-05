// 스레드(thread_ts)별로 "확인 대기 중인" mutation을 잠깐 들고 있는 메모리 저장소.
// 서버 재시작하면 사라짐 — 이 봇 용도로는 충분 (오래 기다린 제안은 다시 물어보면 됨).
const PENDING_TTL_MS = 30 * 60 * 1000; // 30분

interface PendingMutation {
  mutation: string;
  variables?: Record<string, unknown>;
  summary: string;
  requestedByUserId: string;
  createdAt: number;
}

const pending = new Map<string, PendingMutation>();

export function setPending(threadTs: string, entry: Omit<PendingMutation, "createdAt">): void {
  pending.set(threadTs, { ...entry, createdAt: Date.now() });
}

export function getPending(threadTs: string): PendingMutation | undefined {
  const entry = pending.get(threadTs);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > PENDING_TTL_MS) {
    pending.delete(threadTs);
    return undefined;
  }
  return entry;
}

export function clearPending(threadTs: string): void {
  pending.delete(threadTs);
}
