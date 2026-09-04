# Xiaoluo Source-managed Cloudflare Design

## Goal

Use the supplied project as the sole functional baseline, preserving its existing routes, content, public assets, administrator workflows, D1 records, and R2 media while making visual configuration and deployment repeatable.

## Source of truth

- `app/page.tsx` remains the implementation of the public home, company analysis, matrix, talent, and business views.
- `app/admin/**` and `app/analysis/[slug]/**` remain published routes.
- `worker/index.ts` and `worker/articles.ts` remain the public API and administrator boundary.
- Existing `DB` D1 and `MEDIA` R2 bindings are retained exactly; no data migration or remote database write is performed during source setup.

## Maintainability boundary

- Extract visual values into `tokens.css` and import it once from `app/globals.css`.
- Keep content constants and data-fetching behavior unchanged in this pass. Visual refactors must not delete, rename, or simplify existing public capabilities.
- Keep public media in `public/` and runtime media in the existing `MEDIA` bucket.
- Configure `.env.example` for non-secret local configuration only. Credentials remain Cloudflare-managed secrets.

## Deployment model

- Initialize Git in the supplied source directory and record source changes in commits.
- Build the existing vinext Cloudflare Worker output locally before any publish action.
- Bind the existing Cloudflare Pages project only after an authenticated Cloudflare connection identifies the project and its D1/R2 bindings.
- Deploy first as a preview; production replacement requires a fresh user confirmation after preview verification.

## Acceptance checks

- Build succeeds from a clean dependency install.
- Existing render test continues to pass.
- The rendered homepage still exposes every navigation label and all six existing note titles.
- No production deployment, D1 change, R2 change, or admin credential change occurs during the source cleanup phase.
