// Checks whether the merchant has enabled the Bundler theme-app-extension
// embed on their active Online Store theme. Without it, none of the
// widgets (popups, bundles, signup forms, etc.) render on the storefront
// — so this status drives the activation banner on the dashboard.
//
// Detection strategy: query the active theme via the Admin GraphQL API,
// pull `config/settings_data.json` from it, and look for a block whose
// `type` references our app's client_id. If found and not `disabled`,
// the embed is live.
//
// We cache the result in KV for 5 minutes per shop so the dashboard
// loader doesn't hit the Shopify API on every page navigation. The
// merchant can click "Refresh" to bust the cache.

// Bundler's Shopify Partner-app client_id (matches shopify.app.toml
// `client_id`). All app-embed block types in settings_data.json embed
// this string, regardless of which theme or extension version the
// merchant is on, so it's a stable match.
const APP_CLIENT_ID = "5d79beeba3a18a8232164a38b3a5602d";

const EMBED_BLOCK_HANDLE = "app-embed";

const CACHE_TTL_SECONDS = 300;

export type AppEmbedStatus = {
  // True when the embed is enabled on the active theme.
  enabled: boolean;
  // Surfaces in the banner copy.
  themeName: string | null;
  themeId: string | null;
  // Theme-editor deep link with the embed pre-selected for activation.
  // This is the same URL Shopify shows when you click "Enable" inside
  // the app embeds drawer.
  activateDeepLink: string;
  // Falls back to a generic theme-editor URL when we can't introspect
  // (e.g. fetch failed, permissions missing). The merchant can still
  // navigate from there.
  manualEditorUrl: string;
  // Diagnostic for the UI to render a subtle warning instead of the
  // happy / sad banner when introspection failed. Never shown if
  // `enabled` is true.
  source: "checked" | "fallback_no_settings" | "fallback_api_error" | "no_theme";
  // When we read settings_data.json successfully but found no embed
  // matching our app, we surface a few example block types here so the
  // dashboard / developer can confirm which format Shopify is using.
  // Empty array on success.
  diag?: {
    sampleBlockTypes: string[];
    totalBlocks: number;
  };
};

type AdminGraphqlClient = {
  graphql(query: string, options?: { variables?: unknown }): Promise<Response>;
};

type ShopSettingsCacheKV = {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

// `themes/current/editor` redirects to `themes/<numeric-id>/editor` and
// the redirect drops the query string (including `activateAppId=...`).
// When we already know the active theme's numeric id from the GraphQL
// check, we substitute it in so the deep-link reaches the editor with
// the activation param intact.
function numericThemeId(themeGid: string | null): string {
  if (!themeGid) return "current";
  const m = themeGid.match(/(\d+)$/);
  return m ? m[1]! : "current";
}

function buildActivateUrl(shopDomain: string, themeGid: string | null): string {
  const themePart = numericThemeId(themeGid);
  // Shopify's docs use the `{shop}.myshopify.com/admin/...` URL form
  // for this deep link, NOT the new admin.shopify.com form.
  // admin.shopify.com strips the `activateAppId` param; myshopify.com
  // forwards it through the redirect.
  //
  // The `activateAppId` value is `{api_key}/{block_handle}` where
  // `api_key` is the app's client_id from shopify.app.toml — NOT the
  // theme-app-extension UUID. The Shopify docs called the latter "uuid"
  // historically (now deprecated), and using it produces the cryptic
  // "App embed does not exist" toast because the router resolves the
  // app by client_id, not extension UUID.
  //
  // The slash separator must be URL-encoded so the router doesn't
  // truncate at the second segment.
  const activateAppId = encodeURIComponent(`${APP_CLIENT_ID}/${EMBED_BLOCK_HANDLE}`);
  return `https://${shopDomain}/admin/themes/${themePart}/editor?context=apps&template=index&activateAppId=${activateAppId}`;
}

function buildManualEditorUrl(shopDomain: string, themeGid: string | null): string {
  const themePart = numericThemeId(themeGid);
  return `https://${shopDomain}/admin/themes/${themePart}/editor?context=apps`;
}

// Identifiers we'll accept as "this is our app." Shopify has shipped
// several formats for the embed block's `type` over time — some use the
// app's client_id (api_key), some use the theme extension's UUID, and
// older themes still reference the public app handle. Matching any of
// them keeps the detector robust across format changes.
const KNOWN_APP_MARKERS = [
  APP_CLIENT_ID,
  "019e9e0d-a3df-7213-bebf-f40e0399c14f",  // theme-app-extension UUID (CDN id)
  "product-bundler",                         // app's Shopify App Store handle
];

function blockMatches(block: unknown): boolean {
  if (!block || typeof block !== "object") return false;
  const type = (block as Record<string, unknown>)["type"];
  if (typeof type !== "string") return false;
  const lower = type.toLowerCase();
  // Must reference our app AND specifically be the app-embed block (not
  // bundle/qb/bxgy/mix-match section blocks — those use the same app
  // identifier but a different handle).
  if (!KNOWN_APP_MARKERS.some((m) => lower.includes(m.toLowerCase()))) return false;
  if (!lower.includes(EMBED_BLOCK_HANDLE)) return false;
  return true;
}

type SearchResult = {
  // The matched block (with `disabled` flag) when found, else null.
  matched: Record<string, unknown> | null;
  // Every block-like object's `type` string we encountered. Used to
  // diagnose mismatches (and bubbled up to the dashboard UI).
  allTypes: string[];
};

// Recursive walk over the parsed JSON. Collects every `.type` string we
// see (regardless of whether it matches us) and stops on the first
// match. The collected list is what we show in the diagnostic block of
// the banner when the match misses, so the developer can see what
// format Shopify is actually using on this store.
function walkFind(node: unknown, out: SearchResult): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) {
      if (out.matched) return;
      walkFind(item, out);
    }
    return;
  }
  const obj = node as Record<string, unknown>;
  // Surface this object's `type` if it looks like a block (has type +
  // disabled or settings keys).
  const type = obj["type"];
  if (typeof type === "string" && type.length < 300) {
    out.allTypes.push(type);
  }
  if (!out.matched && blockMatches(obj)) {
    out.matched = obj;
    return;
  }
  for (const value of Object.values(obj)) {
    if (out.matched) return;
    walkFind(value, out);
  }
}

type EmbedSearch = {
  // null when no app-embed block matched any of our markers; otherwise
  // the block's `disabled` flag.
  matchedDisabled: boolean | null;
  // Up to 12 block type strings we found while walking the tree —
  // surfaced to the dashboard so we can see what Shopify is actually
  // storing on a misbehaving store.
  sampleTypes: string[];
  totalBlocks: number;
};

function findAppEmbedBlock(settingsData: unknown): EmbedSearch {
  if (!settingsData || typeof settingsData !== "object") {
    return { matchedDisabled: null, sampleTypes: [], totalBlocks: 0 };
  }
  const result: SearchResult = { matched: null, allTypes: [] };
  walkFind(settingsData, result);
  return {
    matchedDisabled: result.matched ? result.matched["disabled"] === true : null,
    sampleTypes: result.allTypes.slice(0, 12),
    totalBlocks: result.allTypes.length,
  };
}


export async function checkAppEmbedStatus(
  admin: AdminGraphqlClient,
  shopDomain: string,
  kv: ShopSettingsCacheKV | null,
): Promise<AppEmbedStatus> {
  const cacheKey = `embed_status_v8:${shopDomain}`;
  if (kv) {
    const cached = (await kv.get(cacheKey, "json").catch(() => null)) as AppEmbedStatus | null;
    if (cached) return cached;
  }

  // The URLs depend on the theme id, which we don't have until the
  // GraphQL call below. Initialise with "current" so the fallback paths
  // (no-theme, api-error) still produce a clickable link.
  let result: AppEmbedStatus = {
    enabled: false,
    themeName: null,
    themeId: null,
    activateDeepLink: buildActivateUrl(shopDomain, null),
    manualEditorUrl: buildManualEditorUrl(shopDomain, null),
    source: "fallback_api_error",
  };

  try {
    // 1. Active (MAIN) theme — gets us the theme id + name for the UI.
    const themeRes = await admin.graphql(`
      query MainTheme {
        themes(first: 1, roles: [MAIN]) {
          nodes { id name }
        }
      }
    `);
    const themeJson = (await themeRes.json()) as {
      data?: { themes?: { nodes?: Array<{ id?: string; name?: string }> } };
    };
    const theme = themeJson.data?.themes?.nodes?.[0];
    if (!theme?.id) {
      result = { ...result, source: "no_theme" };
    } else {
      result.themeId = theme.id;
      result.themeName = theme.name ?? null;
      // Re-build the deep links using the resolved numeric theme id so
      // `themes/current` → `themes/<id>` redirects don't drop our query
      // params.
      result.activateDeepLink = buildActivateUrl(shopDomain, theme.id);
      result.manualEditorUrl = buildManualEditorUrl(shopDomain, theme.id);

      // 2. settings_data.json — that's where the active blocks live. The
      // OnlineStoreTheme file body is exposed as a union; we type-narrow
      // on the text variant.
      const fileRes = await admin.graphql(
        `query ThemeSettingsFile($id: ID!) {
          theme(id: $id) {
            files(filenames: ["config/settings_data.json"], first: 1) {
              nodes {
                body { ... on OnlineStoreThemeFileBodyText { content } }
              }
            }
          }
        }`,
        { variables: { id: theme.id } },
      );
      const fileJson = (await fileRes.json()) as {
        data?: {
          theme?: {
            files?: {
              nodes?: Array<{
                body?: { content?: string };
              }>;
            };
          };
        };
      };
      const content = fileJson.data?.theme?.files?.nodes?.[0]?.body?.content;
      if (!content) {
        result = { ...result, source: "fallback_no_settings" };
      } else {
        let parsed: unknown = null;
        try { parsed = JSON.parse(content); } catch { /* leave parsed null */ }
        const search = findAppEmbedBlock(parsed);
        const diag = {
          sampleBlockTypes: search.sampleTypes,
          totalBlocks: search.totalBlocks,
        };
        // matchedDisabled === null => block not found; treat as disabled.
        // matchedDisabled === false => block found and enabled.
        // matchedDisabled === true  => block found but turned off.
        const isEnabled = search.matchedDisabled === false;
        result = { ...result, enabled: isEnabled, source: "checked", diag };
      }
    }
  } catch (err) {
    // Permissions issue (write_themes / read_themes scope) or transient
    // network error. We log + fall back so the dashboard still loads.
    console.warn("[app-embed-status] check failed:", err);
    result = { ...result, source: "fallback_api_error" };
  }

  if (kv) {
    await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS })
      .catch(() => { /* cache is best-effort */ });
  }
  return result;
}

// Lets the dashboard "Refresh" action drop the cached value so the
// next loader call hits Shopify fresh.
export async function clearAppEmbedStatusCache(
  shopDomain: string,
  kv: ShopSettingsCacheKV | null,
): Promise<void> {
  if (!kv) return;
  await kv.delete(`embed_status_v8:${shopDomain}`).catch(() => { /* ignore */ });
}
