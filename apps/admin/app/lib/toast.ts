import { useEffect } from "react";
import { useSearchParams } from "@remix-run/react";

type ShopifyApi = { toast?: { show: (msg: string) => void } };

export function useSavedToast(): void {
  const [params, setParams] = useSearchParams();
  const saved = params.get("saved");
  useEffect(() => {
    if (!saved) return;
    const w = window as unknown as { shopify?: ShopifyApi };
    const message = saved === "1" ? "Saved" : `${saved} saved`;
    w.shopify?.toast?.show(message);
    const next = new URLSearchParams(params);
    next.delete("saved");
    setParams(next, { replace: true });
  }, [saved, params, setParams]);
}
