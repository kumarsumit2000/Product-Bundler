import { drizzle } from "drizzle-orm/d1";
import * as schema from "../drizzle/schema";

export type DB = ReturnType<typeof drizzle<typeof schema>>;

export function getDb(d1: D1Database | DB): DB {
  // In tests, a better-sqlite3 drizzle instance is passed directly
  if (typeof (d1 as DB).select === "function") {
    return d1 as DB;
  }
  return drizzle(d1 as D1Database, { schema });
}

export { schema };
