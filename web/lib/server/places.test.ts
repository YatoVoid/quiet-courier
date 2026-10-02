import { beforeAll, describe, expect, it, vi } from "vitest";
import { seedPlaces, testDb } from "@/test/db";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db as object, p) }) }));

import { editionKey, searchPlaces } from "./places";

beforeAll(async () => {
  const db = await testDb();
  h.db = db;
  await seedPlaces(db);
});

const labels = async (q: string) => (await searchPlaces(q)).map((r) => r.label);

describe("searchPlaces", () => {
  it("lists every match, biggest first", async () => {
    expect(await labels("par")).toEqual(["Paris, Île-de-France, France", "Paris, Texas, USA"]);
  });

  it("narrows by state code, region or country after a comma", async () => {
    expect(await labels("paris, tx")).toEqual(["Paris, Texas, USA"]);
    expect(await labels("paris, fra")).toEqual(["Paris, Île-de-France, France"]);
    expect(await labels("Paris, ile")).toEqual(["Paris, Île-de-France, France"]);
  });

  it("matches with or without accents", async () => {
    expect(await labels("munchen")).toEqual(["München, Bavaria, Germany"]);
    expect(await labels("Münch")).toEqual(["München, Bavaria, Germany"]);
    expect(await labels("tromso")).toEqual(["Tromsø, Troms, Norway"]);
  });

  it("ignores one-letter queries and treats LIKE wildcards as text", async () => {
    expect(await labels("p")).toEqual([]);
    expect(await labels("%%")).toEqual([]);
    expect(await labels("b_ku")).toEqual([]);
  });
});

describe("editionKey", () => {
  it("names the edition a reader gets", () => {
    expect(editionKey({ localWeather: true, placeId: 587084 })).toBe("gn-587084");
    expect(editionKey({ localWeather: false, placeId: null })).toBe("general");
    expect(editionKey({ localWeather: true, placeId: null })).toBeNull();
  });
});
