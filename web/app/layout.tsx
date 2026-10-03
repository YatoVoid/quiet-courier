import type { Metadata } from "next";
import localFont from "next/font/local";
import { PAPER_NAME } from "@/lib/site";
import "./globals.css";

const body = localFont({
  src: [
    { path: "./fonts/OldStandard-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/OldStandard-Italic.ttf", weight: "400", style: "italic" },
    { path: "./fonts/OldStandard-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});
const blackletter = localFont({ src: "./fonts/UnifrakturMaguntia-Book.ttf", variable: "--font-blackletter", display: "swap" });
const fell = localFont({
  src: [
    { path: "./fonts/IMFePIrm28P.ttf", weight: "400", style: "normal" },
    { path: "./fonts/IMFePIit28P.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-fell",
  display: "swap",
});
const caps = localFont({ src: "./fonts/IMFeENsc28P.ttf", variable: "--font-caps", display: "swap" });

const DESCRIPTION =
  "A daily newspaper for Kindle and other e-ink readers, emailed each morning and laid out like an early-1900s broadsheet. Real news, science and history, fifteen to twenty minutes of reading, then you're done.";

export const metadata: Metadata = {
  title: { default: `${PAPER_NAME}: a daily newspaper for Kindle and e-ink readers`, template: `%s | ${PAPER_NAME}` },
  description: DESCRIPTION,
  applicationName: PAPER_NAME,
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  openGraph: {
    type: "website",
    siteName: PAPER_NAME,
    title: `${PAPER_NAME}: a daily newspaper for your e-reader`,
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Three front pages of The Quiet Courier" }],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${blackletter.variable} ${fell.variable} ${caps.variable}`}>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
