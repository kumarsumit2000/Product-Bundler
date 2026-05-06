import { Badge } from "@shopify/polaris";

type Status = "draft" | "active" | "paused";

const TONE: Record<Status, "success" | "info" | "warning"> = {
  active: "success",
  draft: "info",
  paused: "warning",
};

const LABEL: Record<Status, string> = {
  active: "Active",
  draft: "Draft",
  paused: "Paused",
};

export function StatusBadge({ status }: { status: Status }) {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;
}
