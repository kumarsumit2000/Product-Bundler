# Phase 0 — Scaffold + OAuth Spike

**Date:** 2026-05-04
**Status:** Approved (pending user spec review)
**Depends on:** [2026-05-04-spec-amendments-group-a.md](./2026-05-04-spec-amendments-group-a.md)
**Estimated duration:** 3-5 days

---

## 1. Scope & Goal

Stand up the admin app's foundation. By the end of Phase 0, we have:

- A deployable Cloudflare Pages app at `bundler.deepseatools.in`.
- All Cloudflare resources provisioned (D1, KV×2, R2, Queue, Analytics Engine).
- A stable cloudflared dev tunnel at `bundler-dev.deepseatools.in`.
- OAuth working end-to-end on a Shopify dev store.
- The embedded admin iframe rendering a Polaris "Hello, {shop}" page.

No Bundle CRUD, no Functions, no extensions. Webhooks limited to `app/uninstalled` (the floor required to not reject the install).

### Why include OAuth (deviates from CLAUDE.md §15)

CLAUDE.md splits scaffolding (Phase 0) and OAuth (Phase 1). We merge them.

The highest-risk unknown in the entire stack is "does `@shopify/shopify-app-remix` work on Cloudflare Pages?" If it doesn't, every later phase has to be rewritten. Front-loading this risk as the Phase 0 gate means we discover incompatibility on day 3-4 — when the cost of pivoting is hours, not weeks.

---

## 2. Infrastructure Map

| Concern | Value |
|---|---|
| Cloudflare account ID | `e3dfc3a3d6ef58eb226c8eaeec1ab73f` |
| Git repo | `git@github.com:kumarsumit2000/Product-Bundler.git` |
| Admin app platform | Cloudflare **Pages** (not Workers — see §3.1) |
| Production URL | `https://bundler.deepseatools.in` (CNAME → `bundler-admin.pages.dev`) |
| Dev tunnel URL | `https://bundler-dev.deepseatools.in` (cloudflared named tunnel → `localhost:8788`) |
| Cloudflare Pages project name | `bundler-admin` |
| OAuth callback (prod) | `https://bundler.deepseatools.in/auth/callback` |
| OAuth callback (dev) | `https://bundler-dev.deepseatools.in/auth/callback` |
| D1 database | `bundler-prod` |
| KV namespaces | `SESSIONS`, `SHOP_SETTINGS_CACHE` |
| R2 bucket | `bundler-widget-assets` |
| Queue | `bundler-analytics` |
| Analytics Engine dataset | `bundler_events` |

---

## 3. Architectural Decisions

### 3.1 Pages adapter, not Workers

The admin app deploys as a Cloudflare Pages project. Remix uses `@remix-run/cloudflare-pages`. Build outputs to `build/client/` (static) and `build/server/index.js` (the `_worker.js` Pages serves dynamic routes through). `wrangler pages deploy` deploys both.

This deviates from CLAUDE.md §3 which uses a Workers `wrangler.toml`. The deviation is driven by: the user pre-configured `bundler.deepseatools.in` as a CNAME pointing at `bundler-admin.pages.dev`, committing us to Pages.

Pages supports the same bindings as Workers (D1, KV, R2, Queues, Analytics Engine, cron triggers). Pages projects can have at most one queue consumer — fine, we have one queue.

### 3.2 KV-backed session storage; no token duplication in D1 (Amendment 6)

CLAUDE.md §5 includes `accessTokenEnc` on the `shops` table. We remove it.

`@shopify/shopify-app-remix` ships with a `SessionStorage` interface. We implement it backed by KV `SESSIONS`, with the access token field AES-GCM encrypted at rest using `DATABASE_ENCRYPTION_KEY` (32-byte hex Worker secret). The shopify-app-remix library handles token retrieval transparently for OAuth, webhooks, and Admin API calls.

Storing tokens twice (KV + D1) means two writes per OAuth, two encryption keys to rotate, drift risk between stores. The `shops` table holds only app-specific metadata: `id`, `installedAt`, `uninstalledAt`, `scopes`, `plan`, `planActivatedAt`, `trialEndsAt`, `shopifyChargeId`, `shopifyDiscountId` (Amendment 2), `currency`, `primaryLocale`, `attributedRevenueCents`.

This is **Amendment 6** — added to the Group A amendments doc when Phase 0 design is approved.

### 3.3 Provision all bindings in Phase 0; use only DB + SESSIONS

The Phase 0 Worker only touches D1 (`shops`) and KV (`SESSIONS`). But `wrangler.toml` declares R2, the Queue, Analytics Engine, and `SHOP_SETTINGS_CACHE` upfront. Reasoning:

- Cloudflare resource provisioning takes minutes, not seconds. Doing it once now means future phases write code, not infrastructure.
- `wrangler.toml` evolves additively. Get bindings right once, no "why doesn't the build work" reruns.
- All these resources are free or near-free at our usage. Phase 0 writes nothing to most of them, so cost is $0.

Cron `scheduled()` and queue `queue()` handlers exist as no-op exports in Phase 0; they fill out in later phases.

---

## 4. Repo Structure (Phase 0)

```
Product-Bundler/
├── apps/
│   └── admin/
│       ├── app/
│       │   ├── routes/
│       │   │   ├── _index.tsx                   # redirect to /app
│       │   │   ├── auth.$.tsx                   # Shopify OAuth handler
│       │   │   ├── auth.login.tsx               # OAuth entry page
│       │   │   ├── webhooks.app.uninstalled.tsx # minimal uninstall handler
│       │   │   ├── app.tsx                      # embedded shell (App Bridge + Polaris)
│       │   │   └── app._index.tsx               # "Hello, {shop}" page
│       │   ├── shopify.server.ts                # Shopify app instance + KV session storage
│       │   ├── db.server.ts                     # Drizzle client
│       │   ├── kv.server.ts                     # KV helpers
│       │   ├── session-storage.server.ts        # KV-backed SessionStorage adapter
│       │   ├── root.tsx
│       │   └── entry.server.tsx
│       ├── drizzle/
│       │   ├── schema.ts                        # `shops` table only in Phase 0
│       │   └── migrations/
│       │       └── 0000_initial_shops.sql
│       ├── public/
│       ├── wrangler.toml
│       ├── drizzle.config.ts
│       ├── vite.config.ts
│       ├── package.json
│       └── tsconfig.json
├── shared/
│   ├── types/                                   # placeholder
│   └── package.json
├── shopify.app.toml                             # repo root
├── pnpm-workspace.yaml
├── package.json                                 # root workspace + scripts
├── .gitignore                                   # covers .dev.vars, build/, .wrangler/, .shopify/
├── README.md
├── CLAUDE.md                                    # spec
└── docs/
    └── superpowers/
        └── specs/
            ├── 2026-05-04-spec-amendments-group-a.md
            └── 2026-05-04-phase-0-scaffold-design.md
```

`extensions/` does not exist in Phase 0; added in Phase 3+.

---

## 5. Configuration Files

### 5.1 `shopify.app.toml`

```toml
name = "Product Bundler"
client_id = "REPLACE_AFTER_CREATING_PARTNER_APP"
application_url = "https://bundler.deepseatools.in"
embedded = true

[access_scopes]
scopes = "read_products,write_products,read_orders,write_orders,write_discounts,read_discounts,read_themes,write_metaobjects,read_metaobjects,read_inventory,read_locales,read_markets"

[auth]
redirect_urls = [
  "https://bundler.deepseatools.in/auth/callback",
  "https://bundler-dev.deepseatools.in/auth/callback"
]

[webhooks]
api_version = "2026-01"

  [[webhooks.subscriptions]]
  topics = ["app/uninstalled"]
  uri = "/webhooks/app/uninstalled"

[build]
automatically_update_urls_on_dev = false
dev_store_url = "REPLACE_WITH_YOUR_DEV_STORE.myshopify.com"
```

`automatically_update_urls_on_dev = false`: with our stable named tunnel, we lock URLs and prevent the CLI from rewriting them on every restart.

GDPR webhooks (`shop/redact`, `customers/redact`, `customers/data_request`) and `orders/paid` land in Phase 1.

### 5.2 `apps/admin/wrangler.toml`

```toml
name = "bundler-admin"
account_id = "e3dfc3a3d6ef58eb226c8eaeec1ab73f"
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "./build/client"

[vars]
SHOPIFY_APP_URL = "https://bundler.deepseatools.in"
SCOPES = "read_products,write_products,read_orders,write_orders,write_discounts,read_discounts,read_themes,write_metaobjects,read_metaobjects,read_inventory,read_locales,read_markets"

# Secrets via `wrangler pages secret put`:
# - SHOPIFY_API_KEY
# - SHOPIFY_API_SECRET
# - SHOPIFY_WEBHOOK_SECRET
# - DATABASE_ENCRYPTION_KEY  (32-byte hex; AES-GCM key for token encryption in KV)

[[d1_databases]]
binding = "DB"
database_name = "bundler-prod"
database_id = "REPLACE_AFTER_CREATE"

[[kv_namespaces]]
binding = "SESSIONS"
id = "REPLACE_AFTER_CREATE"

[[kv_namespaces]]
binding = "SHOP_SETTINGS_CACHE"
id = "REPLACE_AFTER_CREATE"

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "bundler-widget-assets"

[[queues.producers]]
binding = "ANALYTICS_QUEUE"
queue = "bundler-analytics"

[[queues.consumers]]
queue = "bundler-analytics"
max_batch_size = 100
max_batch_timeout = 30

[analytics_engine_datasets]
binding = "ANALYTICS"
dataset = "bundler_events"

[triggers]
crons = ["0 * * * *", "0 2 * * *"]
```

### 5.3 Root `package.json` scripts

```json
{
  "scripts": {
    "dev": "concurrently -n tunnel,vite,shopify -c blue,green,magenta \"pnpm dev:tunnel\" \"pnpm dev:vite\" \"pnpm dev:shopify\"",
    "dev:tunnel": "cloudflared tunnel run bundler-dev",
    "dev:vite": "pnpm --filter admin dev",
    "dev:shopify": "shopify app dev --tunnel-url=https://bundler-dev.deepseatools.in"
  }
}
```

### 5.4 `apps/admin/package.json` scripts

```json
{
  "scripts": {
    "dev": "vite dev --port 8788",
    "build": "remix vite:build",
    "deploy": "wrangler pages deploy ./build/client --project-name=bundler-admin --branch=main",
    "db:generate": "drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply bundler-prod --local",
    "db:migrate:prod": "wrangler d1 migrations apply bundler-prod --remote"
  }
}
```

---

## 6. Local Dev Workflow

`pnpm dev` from the repo root runs three processes concurrently with named, color-coded output.

### 6.1 cloudflared tunnel (one-time setup)

```bash
cloudflared tunnel login
cloudflared tunnel create bundler-dev
# outputs tunnel UUID, e.g. abc123-def456
cloudflared tunnel route dns bundler-dev bundler-dev.deepseatools.in
```

`~/.cloudflared/config.yml`:
```yaml
tunnel: abc123-def456
credentials-file: ~/.cloudflared/abc123-def456.json
ingress:
  - hostname: bundler-dev.deepseatools.in
    service: http://localhost:8788
  - service: http_status:404
```

### 6.2 Vite dev server

`pnpm --filter admin dev` runs `vite dev --port 8788` with the Cloudflare/Remix plugin. This gives:
- Remix code HMR
- Miniflare-simulated D1, KV, R2, Queue bindings (in-memory, ephemeral)
- Same code path as production

### 6.3 Shopify CLI

`shopify app dev --tunnel-url=https://bundler-dev.deepseatools.in`:
- Validates `shopify.app.toml`
- Syncs scopes/webhook subscriptions to Partner dashboard when changed
- Opens dev store, prints install URL
- Hot-reloads extensions (no-op in Phase 0)

### 6.4 Local secrets

`apps/admin/.dev.vars` (gitignored):
```
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SHOPIFY_WEBHOOK_SECRET=...
DATABASE_ENCRYPTION_KEY=...
```

`DATABASE_ENCRYPTION_KEY` generated via `openssl rand -hex 32`.

---

## 7. Resource Provisioning Commands

Run once at the start of Phase 0:

```bash
# D1
wrangler d1 create bundler-prod
# → copy database_id into wrangler.toml

# KV
wrangler kv namespace create SESSIONS
wrangler kv namespace create SHOP_SETTINGS_CACHE
# → copy namespace IDs into wrangler.toml

# R2
wrangler r2 bucket create bundler-widget-assets

# Queue (requires Workers Paid plan: $5/mo)
wrangler queues create bundler-analytics

# Analytics Engine: declared in wrangler.toml; activates on first writeDataPoint
```

### Production secrets

```bash
wrangler pages secret put SHOPIFY_API_KEY --project-name=bundler-admin
wrangler pages secret put SHOPIFY_API_SECRET --project-name=bundler-admin
wrangler pages secret put SHOPIFY_WEBHOOK_SECRET --project-name=bundler-admin
wrangler pages secret put DATABASE_ENCRYPTION_KEY --project-name=bundler-admin
```

---

## 8. The OAuth Spike (the critical Phase 0 gate)

This is the moment of truth — does `@shopify/shopify-app-remix` work on Cloudflare Pages?

### Test sequence

1. `pnpm dev` boots all three processes green.
2. Shopify CLI prints install URL: `https://bundler-dev.deepseatools.in/auth/login?shop=<dev-store>.myshopify.com`.
3. Open in browser. OAuth consent screen renders. Click "Install app".
4. Browser redirects to `/auth/callback?code=...&shop=...&hmac=...`.
5. Server-side flow:
   - Verify HMAC via `@shopify/shopify-api`.
   - Exchange `code` for offline access token (POST to `https://<shop>/admin/oauth/access_token`).
   - Write Session to KV via `KvSessionStorage` (token AES-GCM encrypted).
   - Upsert `shops` row in D1 (`installedAt`, `scopes`, defaults for `plan`, `currency`, etc.).
   - Redirect to `/app?shop=...&host=...`.
6. `/app` route loads inside Shopify admin iframe. App Bridge initializes.
7. `/app/_index` renders Polaris page: "Hello, {shop.name}".

### Pass criteria

- HMAC verification succeeds.
- Token exchange returns 200 with access token.
- KV write succeeds (verify via `wrangler kv key get SESSIONS session:<shop>`).
- D1 row exists (verify via `wrangler d1 execute bundler-prod --command "SELECT * FROM shops"`).
- Embedded admin iframe loads without breaking out of the iframe.
- Polaris page renders the shop name.

### Failure modes & contingency

If the spike fails (Risk 1 in §10):
- Drop `@shopify/shopify-app-remix`.
- Use `@shopify/shopify-api` directly.
- Implement OAuth route manually (~200 lines):
  - `GET /auth/login` → redirect to `https://{shop}/admin/oauth/authorize?...`
  - `GET /auth/callback` → verify HMAC, exchange code, write session, redirect to `/app`
  - `app.tsx` loader → validate session token, attach to context

Decision deadline: end of Checkpoint 3 day 1. If OAuth isn't working by then, pivot.

---

## 9. Sequencing (5 checkpoints)

### Checkpoint 1: Infrastructure (~half a day)

- Clone `Product-Bundler` repo, set up pnpm workspace skeleton, initial commit.
- Run all `wrangler` provisioning commands.
- Set up cloudflared named tunnel; verify `bundler-dev.deepseatools.in` resolves.
- Create Shopify Partner app; copy `client_id`/`secret`; set as Wrangler secrets.
- **Gate:** `wrangler pages deploy` of an empty `index.html` serves at `bundler.deepseatools.in`.

### Checkpoint 2: Remix scaffolded and ported (~1 day)

- `npm init @shopify/app@latest` in scratch dir; copy useful files into `apps/admin/`.
- Replace `@remix-run/node` → `@remix-run/cloudflare-pages`. Update `vite.config.ts`.
- Delete Prisma scaffolding entirely (schema, migrations, generated client, imports).
- Add Drizzle, write `shops` schema (Amendment 6 fields), generate first migration, apply locally.
- Write `KvSessionStorage` adapter implementing `@shopify/shopify-app-session-storage` `SessionStorage`.
- Wire `shopify.server.ts` with Pages context (env from Cloudflare bindings).
- **Gate:** `pnpm dev` starts all three processes without errors. Tunnel URL returns Remix 404.

### Checkpoint 3: OAuth gate (~1-2 days, risky)

- Implement `auth.$.tsx`, `auth.login.tsx`.
- Implement minimal `app.tsx` (App Bridge provider, Polaris frame) and `app._index.tsx` ("Hello, {shop}").
- Run install flow on dev store end-to-end.
- **Gate:** OAuth completes, embedded admin iframe loads, Polaris page renders. Token in KV (encrypted). Shop row in D1.

### Checkpoint 4: Webhook floor + production deploy (~half a day)

- Implement `webhooks.app.uninstalled.tsx` with HMAC verify (no-op handler beyond logging + setting `shops.uninstalledAt`).
- Run `pnpm shopify app deploy` to register webhook subscription with Partner dashboard.
- `wrangler pages deploy` to production. Add `bundler.deepseatools.in` as custom domain in Pages dashboard.
- Install on dev store using **production URL** (not the tunnel). Verify same flow works.
- **Gate:** Production install works. Uninstalling fires the webhook, `shops.uninstalledAt` set.

### Checkpoint 5: Cleanup, docs, commit (~half a day)

- README with setup instructions for fresh clone.
- `.gitignore` covers `.dev.vars`, `node_modules`, `build/`, `.wrangler/`, `.shopify/`.
- Tag git commit `phase-0-complete`.
- All Phase 0 exit criteria verified.

---

## 10. Risks & Contingencies

### Risk 1: `@shopify/shopify-app-remix` doesn't work on Cloudflare Pages

- Probability: low-medium. Community reports say it works with `nodejs_compat`, but not officially supported.
- Symptom: import errors at build, runtime errors during OAuth (cookies, crypto, HMAC), session storage write failures.
- **Contingency:** Drop to `@shopify/shopify-api` and implement OAuth route manually (~200 lines). See §8.

### Risk 2: Pages cron triggers / queue consumers misbehave

- Probability: low. Documented for Pages but less battle-tested than Workers.
- Symptom: `scheduled()` doesn't fire; queue consumer stays at 0 messages-consumed.
- **Contingency:** Phase 0 doesn't use either. If issues hit Phase 6/7, split into a separate Workers project for queue consumption while Pages handles HTTP.

### Risk 3: cloudflared tunnel disconnects

- Probability: medium (network-dependent).
- **Contingency:** Named tunnels reconnect automatically. If persistent, fall back to quick tunnel (`cloudflared tunnel --url localhost:8788`) and update `--tunnel-url` flag for that session.

### Risk 4: Shopify CLI fights with `--tunnel-url`

- Probability: low. Flag is documented and stable.
- **Contingency:** Set `SHOPIFY_FLAG_TUNNEL_URL=https://bundler-dev.deepseatools.in` env var, or run with `--no-update`.

### Risk 5: Group A pre-decision was wrong

- Probability: very low.
- **Contingency:** Re-open Group A amendments, document new decision, swap Pages → Workers if needed.

---

## 11. Done Criteria (Phase 0 Exit)

Every item must be true before declaring Phase 0 complete:

- [ ] Git repo cloned, monorepo committed and pushed to `main` of `Product-Bundler`.
- [ ] `wrangler.toml` references account ID `e3dfc3a3d6ef58eb226c8eaeec1ab73f`.
- [ ] All Cloudflare resources provisioned: D1 `bundler-prod`, KV `SESSIONS`, KV `SHOP_SETTINGS_CACHE`, R2 `bundler-widget-assets`, Queue `bundler-analytics`, Analytics Engine dataset `bundler_events`.
- [ ] Cloudflared named tunnel `bundler-dev` running; `bundler-dev.deepseatools.in` reaches `localhost:8788`.
- [ ] Shopify Partner app exists with correct scopes (no `write_themes`).
- [ ] Wrangler secrets set: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_WEBHOOK_SECRET`, `DATABASE_ENCRYPTION_KEY`.
- [ ] `apps/admin/` builds with `pnpm --filter admin build` without errors.
- [ ] `pnpm dev` boots all three processes; tunnel URL serves the app.
- [ ] OAuth round-trip on dev store completes; embedded admin iframe shows Polaris "Hello, {shop}" page.
- [ ] `shops` row exists in D1 after install; KV `SESSIONS` has encrypted session.
- [ ] `app/uninstalled` webhook handler verifies HMAC and sets `shops.uninstalledAt`.
- [ ] `wrangler pages deploy` to production succeeds; `bundler.deepseatools.in` serves the app.
- [ ] Install flow works on production URL (not just dev tunnel).
- [ ] Spec amendments doc + Phase 0 design doc committed to git.

---

## 12. What Phase 0 Does NOT Include (Defer)

Mapped against CLAUDE.md §15:

- **Phase 1 work** (most of it): GDPR webhooks, `orders/paid` webhook, full session retrieval helpers — Phase 0 has only the auth path and `app/uninstalled` floor.
- **Phase 2:** Bundle CRUD UI.
- **Phase 3:** Discount Function (Rust). Group B issues (combinability, metafield sharding, instruction budget) addressed in Phase 3 design.
- **Phase 4:** Theme App Extension, widget JS, storefront `/config` and `/event` endpoints.
- **Phase 5:** Cart Transform Function, free gift / BOGO logic.
- **Phase 6:** Analytics pipeline (widget events, cron rollups).
- **Phase 7:** Billing.
- **Phase 8-9:** BFS polish, submission.
