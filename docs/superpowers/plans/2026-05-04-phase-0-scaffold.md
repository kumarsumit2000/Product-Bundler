# Phase 0 — Scaffold + OAuth Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Bundler admin app's foundation: a deployable Cloudflare Pages app with all bindings provisioned, OAuth working end-to-end on a Shopify dev store, embedded admin showing a Polaris "Hello, {shop}" page.

**Architecture:** Cloudflare Pages hosts a Remix app. Shopify OAuth via `@shopify/shopify-app-remix` with a custom KV-backed session storage. Drizzle ORM over D1 for the `shops` table. AES-GCM encryption for tokens at rest. Cloudflared named tunnel for stable dev URL. Vitest for unit tests with `@cloudflare/vitest-pool-workers`.

**Tech Stack:** TypeScript (strict), Remix + Vite, `@remix-run/cloudflare-pages`, `@shopify/shopify-app-remix`, Drizzle ORM, Cloudflare D1/KV/R2/Queues/Pages, Wrangler, pnpm workspaces, Vitest, Polaris v13, App Bridge React v4.

**Specs this plan implements:**
- [`docs/superpowers/specs/2026-05-04-phase-0-scaffold-design.md`](../specs/2026-05-04-phase-0-scaffold-design.md)
- [`docs/superpowers/specs/2026-05-04-spec-amendments-group-a.md`](../specs/2026-05-04-spec-amendments-group-a.md)

---

## Task 1: Initialize git repo, link to GitHub remote

**Files:**
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Initialize git repo and link remote**

Run from `/Users/sumit/Desktop/Shopify Apps/Bundler App/`:
```bash
git init -b main
git remote add origin git@github.com:kumarsumit2000/Product-Bundler.git
```

Expected: no errors. `git remote -v` shows `origin git@github.com:kumarsumit2000/Product-Bundler.git`.

- [ ] **Step 2: Create `.gitignore`**

```
node_modules
.DS_Store
.env
.env.local
.dev.vars
build/
dist/
.wrangler/
.shopify/
.cache/
*.log
.vscode/
.idea/
coverage/
```

- [ ] **Step 3: Create minimal `README.md`**

```markdown
# Product Bundler

Shopify Bundle & Quantity Breaks app. Cloudflare Pages-hosted Remix admin with Rust Shopify Functions.

## Setup

See `docs/superpowers/specs/2026-05-04-phase-0-scaffold-design.md` for full setup instructions.

## Quick start

```bash
pnpm install
pnpm dev
```
```

- [ ] **Step 4: Initial commit and push**

```bash
git add .gitignore README.md CLAUDE.md docs/
git commit -m "chore: initial commit with spec and Phase 0 design"
git push -u origin main
```

Expected: push succeeds, repo at https://github.com/kumarsumit2000/Product-Bundler shows the files.

---

## Task 2: Set up pnpm workspace skeleton

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `apps/admin/package.json`
- Create: `shared/package.json`
- Create: `shared/types/index.ts`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "product-bundler",
  "version": "0.0.1",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev": "concurrently -n tunnel,vite,shopify -c blue,green,magenta \"pnpm dev:tunnel\" \"pnpm dev:vite\" \"pnpm dev:shopify\"",
    "dev:tunnel": "cloudflared tunnel run bundler-dev",
    "dev:vite": "pnpm --filter admin dev",
    "dev:shopify": "shopify app dev --tunnel-url=https://bundler-dev.deepseatools.in",
    "build": "pnpm --filter admin build",
    "deploy": "pnpm --filter admin deploy",
    "test": "pnpm --filter admin test"
  },
  "devDependencies": {
    "@shopify/cli": "^3.70.0",
    "concurrently": "^9.0.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "shared"
```

- [ ] **Step 3: Create `apps/admin/package.json` (placeholder, deps added in Task 6)**

```json
{
  "name": "admin",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "scripts": {
    "dev": "echo 'placeholder — set up in Task 6'",
    "build": "echo 'placeholder — set up in Task 6'",
    "deploy": "echo 'placeholder — set up in Task 6'",
    "test": "echo 'placeholder — set up in Task 6'"
  }
}
```

- [ ] **Step 4: Create `shared/package.json`**

```json
{
  "name": "@bundler/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./types/index.ts",
  "types": "./types/index.ts"
}
```

- [ ] **Step 5: Create `shared/types/index.ts`**

```ts
export {};
```

- [ ] **Step 6: Run pnpm install**

```bash
pnpm install
```

Expected: `node_modules/` populated, `pnpm-lock.yaml` created. No errors.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml apps/admin/package.json shared/
git commit -m "chore: set up pnpm workspace skeleton"
```

---

## Task 3: Provision Cloudflare resources

**Files:** none (runtime config only)

- [ ] **Step 1: Verify wrangler is logged in to the correct account**

```bash
wrangler whoami
```

Expected output includes account ID `e3dfc3a3d6ef58eb226c8eaeec1ab73f`. If not, run `wrangler login` and log in to that account.

- [ ] **Step 2: Create D1 database**

```bash
wrangler d1 create bundler-prod
```

Expected: outputs a TOML snippet with `database_id = "..."`. **Copy this database_id — you'll paste it into `wrangler.toml` in Task 7.**

- [ ] **Step 3: Create KV namespaces**

```bash
wrangler kv namespace create SESSIONS
wrangler kv namespace create SHOP_SETTINGS_CACHE
```

Expected: each command outputs `id = "..."`. **Copy both IDs.**

- [ ] **Step 4: Create R2 bucket**

```bash
wrangler r2 bucket create bundler-widget-assets
```

Expected: `Created bucket bundler-widget-assets`.

- [ ] **Step 5: Create Queue (requires Workers Paid plan)**

```bash
wrangler queues create bundler-analytics
```

Expected: `Created queue bundler-analytics`. If you see a "Workers Paid plan required" error, upgrade at https://dash.cloudflare.com/?to=/:account/workers/plans — it's $5/mo and required for Phase 6 anyway.

- [ ] **Step 6: Create Pages project**

```bash
wrangler pages project create bundler-admin --production-branch=main
```

Expected: `✨ Successfully created the 'bundler-admin' project. It will be available at https://bundler-admin.pages.dev/`.

- [ ] **Step 7: Save the IDs to a temporary scratch file**

Create `scratch-ids.txt` (gitignored — temporary reference only) with:
```
D1_DATABASE_ID=<paste-from-step-2>
KV_SESSIONS_ID=<paste-from-step-3a>
KV_SHOP_SETTINGS_CACHE_ID=<paste-from-step-3b>
```

This file is a working note — it gets deleted at the end of Phase 0. The IDs go into `wrangler.toml` in Task 7.

Add to `.gitignore`:
```
scratch-ids.txt
```

- [ ] **Step 8: Commit gitignore update**

```bash
git add .gitignore
git commit -m "chore: ignore scratch-ids.txt"
```

---

## Task 4: Set up cloudflared named tunnel

**Files:**
- Create: `~/.cloudflared/config.yml`

- [ ] **Step 1: Authenticate cloudflared**

```bash
cloudflared tunnel login
```

Expected: opens browser, asks you to select your zone (`deepseatools.in`). Click authorize. Returns "Successfully logged in".

- [ ] **Step 2: Create the named tunnel**

```bash
cloudflared tunnel create bundler-dev
```

Expected output:
```
Created tunnel bundler-dev with id <UUID>
```

**Copy the UUID.**

- [ ] **Step 3: Route DNS to the tunnel**

```bash
cloudflared tunnel route dns bundler-dev bundler-dev.deepseatools.in
```

Expected: `Added CNAME bundler-dev.deepseatools.in which will route to this tunnel tunnelID=<UUID>`.

- [ ] **Step 4: Create `~/.cloudflared/config.yml`**

Replace `<UUID>` with the tunnel UUID from step 2:
```yaml
tunnel: <UUID>
credentials-file: /Users/sumit/.cloudflared/<UUID>.json
ingress:
  - hostname: bundler-dev.deepseatools.in
    service: http://localhost:8788
  - service: http_status:404
```

- [ ] **Step 5: Verify the tunnel runs (will fail to forward — that's fine)**

```bash
cloudflared tunnel run bundler-dev
```

Expected: prints "Connection registered" and waits. Visiting `https://bundler-dev.deepseatools.in` in a browser returns a 502 (because `localhost:8788` isn't running yet — expected). Press Ctrl-C to stop.

---

## Task 5: Create Shopify Partner app and set Wrangler secrets

**Files:** none (configuration only)

- [ ] **Step 1: Create the Partner app via Shopify CLI**

From repo root:
```bash
shopify app init --name="Product Bundler" --path=. --client-id=
```

Expected: opens browser to Partner dashboard, walks you through creating the app. Generates `shopify.app.toml`. **We'll overwrite this file with our own version in Task 6, so don't worry about the generated content.**

After creation, the Partner dashboard shows the app with a `client_id` and `client_secret`. Copy both.

Alternative if `shopify app init` is awkward: go to https://partners.shopify.com/ → Apps → Create app → Public app → name it "Product Bundler" → set App URL to `https://bundler.deepseatools.in` → set redirect URLs to both `https://bundler.deepseatools.in/auth/callback` and `https://bundler-dev.deepseatools.in/auth/callback`. Copy `client_id` and `client_secret`.

- [ ] **Step 2: Generate a fresh `DATABASE_ENCRYPTION_KEY`**

```bash
openssl rand -hex 32
```

Expected: 64-character hex string. **Copy this — it's the AES-GCM key.**

- [ ] **Step 3: Set Wrangler Pages secrets**

```bash
wrangler pages secret put SHOPIFY_API_KEY --project-name=bundler-admin
# paste client_id when prompted

wrangler pages secret put SHOPIFY_API_SECRET --project-name=bundler-admin
# paste client_secret when prompted

wrangler pages secret put SHOPIFY_WEBHOOK_SECRET --project-name=bundler-admin
# paste client_secret again (same value — Shopify uses the API secret for webhook HMAC)

wrangler pages secret put DATABASE_ENCRYPTION_KEY --project-name=bundler-admin
# paste the openssl output from step 2
```

Expected: each command says `Success! Uploaded secret <NAME>`.

- [ ] **Step 4: Save secrets locally for dev**

Create `apps/admin/.dev.vars` (gitignored — verify it's in `.gitignore` from Task 1):
```
SHOPIFY_API_KEY=<client_id>
SHOPIFY_API_SECRET=<client_secret>
SHOPIFY_WEBHOOK_SECRET=<client_secret>
DATABASE_ENCRYPTION_KEY=<openssl output>
```

Verify it's gitignored:
```bash
git check-ignore apps/admin/.dev.vars
```

Expected output: `apps/admin/.dev.vars` (meaning it IS ignored).

---

## Task 6: Generate Shopify Remix template, copy useful files into apps/admin

**Files:**
- Create: `apps/admin/app/root.tsx`
- Create: `apps/admin/app/entry.server.tsx`
- Create: `apps/admin/tsconfig.json`
- Create: `apps/admin/vite.config.ts`
- Modify: `apps/admin/package.json` (replace placeholder)

- [ ] **Step 1: Run Shopify Remix template generator in a scratch directory**

```bash
mkdir -p /tmp/shopify-template-scratch
cd /tmp/shopify-template-scratch
npm init @shopify/app@latest -- --template=remix --name=scratch
```

Follow prompts: pick the language as TypeScript, pick package manager as pnpm. Wait for it to complete. Result: `/tmp/shopify-template-scratch/scratch/` with a Remix-Shopify app.

- [ ] **Step 2: Return to repo and copy files we need (NOT the Node-specific ones)**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
```

Copy ONLY these from the template (we'll write Cloudflare-specific versions of others ourselves):
- `app/root.tsx` → `apps/admin/app/root.tsx`
- `app/entry.server.tsx` → `apps/admin/app/entry.server.tsx` (we'll modify in Task 7)

Skip: `app/db.server.ts` (Prisma — we use Drizzle), `app/shopify.server.ts` (Node — we'll write our own), Prisma files, `vite.config.ts` (Node — we'll write our own).

```bash
cp /tmp/shopify-template-scratch/scratch/app/root.tsx apps/admin/app/root.tsx
cp /tmp/shopify-template-scratch/scratch/app/entry.server.tsx apps/admin/app/entry.server.tsx
```

- [ ] **Step 3: Replace `apps/admin/package.json` with full content**

```json
{
  "name": "admin",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "scripts": {
    "dev": "vite dev --port 8788",
    "build": "remix vite:build",
    "deploy": "wrangler pages deploy ./build/client --project-name=bundler-admin --branch=main",
    "db:generate": "drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply bundler-prod --local",
    "db:migrate:prod": "wrangler d1 migrations apply bundler-prod --remote",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@remix-run/cloudflare": "^2.15.0",
    "@remix-run/cloudflare-pages": "^2.15.0",
    "@remix-run/react": "^2.15.0",
    "@shopify/app-bridge-react": "^4.1.6",
    "@shopify/polaris": "^13.9.0",
    "@shopify/shopify-app-remix": "^3.5.0",
    "@shopify/shopify-app-session-storage": "^3.0.0",
    "drizzle-orm": "^0.36.0",
    "isbot": "^5.1.17",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "@cloudflare/workers-types": "^4.20241011.0",
    "@remix-run/dev": "^2.15.0",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "drizzle-kit": "^0.28.0",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4",
    "wrangler": "^3.84.0"
  }
}
```

- [ ] **Step 4: Create `apps/admin/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["@cloudflare/workers-types", "@remix-run/cloudflare", "vite/client"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "paths": {
      "~/*": ["./app/*"]
    }
  },
  "include": ["app/**/*", "test/**/*", "*.ts", "*.tsx"],
  "exclude": ["node_modules", "build"]
}
```

- [ ] **Step 5: Create `apps/admin/vite.config.ts`**

```ts
import {
  vitePlugin as remix,
  cloudflareDevProxyVitePlugin as remixCloudflareDevProxy,
} from "@remix-run/dev";
import { defineConfig } from "vite";

declare module "@remix-run/cloudflare" {
  interface Future {
    v3_singleFetch: true;
  }
}

export default defineConfig({
  plugins: [
    remixCloudflareDevProxy(),
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: true,
        v3_lazyRouteDiscovery: true,
      },
    }),
  ],
  server: {
    port: 8788,
  },
});
```

`remixCloudflareDevProxy` wires Vite's dev server to Miniflare so `context.cloudflare.env` is populated with simulated D1/KV/R2/Queue bindings during `pnpm dev`. Without it, your loaders see `undefined` for env.

- [ ] **Step 6: Create `apps/admin/functions/[[path]].ts`** (Cloudflare Pages Functions bridge)

This file routes every request that doesn't match a static asset to the Remix server bundle.

```ts
import { createPagesFunctionHandler } from "@remix-run/cloudflare-pages";
// @ts-expect-error - the build output type isn't generated yet
import * as build from "../build/server";

export const onRequest = createPagesFunctionHandler({ build });
```

The `@ts-expect-error` is intentional — the import path resolves only after `pnpm build` runs once. This is the canonical pattern from the official Remix Cloudflare Pages template.

- [ ] **Step 7: Install dependencies**

```bash
pnpm install
```

Expected: installs all listed deps. May take 2-3 minutes. No errors.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/package.json apps/admin/tsconfig.json apps/admin/vite.config.ts apps/admin/app/root.tsx apps/admin/app/entry.server.tsx apps/admin/functions pnpm-lock.yaml
git commit -m "chore(admin): scaffold Remix app with Cloudflare Pages adapter"
```

---

## Task 7: Write `apps/admin/wrangler.toml` with all bindings

**Files:**
- Create: `apps/admin/wrangler.toml`

- [ ] **Step 1: Create `apps/admin/wrangler.toml`**

Replace `<D1_DATABASE_ID>`, `<KV_SESSIONS_ID>`, `<KV_SHOP_SETTINGS_CACHE_ID>` with the IDs from `scratch-ids.txt` (Task 3).

```toml
name = "bundler-admin"
account_id = "e3dfc3a3d6ef58eb226c8eaeec1ab73f"
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "./build/client"

[vars]
SHOPIFY_APP_URL = "https://bundler.deepseatools.in"
SCOPES = "read_products,write_products,read_orders,write_orders,write_discounts,read_discounts,read_themes,write_metaobjects,read_metaobjects,read_inventory,read_locales,read_markets"

[[d1_databases]]
binding = "DB"
database_name = "bundler-prod"
database_id = "<D1_DATABASE_ID>"

[[kv_namespaces]]
binding = "SESSIONS"
id = "<KV_SESSIONS_ID>"

[[kv_namespaces]]
binding = "SHOP_SETTINGS_CACHE"
id = "<KV_SHOP_SETTINGS_CACHE_ID>"

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

- [ ] **Step 2: Verify wrangler can read the config**

```bash
cd apps/admin
pnpm wrangler pages project list
```

Expected: lists `bundler-admin` project.

- [ ] **Step 3: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/wrangler.toml
git commit -m "feat(admin): add wrangler.toml with all bindings"
```

---

## Task 8: Write `shopify.app.toml` at repo root

**Files:**
- Create: `shopify.app.toml`

- [ ] **Step 1: Create `shopify.app.toml`**

Replace `<CLIENT_ID>` with the Partner app's client_id (Task 5) and `<DEV_STORE>` with your dev store's myshopify subdomain.

```toml
name = "Product Bundler"
client_id = "<CLIENT_ID>"
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
dev_store_url = "<DEV_STORE>.myshopify.com"
```

- [ ] **Step 2: Push config to Partner dashboard**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
shopify app deploy --no-release
```

Expected: `Released a new version of your app to development.` Partner dashboard now shows scopes and webhook subscriptions matching `shopify.app.toml`.

- [ ] **Step 3: Commit**

```bash
git add shopify.app.toml
git commit -m "feat: add shopify.app.toml with scopes and uninstall webhook"
```

---

## Task 9: Write Drizzle schema (shops table only) and config

**Files:**
- Create: `apps/admin/drizzle.config.ts`
- Create: `apps/admin/drizzle/schema.ts`

- [ ] **Step 1: Create `apps/admin/drizzle.config.ts`**

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
  driver: "d1-http",
} satisfies Config;
```

- [ ] **Step 2: Create `apps/admin/drizzle/schema.ts`**

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const shops = sqliteTable("shops", {
  id: text("id").primaryKey(),
  scopes: text("scopes").notNull(),
  installedAt: integer("installed_at", { mode: "timestamp" }).notNull(),
  uninstalledAt: integer("uninstalled_at", { mode: "timestamp" }),
  plan: text("plan").notNull().default("free"),
  planActivatedAt: integer("plan_activated_at", { mode: "timestamp" }),
  trialEndsAt: integer("trial_ends_at", { mode: "timestamp" }),
  shopifyChargeId: text("shopify_charge_id"),
  shopifyDiscountId: text("shopify_discount_id"),
  currency: text("currency").notNull().default("USD"),
  primaryLocale: text("primary_locale").notNull().default("en"),
  attributedRevenueCents: integer("attributed_revenue_cents").notNull().default(0),
});

export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
```

- [ ] **Step 3: Generate the initial migration**

```bash
cd apps/admin
pnpm db:generate
```

Expected: creates `drizzle/migrations/0000_<random_name>.sql` with `CREATE TABLE shops (...)`.

- [ ] **Step 4: Apply migration locally**

```bash
pnpm db:migrate:local
```

Expected: `🌀 Mapping SQL input file to operations... 🚣 Executed 1 command in <ms>ms`.

- [ ] **Step 5: Apply migration to remote production D1**

```bash
pnpm db:migrate:prod
```

Expected: `🌀 Executing on remote database bundler-prod... 🚣 Executed 1 command...`.

- [ ] **Step 6: Verify the table exists**

```bash
pnpm wrangler d1 execute bundler-prod --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

Expected output includes `shops`.

- [ ] **Step 7: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/drizzle.config.ts apps/admin/drizzle/schema.ts apps/admin/drizzle/migrations/
git commit -m "feat(admin): add Drizzle shops schema and initial migration"
```

---

## Task 10: Set up Vitest with Workers pool

**Files:**
- Create: `apps/admin/vitest.config.ts`
- Create: `apps/admin/test/env.d.ts`

- [ ] **Step 1: Create `apps/admin/vitest.config.ts`**

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          compatibilityFlags: ["nodejs_compat"],
        },
      },
    },
  },
});
```

- [ ] **Step 2: Create `apps/admin/test/env.d.ts`**

```ts
declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    SESSIONS: KVNamespace;
    SHOP_SETTINGS_CACHE: KVNamespace;
    ASSETS: R2Bucket;
    ANALYTICS_QUEUE: Queue;
    ANALYTICS: AnalyticsEngineDataset;
    SHOPIFY_APP_URL: string;
    SCOPES: string;
    SHOPIFY_API_KEY: string;
    SHOPIFY_API_SECRET: string;
    SHOPIFY_WEBHOOK_SECRET: string;
    DATABASE_ENCRYPTION_KEY: string;
  }
}
```

- [ ] **Step 3: Run vitest to confirm it boots**

```bash
cd apps/admin
pnpm test
```

Expected: `No test files found` (no tests yet — that's fine). Exits with code 0 or 1 but no errors about config. If it errors on config, fix before proceeding.

- [ ] **Step 4: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/vitest.config.ts apps/admin/test/env.d.ts
git commit -m "test(admin): set up vitest with @cloudflare/vitest-pool-workers"
```

---

## Task 11: AES-GCM crypto helpers (TDD)

**Files:**
- Create: `apps/admin/test/crypto.server.test.ts`
- Create: `apps/admin/app/crypto.server.ts`

- [ ] **Step 1: Write the failing test**

`apps/admin/test/crypto.server.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { encryptString, decryptString } from "../app/crypto.server";

const KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

describe("crypto.server", () => {
  it("encrypts and decrypts a string", async () => {
    const plain = "shpat_abc123def456";
    const cipher = await encryptString(plain, KEY_HEX);
    expect(cipher).not.toBe(plain);
    const back = await decryptString(cipher, KEY_HEX);
    expect(back).toBe(plain);
  });

  it("produces different ciphertext for the same plaintext (random IV)", async () => {
    const plain = "shpat_abc123def456";
    const a = await encryptString(plain, KEY_HEX);
    const b = await encryptString(plain, KEY_HEX);
    expect(a).not.toBe(b);
  });

  it("throws when decrypting with the wrong key", async () => {
    const plain = "shpat_abc123def456";
    const cipher = await encryptString(plain, KEY_HEX);
    const wrongKey = "ff" + KEY_HEX.slice(2);
    await expect(decryptString(cipher, wrongKey)).rejects.toThrow();
  });

  it("throws when ciphertext is tampered with", async () => {
    const plain = "shpat_abc123def456";
    const cipher = await encryptString(plain, KEY_HEX);
    const tampered = cipher.slice(0, -2) + "ff";
    await expect(decryptString(tampered, KEY_HEX)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd apps/admin
pnpm test
```

Expected: 4 failing tests (the module doesn't exist yet).

- [ ] **Step 3: Implement `apps/admin/app/crypto.server.ts`**

```ts
const IV_BYTES = 12;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function importKey(keyHex: string): Promise<CryptoKey> {
  const raw = hexToBytes(keyHex);
  if (raw.length !== 32) {
    throw new Error("DATABASE_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptString(plain: string, keyHex: string): Promise<string> {
  const key = await importKey(keyHex);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plain);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const cipher = new Uint8Array(cipherBuf);
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return bytesToBase64(out);
}

export async function decryptString(packed: string, keyHex: string): Promise<string> {
  const key = await importKey(keyHex);
  const bytes = base64ToBytes(packed);
  if (bytes.length <= IV_BYTES) throw new Error("ciphertext too short");
  const iv = bytes.slice(0, IV_BYTES);
  const cipher = bytes.slice(IV_BYTES);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plainBuf);
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/crypto.server.ts apps/admin/test/crypto.server.test.ts
git commit -m "feat(admin): add AES-GCM crypto helpers for token encryption"
```

---

## Task 12: KV-backed SessionStorage adapter (TDD)

**Files:**
- Create: `apps/admin/test/session-storage.server.test.ts`
- Create: `apps/admin/app/session-storage.server.ts`

- [ ] **Step 1: Write failing tests**

`apps/admin/test/session-storage.server.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { Session } from "@shopify/shopify-api";
import { KvSessionStorage } from "../app/session-storage.server";

const KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

function makeSession(id = "offline_test.myshopify.com"): Session {
  return new Session({
    id,
    shop: "test.myshopify.com",
    state: "test-state",
    isOnline: false,
    accessToken: "shpat_secret_token",
    scope: "read_products",
  });
}

describe("KvSessionStorage", () => {
  let storage: KvSessionStorage;

  beforeEach(() => {
    storage = new KvSessionStorage(env.SESSIONS, KEY_HEX);
  });

  it("stores and loads a session round-trip", async () => {
    const sess = makeSession();
    const stored = await storage.storeSession(sess);
    expect(stored).toBe(true);

    const loaded = await storage.loadSession(sess.id);
    expect(loaded).toBeDefined();
    expect(loaded!.shop).toBe("test.myshopify.com");
    expect(loaded!.accessToken).toBe("shpat_secret_token");
  });

  it("encrypts the access token at rest", async () => {
    const sess = makeSession();
    await storage.storeSession(sess);

    const raw = await env.SESSIONS.get(`session:${sess.id}`);
    expect(raw).toBeDefined();
    expect(raw).not.toContain("shpat_secret_token");
  });

  it("returns undefined for an unknown session id", async () => {
    const loaded = await storage.loadSession("offline_unknown.myshopify.com");
    expect(loaded).toBeUndefined();
  });

  it("deletes a session", async () => {
    const sess = makeSession();
    await storage.storeSession(sess);
    const deleted = await storage.deleteSession(sess.id);
    expect(deleted).toBe(true);
    const loaded = await storage.loadSession(sess.id);
    expect(loaded).toBeUndefined();
  });

  it("finds sessions by shop", async () => {
    const a = makeSession("offline_test.myshopify.com");
    const b = new Session({
      id: "online_test.myshopify.com_user1",
      shop: "test.myshopify.com",
      state: "s",
      isOnline: true,
      accessToken: "shpat_b",
      scope: "read_products",
    });
    await storage.storeSession(a);
    await storage.storeSession(b);
    const found = await storage.findSessionsByShop("test.myshopify.com");
    expect(found.length).toBe(2);
    expect(found.some((s) => s.id === a.id)).toBe(true);
    expect(found.some((s) => s.id === b.id)).toBe(true);
  });

  it("deletes multiple sessions", async () => {
    const a = makeSession("offline_a.myshopify.com");
    const b = makeSession("offline_b.myshopify.com");
    await storage.storeSession(a);
    await storage.storeSession(b);
    const deleted = await storage.deleteSessions([a.id, b.id]);
    expect(deleted).toBe(true);
    expect(await storage.loadSession(a.id)).toBeUndefined();
    expect(await storage.loadSession(b.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd apps/admin
pnpm test
```

Expected: 6 failing tests (module doesn't exist).

- [ ] **Step 3: Implement `apps/admin/app/session-storage.server.ts`**

```ts
import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { encryptString, decryptString } from "./crypto.server";

const SESSION_PREFIX = "session:";
const SHOP_INDEX_PREFIX = "shop-index:";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

type SerializedSession = {
  id: string;
  shop: string;
  state: string;
  isOnline: boolean;
  scope?: string;
  expires?: string;
  accessTokenEncrypted: string;
  onlineAccessInfo?: unknown;
};

export class KvSessionStorage implements SessionStorage {
  constructor(private kv: KVNamespace, private encryptionKeyHex: string) {}

  async storeSession(session: Session): Promise<boolean> {
    const encryptedToken = await encryptString(
      session.accessToken ?? "",
      this.encryptionKeyHex,
    );
    const serialized: SerializedSession = {
      id: session.id,
      shop: session.shop,
      state: session.state,
      isOnline: session.isOnline,
      scope: session.scope,
      expires: session.expires?.toISOString(),
      accessTokenEncrypted: encryptedToken,
      onlineAccessInfo: session.onlineAccessInfo,
    };
    await this.kv.put(SESSION_PREFIX + session.id, JSON.stringify(serialized), {
      expirationTtl: TTL_SECONDS,
    });
    await this.kv.put(`${SHOP_INDEX_PREFIX}${session.shop}:${session.id}`, "1", {
      expirationTtl: TTL_SECONDS,
    });
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const raw = await this.kv.get(SESSION_PREFIX + id);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SerializedSession;
    const accessToken = await decryptString(
      parsed.accessTokenEncrypted,
      this.encryptionKeyHex,
    );
    const session = new Session({
      id: parsed.id,
      shop: parsed.shop,
      state: parsed.state,
      isOnline: parsed.isOnline,
      accessToken,
      scope: parsed.scope,
    });
    if (parsed.expires) session.expires = new Date(parsed.expires);
    if (parsed.onlineAccessInfo) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.onlineAccessInfo = parsed.onlineAccessInfo as any;
    }
    return session;
  }

  async deleteSession(id: string): Promise<boolean> {
    const existing = await this.loadSession(id);
    await this.kv.delete(SESSION_PREFIX + id);
    if (existing) {
      await this.kv.delete(`${SHOP_INDEX_PREFIX}${existing.shop}:${id}`);
    }
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    await Promise.all(ids.map((id) => this.deleteSession(id)));
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const list = await this.kv.list({ prefix: `${SHOP_INDEX_PREFIX}${shop}:` });
    const ids = list.keys.map((k) => k.name.slice(`${SHOP_INDEX_PREFIX}${shop}:`.length));
    const sessions = await Promise.all(ids.map((id) => this.loadSession(id)));
    return sessions.filter((s): s is Session => s !== undefined);
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test
```

Expected: 10 tests passing total (4 crypto + 6 session-storage).

- [ ] **Step 5: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/session-storage.server.ts apps/admin/test/session-storage.server.test.ts
git commit -m "feat(admin): add KV-backed SessionStorage with token encryption"
```

---

## Task 13: HMAC verification helper (TDD)

**Files:**
- Create: `apps/admin/test/hmac.test.ts`
- Create: `apps/admin/app/lib/webhooks/hmac.ts`

- [ ] **Step 1: Write failing tests**

`apps/admin/test/hmac.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { verifyShopifyHmac } from "../app/lib/webhooks/hmac";

const SECRET = "test-secret";
const BODY = '{"shop":"test.myshopify.com"}';

async function makeHmac(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  let s = "";
  for (const b of new Uint8Array(sig)) s += String.fromCharCode(b);
  return btoa(s);
}

describe("verifyShopifyHmac", () => {
  it("returns true for a valid HMAC", async () => {
    const hmac = await makeHmac(BODY, SECRET);
    const result = await verifyShopifyHmac(BODY, hmac, SECRET);
    expect(result).toBe(true);
  });

  it("returns false for a tampered body", async () => {
    const hmac = await makeHmac(BODY, SECRET);
    const result = await verifyShopifyHmac('{"shop":"evil.myshopify.com"}', hmac, SECRET);
    expect(result).toBe(false);
  });

  it("returns false for a wrong secret", async () => {
    const hmac = await makeHmac(BODY, SECRET);
    const result = await verifyShopifyHmac(BODY, hmac, "wrong-secret");
    expect(result).toBe(false);
  });

  it("returns false for an empty hmac", async () => {
    const result = await verifyShopifyHmac(BODY, "", SECRET);
    expect(result).toBe(false);
  });

  it("returns false for null hmac", async () => {
    const result = await verifyShopifyHmac(BODY, null, SECRET);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd apps/admin
pnpm test
```

Expected: 5 failing tests.

- [ ] **Step 3: Implement `apps/admin/app/lib/webhooks/hmac.ts`**

```ts
export async function verifyShopifyHmac(
  body: string,
  hmacHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!hmacHeader) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  let computed = "";
  for (const b of new Uint8Array(sigBuf)) computed += String.fromCharCode(b);
  const computedB64 = btoa(computed);

  if (computedB64.length !== hmacHeader.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computedB64.length; i++) {
    mismatch |= computedB64.charCodeAt(i) ^ hmacHeader.charCodeAt(i);
  }
  return mismatch === 0;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test
```

Expected: 15 tests passing total (4 + 6 + 5).

- [ ] **Step 5: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/lib/webhooks/hmac.ts apps/admin/test/hmac.test.ts
git commit -m "feat(admin): add Shopify HMAC verification helper"
```

---

## Task 14: Drizzle DB client and KV helper modules

**Files:**
- Create: `apps/admin/app/db.server.ts`
- Create: `apps/admin/app/kv.server.ts`

- [ ] **Step 1: Create `apps/admin/app/db.server.ts`**

```ts
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../drizzle/schema";

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type DB = ReturnType<typeof getDb>;
export { schema };
```

- [ ] **Step 2: Create `apps/admin/app/kv.server.ts`**

```ts
export async function getJson<T>(kv: KVNamespace, key: string): Promise<T | null> {
  return (await kv.get(key, "json")) as T | null;
}

export async function putJson(
  kv: KVNamespace,
  key: string,
  value: unknown,
  options?: KVNamespacePutOptions,
): Promise<void> {
  await kv.put(key, JSON.stringify(value), options);
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd apps/admin
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/db.server.ts apps/admin/app/kv.server.ts
git commit -m "feat(admin): add Drizzle D1 client and KV JSON helpers"
```

---

## Task 15: Shopify app instance (`shopify.server.ts`)

**Files:**
- Create: `apps/admin/app/shopify.server.ts`

- [ ] **Step 1: Create `apps/admin/app/shopify.server.ts`**

```ts
import "@shopify/shopify-app-remix/adapters/node"; // required even on Workers — provides crypto polyfills via nodejs_compat
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { KvSessionStorage } from "./session-storage.server";

export type AppLoadContext = {
  cloudflare: {
    env: {
      DB: D1Database;
      SESSIONS: KVNamespace;
      SHOP_SETTINGS_CACHE: KVNamespace;
      ASSETS: R2Bucket;
      ANALYTICS_QUEUE: Queue;
      ANALYTICS: AnalyticsEngineDataset;
      SHOPIFY_APP_URL: string;
      SCOPES: string;
      SHOPIFY_API_KEY: string;
      SHOPIFY_API_SECRET: string;
      SHOPIFY_WEBHOOK_SECRET: string;
      DATABASE_ENCRYPTION_KEY: string;
    };
  };
};

export function createShopifyApp(context: AppLoadContext) {
  const env = context.cloudflare.env;
  return shopifyApp({
    apiKey: env.SHOPIFY_API_KEY,
    apiSecretKey: env.SHOPIFY_API_SECRET,
    apiVersion: ApiVersion.January26,
    scopes: env.SCOPES.split(","),
    appUrl: env.SHOPIFY_APP_URL,
    authPathPrefix: "/auth",
    sessionStorage: new KvSessionStorage(env.SESSIONS, env.DATABASE_ENCRYPTION_KEY),
    distribution: AppDistribution.AppStore,
    future: {
      unstable_newEmbeddedAuthStrategy: true,
    },
  });
}

export const authenticate = {
  admin: async (request: Request, context: AppLoadContext) => {
    const shopify = createShopifyApp(context);
    return shopify.authenticate.admin(request);
  },
  webhook: async (request: Request, context: AppLoadContext) => {
    const shopify = createShopifyApp(context);
    return shopify.authenticate.webhook(request);
  },
};
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/admin
pnpm typecheck
```

Expected: no errors. If `ApiVersion.January26` is unrecognized, change to the latest version exported by the installed `@shopify/shopify-app-remix` (e.g., `ApiVersion.October24` or whatever the package exports — check via `node -e "console.log(Object.keys(require('@shopify/shopify-app-remix/server').ApiVersion))"`).

- [ ] **Step 3: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/shopify.server.ts
git commit -m "feat(admin): add Shopify app instance with KV session storage"
```

---

## Task 16: Root route — redirect `/` to `/app`

**Files:**
- Create: `apps/admin/app/routes/_index.tsx`

- [ ] **Step 1: Create `apps/admin/app/routes/_index.tsx`**

```tsx
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (shop) {
    return redirect(`/app?shop=${shop}`);
  }
  return redirect("/auth/login");
}

export default function Index() {
  return null;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/admin
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/routes/_index.tsx
git commit -m "feat(admin): add root route redirect"
```

---

## Task 17: Auth routes (`auth.login.tsx`, `auth.$.tsx`)

**Files:**
- Create: `apps/admin/app/routes/auth.login.tsx`
- Create: `apps/admin/app/routes/auth.$.tsx`

- [ ] **Step 1: Create `apps/admin/app/routes/auth.login.tsx`**

```tsx
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { Form, useLoaderData } from "@remix-run/react";
import { Page, Card, FormLayout, TextField, Button, BlockStack } from "@shopify/polaris";
import { useState } from "react";
import { createShopifyApp, type AppLoadContext } from "~/shopify.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const shopify = createShopifyApp(context as AppLoadContext);
  await shopify.login(request); // throws redirect if shop param present
  return { polarisTranslations: {} };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const shopify = createShopifyApp(context as AppLoadContext);
  return shopify.login(request);
}

export default function Login() {
  useLoaderData<typeof loader>();
  const [shop, setShop] = useState("");
  return (
    <Page title="Login">
      <Card>
        <Form method="post">
          <BlockStack gap="400">
            <FormLayout>
              <TextField
                type="text"
                name="shop"
                label="Shop domain"
                helpText="example.myshopify.com"
                value={shop}
                onChange={setShop}
                autoComplete="on"
              />
              <Button submit variant="primary">
                Log in
              </Button>
            </FormLayout>
          </BlockStack>
        </Form>
      </Card>
    </Page>
  );
}
```

- [ ] **Step 2: Create `apps/admin/app/routes/auth.$.tsx`**

```tsx
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);

  // Upsert shop row in D1 on first install / re-auth
  const db = getDb(ctx.cloudflare.env.DB);
  const now = new Date();
  await db
    .insert(schema.shops)
    .values({
      id: session.shop,
      scopes: session.scope ?? "",
      installedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.shops.id,
      set: {
        scopes: session.scope ?? "",
        uninstalledAt: null,
      },
    });

  return null;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/admin
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/routes/auth.login.tsx apps/admin/app/routes/auth.\$.tsx
git commit -m "feat(admin): add OAuth login and callback routes"
```

---

## Task 18: Embedded admin shell (`app.tsx`) and Hello page (`app._index.tsx`)

**Files:**
- Create: `apps/admin/app/routes/app.tsx`
- Create: `apps/admin/app/routes/app._index.tsx`

- [ ] **Step 1: Create `apps/admin/app/routes/app.tsx`**

```tsx
import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate, type AppLoadContext } from "~/shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
  return json({ apiKey: ctx.cloudflare.env.SHOPIFY_API_KEY });
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
```

- [ ] **Step 2: Create `apps/admin/app/routes/app._index.tsx`**

```tsx
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Text, BlockStack } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  return json({ shop: session.shop });
}

export default function AppIndex() {
  const { shop } = useLoaderData<typeof loader>();
  return (
    <Page title="Product Bundler">
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Hello, {shop}
          </Text>
          <Text as="p" variant="bodyMd">
            Phase 0 scaffold is working. OAuth complete, session in KV, shop row in D1.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/admin
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/routes/app.tsx apps/admin/app/routes/app._index.tsx
git commit -m "feat(admin): add embedded admin shell and Hello page"
```

---

## Task 19: Uninstall webhook handler (TDD where applicable)

**Files:**
- Create: `apps/admin/app/routes/webhooks.app.uninstalled.tsx`

- [ ] **Step 1: Create `apps/admin/app/routes/webhooks.app.uninstalled.tsx`**

```tsx
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { eq } from "drizzle-orm";

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop, session } = await authenticate.webhook(request, ctx);

  if (topic !== "APP_UNINSTALLED") {
    return new Response("Unexpected topic", { status: 400 });
  }

  const db = getDb(ctx.cloudflare.env.DB);
  await db
    .update(schema.shops)
    .set({ uninstalledAt: new Date() })
    .where(eq(schema.shops.id, shop));

  // Best-effort delete the offline session if it still exists
  if (session) {
    await ctx.cloudflare.env.SESSIONS.delete(`session:${session.id}`);
    await ctx.cloudflare.env.SESSIONS.delete(`shop-index:${shop}:${session.id}`);
  }

  return new Response(null, { status: 200 });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/admin
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add apps/admin/app/routes/webhooks.app.uninstalled.tsx
git commit -m "feat(admin): add app/uninstalled webhook handler"
```

---

## Task 20: Run dev environment and OAuth spike (THE GATE)

**Files:** none (validation only)

This is the critical Phase 0 gate. If `@shopify/shopify-app-remix` doesn't work on Cloudflare Pages, you discover it here.

- [ ] **Step 1: Build the app once to catch compilation errors before runtime**

```bash
cd apps/admin
pnpm build
```

Expected: builds to `build/client/` and `build/server/`. If you see import errors mentioning Node-only modules (`fs`, `path`, etc.) that aren't in `nodejs_compat`'s polyfill set, **PIVOT NOW** — see "Failure Pivot" below.

- [ ] **Step 2: Boot full dev environment**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
pnpm dev
```

Expected output (in three colored sections):
- `tunnel`: "Connection registered" lines
- `vite`: "VITE ready in <ms>ms" + "Local: http://localhost:8788"
- `shopify`: "Preview URL: https://bundler-dev.deepseatools.in" and an install link

- [ ] **Step 3: Run install flow on dev store**

Visit the install URL printed by Shopify CLI. Looks like:
```
https://bundler-dev.deepseatools.in/auth/login?shop=<dev-store>.myshopify.com
```

Or visit `https://<dev-store>.myshopify.com/admin/apps` and click your dev app.

- [ ] **Step 4: Walk through OAuth**

1. Browser shows Shopify consent screen with our scopes.
2. Click "Install app".
3. Browser redirects to `/auth/callback?...&shop=...&hmac=...`.
4. Then redirects to `/app?shop=...&host=...` inside the Shopify admin iframe.
5. Embedded admin loads. Polaris page shows: **"Hello, <dev-store>.myshopify.com"**.

- [ ] **Step 5: Verify state in KV and D1**

In another terminal:
```bash
cd apps/admin

# Check KV session exists (use --local if testing local dev with Miniflare)
pnpm wrangler kv key list --binding=SESSIONS --local

# Check D1 row exists
pnpm wrangler d1 execute bundler-prod --local --command "SELECT id, scopes, installed_at, uninstalled_at FROM shops"
```

Expected: KV list includes `session:offline_<shop>` and `shop-index:<shop>:offline_<shop>`. D1 query returns one row with the dev store domain, scopes string, and an `installed_at` timestamp.

- [ ] **Step 6: PASS GATE — commit progress**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git tag phase-0-oauth-gate-pass
```

### Failure Pivot (if step 1, 4, or 5 fails)

If `@shopify/shopify-app-remix` errors on Workers runtime (compile errors about Node modules, runtime errors during OAuth callback, or KV session writes failing):

1. Don't tag `phase-0-oauth-gate-pass`.
2. Open a new spec amendment file: `docs/superpowers/specs/2026-05-04-amendment-7-manual-oauth.md`.
3. Document the specific error.
4. Switch strategy: drop `@shopify/shopify-app-remix`, use `@shopify/shopify-api` directly. Replace `apps/admin/app/shopify.server.ts` with manual OAuth implementation:
   - `auth.login.tsx`: redirect to `https://{shop}/admin/oauth/authorize?client_id=...&scope=...&redirect_uri=...&state=...`
   - `auth.$.tsx`: verify HMAC, exchange `code` for token via POST to `https://{shop}/admin/oauth/access_token`, write Session via `KvSessionStorage`, redirect to `/app`.
   - `app.tsx`: verify session token from `Authorization: Bearer` header (App Bridge sends it), exchange via `tokenExchange` API for app-specific session if needed.
5. Re-run Task 20 steps 1-5.

---

## Task 21: Production deploy and custom domain

**Files:** none (deployment only)

- [ ] **Step 1: Stop the dev environment**

`Ctrl-C` the `pnpm dev` process.

- [ ] **Step 2: Build for production**

```bash
cd apps/admin
pnpm build
```

Expected: clean build to `build/client/` (static) and `build/server/index.js` (Pages worker).

- [ ] **Step 3: Deploy to Cloudflare Pages production**

```bash
pnpm deploy
```

Expected: `🌎 Deploying your application to Cloudflare's global network...` and `✨ Deployment complete! Take a peek over at https://<random>.bundler-admin.pages.dev`.

- [ ] **Step 4: Add custom domain in Pages dashboard**

Open https://dash.cloudflare.com/?to=/:account/pages/view/bundler-admin/domains.

Click "Set up a custom domain" → enter `bundler.deepseatools.in` → Continue. Cloudflare detects the existing CNAME (since `bundler.deepseatools.in` already points at `bundler-admin.pages.dev`) and provisions an SSL certificate. Wait 1-2 min until status shows "Active".

- [ ] **Step 5: Verify production URL serves the app**

```bash
curl -I https://bundler.deepseatools.in/auth/login?shop=test.myshopify.com
```

Expected: HTTP 200 (or 302 if redirecting). Open in browser to confirm the Polaris login page renders.

- [ ] **Step 6: Update Shopify Partner app to use prod URL (it already is, but reconfirm)**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
shopify app deploy
```

Expected: `Pushing app config to your dev store... Released a new version of your app.` Partner dashboard shows the production redirect URLs.

- [ ] **Step 7: Install the production app on the dev store**

Use the Partner dashboard "Test on development store" or open:
```
https://bundler.deepseatools.in/auth/login?shop=<dev-store>.myshopify.com
```

Walk through OAuth. Verify the embedded admin loads with the Polaris "Hello, {shop}" page — same as dev tunnel — but coming from production.

- [ ] **Step 8: Verify shop row written to remote D1**

```bash
cd apps/admin
pnpm wrangler d1 execute bundler-prod --remote --command "SELECT id, scopes, installed_at FROM shops"
```

Expected: shop row exists in production D1.

- [ ] **Step 9: Test uninstall webhook**

In Shopify admin (your dev store), uninstall the app via Settings → Apps and sales channels → Product Bundler → Uninstall.

Wait 5-10 seconds, then check D1:
```bash
pnpm wrangler d1 execute bundler-prod --remote --command "SELECT id, uninstalled_at FROM shops"
```

Expected: `uninstalled_at` is set (not NULL).

- [ ] **Step 10: Tag and commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git tag phase-0-prod-deploy-pass
```

---

## Task 22: Polish, README, and final cleanup

**Files:**
- Modify: `README.md`
- Delete: `scratch-ids.txt`
- Delete: `/tmp/shopify-template-scratch/`

- [ ] **Step 1: Replace `README.md` with full setup instructions**

```markdown
# Product Bundler

Shopify Bundle & Quantity Breaks app. Cloudflare Pages-hosted Remix admin with Rust Shopify Functions (Phase 3+).

## Architecture

- **Admin app:** Remix on Cloudflare Pages (`apps/admin/`)
- **Production URL:** https://bundler.deepseatools.in
- **Dev tunnel:** https://bundler-dev.deepseatools.in
- **Database:** Cloudflare D1 (`bundler-prod`)
- **Sessions:** Cloudflare KV (`SESSIONS`), AES-GCM encrypted
- **Storefront widget assets:** Cloudflare R2 + Pages CDN (Phase 4+)
- **Analytics:** Cloudflare Analytics Engine + Queues (Phase 6+)

See [`docs/superpowers/specs/`](docs/superpowers/specs/) for full architecture spec and amendments.

## Prerequisites

- Node 20+, pnpm 9+
- Rust + `wasm32-wasip1` target (Phase 3+)
- Cloudflare account with Workers Paid plan ($5/mo for Queues)
- Shopify Partner account + dev store
- `cloudflared` CLI installed
- Shopify CLI: `npm i -g @shopify/cli`

## First-time setup

1. Clone repo: `git clone git@github.com:kumarsumit2000/Product-Bundler.git`
2. Install deps: `pnpm install`
3. Set up cloudflared named tunnel — see [`docs/superpowers/specs/2026-05-04-phase-0-scaffold-design.md`](docs/superpowers/specs/2026-05-04-phase-0-scaffold-design.md) §6.1.
4. Create `apps/admin/.dev.vars` with `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_WEBHOOK_SECRET`, `DATABASE_ENCRYPTION_KEY`.
5. Apply migrations: `pnpm --filter admin db:migrate:local && pnpm --filter admin db:migrate:prod`.

## Daily dev

```bash
pnpm dev
```

Boots cloudflared tunnel + Vite dev server + Shopify CLI in one terminal. Visit the install URL printed by Shopify CLI.

## Deploy

```bash
pnpm build && pnpm deploy
```

## Tests

```bash
pnpm test
```

Uses Vitest with `@cloudflare/vitest-pool-workers` (real Workers runtime, simulated bindings).

## Plans & specs

- [`docs/superpowers/specs/`](docs/superpowers/specs/) — architecture spec, amendments, phase designs.
- [`docs/superpowers/plans/`](docs/superpowers/plans/) — implementation plans per phase.
```

- [ ] **Step 2: Delete scratch files**

```bash
rm -f scratch-ids.txt
rm -rf /tmp/shopify-template-scratch
```

- [ ] **Step 3: Verify build still passes from a clean slate**

```bash
cd apps/admin
rm -rf build/ node_modules/
cd ..
pnpm install
pnpm test
pnpm build
```

Expected: clean install, all tests pass, clean build.

- [ ] **Step 4: Final commit**

```bash
cd "/Users/sumit/Desktop/Shopify Apps/Bundler App"
git add README.md
git commit -m "docs: add Phase 0 README"
git tag phase-0-complete
git push origin main --tags
```

Expected: push to GitHub succeeds, tags `phase-0-oauth-gate-pass`, `phase-0-prod-deploy-pass`, `phase-0-complete` visible on the GitHub repo.

---

## Phase 0 Done Checklist

After all 22 tasks complete, verify every item in the design spec's §11:

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

If all 13 items check, Phase 0 is **DONE**. Move on to Phase 1 (full webhook coverage including GDPR + orders/paid).
