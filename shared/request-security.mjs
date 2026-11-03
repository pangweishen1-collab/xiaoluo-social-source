export function isCrossOriginMutation(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  const origin = request.headers.get("Origin");
  return (origin !== null && origin !== new URL(request.url).origin)
    || request.headers.get("Sec-Fetch-Site") === "cross-site";
}
