export const FORMATS = [
  {
    id: "small",
    label: "6 to 7 inch reader",
    devices: "Kindle, Kindle Paperwhite, Kobo Clara, Boox Poke",
    file: "PDF, 4 by 5⅓ inches, two columns",
  },
  {
    id: "large",
    label: "10 inch reader or larger",
    devices: "Kindle Scribe, Boox Note, reMarkable",
    file: "PDF, 6.2 by 8.3 inches, three columns",
  },
  {
    id: "epub",
    label: "Reflowable book",
    devices: "Any reader. Text resizes, the newspaper layout does not carry over.",
    file: "EPUB, one column",
  },
] as const;

export type FormatId = (typeof FORMATS)[number]["id"];
export const FORMAT_IDS = FORMATS.map((f) => f.id) as [FormatId, ...FormatId[]];

export function formatLabel(id: string | null) {
  return FORMATS.find((f) => f.id === id)?.label ?? "Not chosen";
}
