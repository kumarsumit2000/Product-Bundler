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
