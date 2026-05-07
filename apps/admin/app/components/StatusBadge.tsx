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

const PROGRESS: Record<Status, "complete" | "partiallyComplete" | "incomplete"> = {
  active: "complete",
  draft: "incomplete",
  paused: "partiallyComplete",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge tone={TONE[status]} progress={PROGRESS[status]}>
      {LABEL[status]}
    </Badge>
  );
}
