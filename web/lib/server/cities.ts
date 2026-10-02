import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "smol-toml";
import { z } from "zod";

const citySchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), name: z.string(), region: z.string() });
const configSchema = z.object({ cities: z.array(citySchema).min(1) });

export type City = z.infer<typeof citySchema>;

let cached: City[] | null = null;

// The pipeline's courier.toml decides which cities get an edition, so the site offers exactly those.
export function cities(): City[] {
  if (cached) return cached;
  const file = process.env.COURIER_CONFIG ?? path.resolve(/*turbopackIgnore: true*/ process.cwd(), "../pipeline/courier.toml");
  const parsed = configSchema.parse(parse(readFileSync(file, "utf8")));
  cached = parsed.cities.map(({ id, name, region }) => ({ id, name, region }));
  return cached;
}

export function cityName(id: string | null) {
  const city = cities().find((c) => c.id === id);
  return city ? `${city.name}, ${city.region}` : "Not chosen";
}
