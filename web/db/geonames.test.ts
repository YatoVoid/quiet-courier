import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseAdmin1, parseCities, parseCountries, unzipSingle } from "./geonames.mjs";

function zipOf(name: string, content: Buffer) {
  const data = deflateRawSync(content);
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBuf.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}

const LYON = ["2996944", "Lyon", "Lyon", "Lion,Lione", "45.74846", "4.84671", "P", "PPLA", "FR", "", "84", "691", "", "",
  "522969", "", "173", "Europe/Paris", "2024-01-01"].join("\t");

describe("geonames", () => {
  it("reads the one file out of a deflated zip", () => {
    const text = "hello\tworld\n".repeat(1000);
    expect(unzipSingle(zipOf("cities1000.txt", Buffer.from(text)), "cities1000.txt").toString()).toBe(text);
    expect(() => unzipSingle(zipOf("other.txt", Buffer.from("x")), "cities1000.txt")).toThrow("not found");
    expect(() => unzipSingle(Buffer.from("nope"), "cities1000.txt")).toThrow("not a zip");
  });

  it("joins region and country names onto each city", () => {
    const admin1 = parseAdmin1("FR.84\tAuvergne-Rhône-Alpes\tAuvergne-Rhone-Alpes\t11071625\n");
    const countries = parseCountries("# comment\nFR\tFRA\t250\tFR\tFrance\tParis\n");
    const [lyon] = parseCities(`${LYON}\nbroken line\n`, admin1, countries);
    expect(lyon).toEqual({
      id: 2996944, name: "Lyon", ascii_name: "Lyon", admin1: "Auvergne-Rhône-Alpes", admin1_ascii: "Auvergne-Rhone-Alpes", admin1_code: "84", country_code: "FR",
      country: "France", latitude: 45.74846, longitude: 4.84671, time_zone: "Europe/Paris", population: 522969,
    });
  });
});
