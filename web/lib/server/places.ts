import "server-only";
import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { places, type Place, type User } from "@/db/schema";

export type PlaceOption = { id: number; label: string };

const MAX_RESULTS = 8;

export function placeLabel(p: Pick<Place, "name" | "admin1" | "country" | "countryCode">) {
  const region = p.admin1 && p.admin1 !== p.name ? `${p.admin1}, ` : "";
  return `${p.name}, ${region}${p.countryCode === "US" ? "USA" : p.country}`;
}

function fold(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// "paris" finds every Paris, biggest first. "paris, tx" or "paris, france" narrows by state, region or country.
export async function searchPlaces(query: string): Promise<PlaceOption[]> {
  const cleaned = query.slice(0, 80);
  const [rawName, ...rest] = cleaned.includes(",") ? cleaned.split(",") : [cleaned];
  const name = fold(rawName);
  if (name.length < 2) return [];
  const rawQualifier = rest.join(" ").trim().toLowerCase();
  const qualifier = fold(rawQualifier);

  const nameMatch = or(
    sql`lower(${places.asciiName}) like ${`${escapeLike(name)}%`}`,
    sql`lower(${places.name}) like ${`${escapeLike(rawName.trim().toLowerCase())}%`}`,
  );
  let where: SQL | undefined = nameMatch;
  if (qualifier) {
    const q = `${escapeLike(qualifier)}%`;
    const rawQ = `${escapeLike(rawQualifier)}%`;
    where = and(
      nameMatch,
      or(
        sql`lower(${places.admin1Ascii}) like ${q}`,
        sql`lower(${places.admin1}) like ${rawQ}`,
        sql`lower(${places.country}) like ${q}`,
        sql`lower(${places.countryCode}) = ${qualifier}`,
        sql`lower(${places.admin1Code}) = ${qualifier}`,
        ...(qualifier === "usa" || qualifier === "us" ? [eq(places.countryCode, "US")] : []),
      ),
    );
  }
  const rows = await db.select().from(places).where(where).orderBy(desc(places.population)).limit(MAX_RESULTS);
  return rows.map((p) => ({ id: p.id, label: placeLabel(p) }));
}

export async function getPlace(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [row] = await db.select().from(places).where(eq(places.id, id)).limit(1);
  return row ?? null;
}

export async function describeWeatherChoice(user: Pick<User, "localWeather" | "placeId" | "timeZone">) {
  if (!user.localWeather) return `General edition, no local weather (${user.timeZone ?? "time zone not set"})`;
  const place = user.placeId ? await getPlace(user.placeId) : null;
  return place ? placeLabel(place) : "Not chosen";
}

export function editionKey(user: Pick<User, "localWeather" | "placeId">) {
  if (!user.localWeather) return "general";
  return user.placeId ? `gn-${user.placeId}` : null;
}
