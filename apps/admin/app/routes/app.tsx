import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);

  const db = getDb(ctx.cloudflare.env.DB);
  await db
    .insert(schema.shops)
    .values({
      id: session.shop,
      scopes: session.scope ?? "",
      installedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.shops.id,
      set: {
        scopes: session.scope ?? "",
        uninstalledAt: null,
      },
    });

  return json({ apiKey: ctx.cloudflare.env.SHOPIFY_API_KEY });
}

export default function App() {
  useLoaderData<typeof loader>();
  return (
    <PolarisAppProvider i18n={enTranslations}>
      <Outlet />
    </PolarisAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
