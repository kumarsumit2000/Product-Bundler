import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
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
          <Link to="/app/bundles">Bundles</Link>
          <Link to="/app/quantity-breaks">Quantity breaks</Link>
          <Link to="/app/billing">Billing</Link>
          <Link to="/app/support">Support</Link>
        </NavMenu>
        <Outlet />
        <CrispChat websiteId={CRISP_WEBSITE_ID} />
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
