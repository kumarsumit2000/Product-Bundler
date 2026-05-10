import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { CrispChat } from "~/components/CrispChat";

const CRISP_WEBSITE_ID = "1bc3a4d6-454d-4054-b07c-10599fd26d10";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;

  // When Shopify loads our app inside the embedded admin iframe, it sets
  // shop + host + embedded=1. If embedded=1 is missing (which happens after
  // some auth callback paths), shopify-app-remix returns a server-side 302
  // to admin.shopify.com — that gets X-Frame-Options blocked because the
  // iframe can't redirect out to admin.shopify.com. Detect that case and
  // self-redirect with embedded=1 added so the bounce-page flow runs.
  const url = new URL(request.url);
  const hasShopHost = url.searchParams.get("shop") && url.searchParams.get("host");
  const isEmbedded = url.searchParams.get("embedded") === "1";
  if (hasShopHost && !isEmbedded) {
    url.searchParams.set("embedded", "1");
    throw redirect(url.pathname + url.search);
  }

  await authenticate.admin(request, ctx);
  return json({ apiKey: ctx.cloudflare.env.SHOPIFY_API_KEY });
}

type PolarisLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  url?: string;
  external?: boolean;
};

const PolarisLink = forwardRef<HTMLAnchorElement, PolarisLinkProps>(
  function PolarisLink({ children, url, external, ...rest }, ref) {
    if (external || (url && /^https?:\/\//.test(url))) {
      return (
        <a href={url} target="_blank" rel="noreferrer" {...rest} ref={ref}>
          {children}
        </a>
      );
    }
    return (
      <Link to={url ?? "#"} {...rest} ref={ref}>
        {children}
      </Link>
    );
  },
);

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <ShopifyAppProvider isEmbeddedApp apiKey={apiKey}>
      <PolarisAppProvider
        i18n={enTranslations}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkComponent={PolarisLink as any}
      >
        <NavMenu>
          <Link to="/app" rel="home">Dashboard</Link>
          <Link to="/app/new">Create new</Link>
          <Link to="/app/bundles">Bundles</Link>
          <Link to="/app/quantity-breaks">Quantity breaks</Link>
          <Link to="/app/bxgy-offers">Buy X, get Y</Link>
          <Link to="/app/progressive-gifts">Progressive gifts</Link>
          <Link to="/app/countdowns">Countdowns</Link>
          <Link to="/app/newsletter">Newsletter</Link>
          <Link to="/app/billing">Billing</Link>
          <Link to="/app/support">Support</Link>
        </NavMenu>
        <div style={{ paddingBottom: 100 }}>
          <Outlet />
        </div>
        <CrispChat websiteId={CRISP_WEBSITE_ID} />
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => {
  const h = new Headers(boundary.headers(args));
  // boundary.headers() doesn't always emit a frame-ancestors CSP on thrown
  // error responses (e.g. the 410 returned during token-exchange bootstrap).
  // Without it, Chrome refuses to render our iframe inside Shopify admin and
  // the merchant sees "admin.shopify.com refused to connect."
  if (!h.has("Content-Security-Policy")) {
    h.set(
      "Content-Security-Policy",
      "frame-ancestors https://*.shopify.com https://admin.shopify.com",
    );
  }
  return h;
};
