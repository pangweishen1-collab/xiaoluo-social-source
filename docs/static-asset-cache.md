# Static media and release preparation

- `pnpm run dev` and `pnpm run build` run `scripts/prepare-public-assets.mjs` first.
- Replace `public/optimized/home-hero-research.webp` to update the static hero image; preparation generates a SHA-256 fingerprinted WebP copy and `app/hero-media.generated.json`. Do not overwrite fingerprinted files manually. Keep old versioned media files available for previously loaded pages.
- The hero image reserves its layout space with a fixed aspect ratio while it loads.
- Worker static responses revalidate same-name assets. `/versioned/name.<16 hex>.ext` may use immutable caching. Framework chunk policy is preserved. Media errors are not cached; ETag, content type, range and conditional response semantics are retained.
- Previously cached resources cannot be retroactively invalidated by new response headers. For a stale immutable URL, publish a new filename. The hero now uses that strategy.
- Preparation also exports only published entries from `app/site-updates.json` to `public/release-history.json`. Never edit the public copy as the source of truth.
- Run `pnpm run check` before release. Development Vite static responses may use `no-cache`; production policy lives in `shared/asset-cache.mjs` and the Worker.
