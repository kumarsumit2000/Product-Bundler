// Convert an HTML `<input type="datetime-local">` value into a Date (or null
// when blank/invalid). Browsers emit YYYY-MM-DDTHH:MM in the user's local
// timezone — we just trust new Date(...) to interpret it that way.
export function parseDateLocal(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const t = new Date(s);
  if (Number.isNaN(t.getTime())) return null;
  return t;
}

// Format a Date for an HTML `<input type="datetime-local">` value. Returns
// "" for null so the field reads as blank. Uses the user's local timezone.
export function toDatetimeLocal(t: Date | null | undefined): string {
  if (!t) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}
