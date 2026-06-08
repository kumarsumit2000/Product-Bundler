import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(`/app${url.search}`);
}
