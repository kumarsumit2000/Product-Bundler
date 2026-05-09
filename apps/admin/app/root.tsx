import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";
import type { AppLoadContext } from "~/shopify.server";

export async function loader({ context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  return json({ apiKey: ctx.cloudflare.env.SHOPIFY_API_KEY });
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
        {/* App Bridge must load on every response, including error/410 bootstrap.
            Without it, embedded token exchange never runs and the iframe ends up
            stuck in an OAuth redirect loop blocked by X-Frame-Options. */}
        <script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          data-api-key={apiKey}
        />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
