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

export const metadata: Metadata = {
  title: { default: PAPER_NAME, template: `%s | ${PAPER_NAME}` },
  description: "A daily newspaper for Kindle and other e-ink readers, laid out like an early-1900s broadsheet. Fifteen to twenty minutes of reading, then you're done.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
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
