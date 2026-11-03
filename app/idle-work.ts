export function scheduleIdleWork(callback: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback);
    return () => window.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(callback, 200);
  return () => globalThis.clearTimeout(id);
}
