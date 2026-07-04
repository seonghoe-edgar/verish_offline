const MAX_REQUESTS = 5;
const WINDOW_MS = 1000;

const timestamps: number[] = [];
let queue: Promise<void> = Promise.resolve();

// PLAY MD allows at most 5 requests per second (in-flight included) before returning 429.
export function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    while (true) {
      const now = Date.now();
      while (timestamps.length && now - timestamps[0] >= WINDOW_MS) {
        timestamps.shift();
      }
      if (timestamps.length < MAX_REQUESTS) {
        timestamps.push(now);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, WINDOW_MS - (now - timestamps[0])));
    }
  });
  queue = run;
  return run.then(fn);
}
