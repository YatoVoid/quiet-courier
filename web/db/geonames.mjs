import { inflateRawSync } from "node:zlib";

// GeoNames ships cities1000 as a zip holding one text file. Reads that entry through the
// central directory, since the local header's sizes can be zero when a data descriptor is used.
export function unzipSingle(buf, wanted) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("not a zip file");
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + compressed);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`unsupported zip method ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} not found in zip`);
}

export function parseAdmin1(text) {
  const map = new Map();
  for (const line of text.split("\n")) {
    const [code, name, ascii] = line.split("\t");
    if (code && name) map.set(code, { name, ascii: ascii || name });
  }
  return map;
}

export function parseCountries(text) {
  const map = new Map();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const cols = line.split("\t");
    if (cols[0] && cols[4]) map.set(cols[0], cols[4]);
  }
  return map;
}

export function parseCities(text, admin1, countries) {
  const rows = [];
  for (const line of text.split("\n")) {
    const c = line.split("\t");
    if (c.length < 19 || !c[17]) continue;
    const countryCode = c[8];
    rows.push({
      id: Number(c[0]),
      name: c[1],
      ascii_name: c[2] || c[1],
      admin1: admin1.get(`${countryCode}.${c[10]}`)?.name ?? null,
      admin1_ascii: admin1.get(`${countryCode}.${c[10]}`)?.ascii ?? null,
      admin1_code: c[10] || null,
      country_code: countryCode,
      country: countries.get(countryCode) ?? countryCode,
      latitude: Number(c[4]),
      longitude: Number(c[5]),
      time_zone: c[17],
      population: Number(c[14]) || 0,
    });
  }
  return rows;
}
