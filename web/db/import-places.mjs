import "dotenv/config";
import postgres from "postgres";
import { parseAdmin1, parseCities, parseCountries, unzipSingle } from "./geonames.mjs";

const BASE = "https://download.geonames.org/export/dump";
const BATCH = 2000;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

async function download(name) {
  const res = await fetch(`${BASE}/${name}`, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10, onnotice: () => {} });
try {
  const [zip, admin1, countries] = await Promise.all([
    download("cities1000.zip"),
    download("admin1CodesASCII.txt"),
    download("countryInfo.txt"),
  ]);
  const rows = parseCities(
    unzipSingle(zip, "cities1000.txt").toString("utf8"),
    parseAdmin1(admin1.toString("utf8")),
    parseCountries(countries.toString("utf8")),
  );
  if (rows.length < 100_000) throw new Error(`only ${rows.length} places parsed, refusing to load a partial list`);
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await sql`
      insert into places ${sql(batch)}
      on conflict (id) do update set
        name = excluded.name, ascii_name = excluded.ascii_name, admin1 = excluded.admin1, admin1_ascii = excluded.admin1_ascii, admin1_code = excluded.admin1_code,
        country_code = excluded.country_code, country = excluded.country, latitude = excluded.latitude,
        longitude = excluded.longitude, time_zone = excluded.time_zone, population = excluded.population`;
  }
  console.log(`loaded ${rows.length} places`);
} catch (err) {
  console.error("place import failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
