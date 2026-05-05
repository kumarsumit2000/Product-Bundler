# Product Bundler

Shopify Bundle & Quantity Breaks app. Cloudflare Pages-hosted Remix admin with Rust Shopify Functions (Phase 3+).

## Architecture

- **Admin app:** Remix on Cloudflare Pages (`apps/admin/`)
- **Production URL:** https://bundler.deepseatools.in
- **Database:** Cloudflare D1 (`bundler-prod`)
- **Sessions:** Cloudflare KV (`SESSIONS`), AES-GCM encrypted
- **Storefront widget assets:** Cloudflare R2 + Pages CDN (Phase 4+)
- **Analytics:** Cloudflare Analytics Engine + Queues (Phase 6+ — both disabled in Phase 0)

See [`docs/superpowers/specs/`](docs/superpowers/specs/) for full architecture spec and amendments. See [`docs/superpowers/plans/`](docs/superpowers/plans/) for phase-by-phase plans.

## Prerequisites

- Node 20+, pnpm 9+
- Cloudflare account with R2 enabled (Workers Paid plan needed for Phase 6 Queues)
- Shopify Partner account + dev store
- Shopify CLI: `npm i -g @shopify/cli`

## First-time setup

1. Clone repo: `git clone git@github.com:kumarsumit2000/Product-Bundler.git`
2. Install deps: `pnpm install`
3. Create `apps/admin/.dev.vars` (gitignored) with:
   ```
   SHOPIFY_API_KEY=<from Partner dashboard>
   SHOPIFY_API_SECRET=<from Partner dashboard>
   SHOPIFY_WEBHOOK_SECRET=<same as API secret>
   DATABASE_ENCRYPTION_KEY=<openssl rand -hex 32>
   ```
4. Apply D1 migrations:
   ```bash
   CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=e3dfc3a3d6ef58eb226c8eaeec1ab73f \
     pnpm --filter admin db:migrate:prod
   ```

## Tests

```bash
pnpm test
```

15 unit tests covering crypto helpers, KV session storage, HMAC verification.

## Build & Deploy

```bash
pnpm --filter admin build

CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=e3dfc3a3d6ef58eb226c8eaeec1ab73f \
  pnpm --filter admin exec wrangler pages deploy ./build/client \
    --project-name=bundler-admin --branch=main
```

Push `shopify.app.toml` config to Partner dashboard:
```bash
pnpm shopify app deploy
```

## Plans & specs

- [`docs/superpowers/specs/2026-05-04-spec-amendments-group-a.md`](docs/superpowers/specs/2026-05-04-spec-amendments-group-a.md) — 6 amendments to the original spec.
- [`docs/superpowers/specs/2026-05-04-phase-0-scaffold-design.md`](docs/superpowers/specs/2026-05-04-phase-0-scaffold-design.md) — Phase 0 design.
- [`docs/superpowers/plans/2026-05-04-phase-0-scaffold.md`](docs/superpowers/plans/2026-05-04-phase-0-scaffold.md) — Phase 0 implementation plan.

## Phase 0 status: COMPLETE ✅

OAuth round-trip working end-to-end on production URL. Embedded admin renders, session persisted in KV (AES-GCM encrypted), shop metadata in D1. See `phase-0-complete` git tag.
