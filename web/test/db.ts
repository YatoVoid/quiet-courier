import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

export async function testDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../db/migrations") });
  return db;
}

export type TestDb = Awaited<ReturnType<typeof testDb>>;

export async function truncateAll(db: TestDb) {
  await db.execute(`truncate users, sessions, email_tokens, rate_events, audit_events restart identity cascade`);
}

const base = { admin1Code: null, latitude: 0, longitude: 0 };
const ascii = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");
export const PLACES = [
  { ...base, id: 4887398, name: "Chicago", asciiName: "Chicago", admin1: "Illinois", admin1Ascii: ascii("Illinois"), admin1Code: "IL", countryCode: "US", country: "United States", timeZone: "America/Chicago", population: 2720546 },
  { ...base, id: 2988507, name: "Paris", asciiName: "Paris", admin1: "Île-de-France", admin1Ascii: ascii("Île-de-France"), countryCode: "FR", country: "France", timeZone: "Europe/Paris", population: 2138551 },
  { ...base, id: 4717560, name: "Paris", asciiName: "Paris", admin1: "Texas", admin1Ascii: ascii("Texas"), admin1Code: "TX", countryCode: "US", country: "United States", timeZone: "America/Chicago", population: 24782 },
  { ...base, id: 2867714, name: "München", asciiName: "Munchen", admin1: "Bavaria", admin1Ascii: ascii("Bavaria"), countryCode: "DE", country: "Germany", timeZone: "Europe/Berlin", population: 1260391 },
  { ...base, id: 3133880, name: "Tromsø", asciiName: "Tromso", admin1: "Troms", admin1Ascii: ascii("Troms"), countryCode: "NO", country: "Norway", timeZone: "Europe/Oslo", population: 41915 },
  { ...base, id: 587084, name: "Baku", asciiName: "Baku", admin1: "Baki", admin1Ascii: ascii("Baki"), countryCode: "AZ", country: "Azerbaijan", timeZone: "Asia/Baku", population: 2351300 },
];

export async function seedPlaces(db: TestDb) {
  await db.insert(schema.places).values(PLACES).onConflictDoNothing();
}
