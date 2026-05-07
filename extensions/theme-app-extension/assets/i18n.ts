import enStrings from "../locales/en.default.json";

type StringTable = Record<string, string>;
const TABLES: Record<string, StringTable> = { en: enStrings as StringTable };

let active: StringTable = TABLES.en!;

export function setLocale(loc: string): void {
  active = TABLES[loc.split("-")[0]!] ?? TABLES.en!;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const tmpl = active[key] ?? key;
  if (!vars) return tmpl;
  return tmpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
