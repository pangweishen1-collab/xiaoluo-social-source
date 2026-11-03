import type { HotFeed } from "./hot-list";

export const HOT_FEED_CHECK_MS = 60 * 1000;

type WatchOptions = {
  load: () => Promise<HotFeed>;
  read: () => HotFeed | null;
  onFeed: (feed: HotFeed) => void;
  onError: () => void;
  clock?: Pick<Window, "setInterval" | "clearInterval" | "addEventListener" | "removeEventListener">;
  page?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  now?: () => number;
};

// The homepage is a view of the published ranking, not a separate daily job.
export function watchHotFeed({ load, read, onFeed, onError, clock = window, page = document, now = Date.now }: WatchOptions) {
  let active = true;
  let pending = false;
  let lastAttempt = -Infinity;
  const accept = (feed: HotFeed) => {
    if (!Array.isArray(feed?.rankings)) throw new Error("Invalid hot-list response");
    if (active) onFeed(feed);
  };
  const sync = () => {
    if (!active || page.visibilityState !== "visible") return;
    const cached = read();
    if (cached) {
      try { accept(cached); } catch { onError(); }
      return;
    }
    if (pending || now() - lastAttempt < HOT_FEED_CHECK_MS) return;
    pending = true;
    lastAttempt = now();
    void Promise.resolve().then(load).then(accept).catch(() => { if (active) onError(); }).finally(() => { pending = false; });
  };
  sync();
  // Check more frequently than the shared five-minute TTL so a request finishing
  // just after a timer tick cannot defer the next update for another five minutes.
  const timer = clock.setInterval(sync, HOT_FEED_CHECK_MS);
  page.addEventListener("visibilitychange", sync);
  clock.addEventListener("focus", sync);
  return () => {
    active = false;
    clock.clearInterval(timer);
    page.removeEventListener("visibilitychange", sync);
    clock.removeEventListener("focus", sync);
  };
}
