import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

function connect(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 5, connect_timeout: 10, idle_timeout: 60 });
  return drizzle(client, { schema });
}

const globalForDb = globalThis as unknown as { courierDb?: Db };

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    globalForDb.courierDb ??= connect();
    return Reflect.get(globalForDb.courierDb, prop);
  },
});
