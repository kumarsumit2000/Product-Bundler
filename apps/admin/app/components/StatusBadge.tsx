type Status = "draft" | "active" | "paused";

const STYLES: Record<Status, { bg: string; fg: string; dot: string; label: string }> = {
  active: { bg: "#cdfee1", fg: "#0c5132", dot: "#1f8845", label: "Active" },
  draft:  { bg: "#e4e5e7", fg: "#303030", dot: "#8a8a8a", label: "Draft" },
  paused: { bg: "#ffe9d4", fg: "#7e3a00", dot: "#b25500", label: "Paused" },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = STYLES[status] ?? STYLES.draft;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        fontSize: 12,
        fontWeight: 500,
        lineHeight: "16px",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: s.dot,
          flexShrink: 0,
        }}
      />
      {s.label}
    </span>
  );
}
