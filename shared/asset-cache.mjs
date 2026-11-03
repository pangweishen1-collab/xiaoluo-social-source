/** Same-name public files must revalidate; only content-addressed files are immutable. */
export function withAssetCache(response, pathname) {
  const result = new Response(response.body, response);
  const versioned = /^\/versioned\/[^/]+\.[a-f0-9]{16}\.[a-z0-9]+$/i.test(pathname);
  if (response.status >= 400) result.headers.set('Cache-Control', 'no-store');
  else if (!pathname.startsWith('/_next/')) {
    result.headers.set('Cache-Control', versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
  }
  result.headers.set('X-Content-Type-Options', 'nosniff');
  return result;
}
