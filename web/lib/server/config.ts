import "server-only";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const isProduction = process.env.NODE_ENV === "production";

export function appUrl() {
  return (process.env.APP_URL ?? (isProduction ? required("APP_URL") : "http://localhost:3000")).replace(/\/$/, "");
}

export function mailFrom() {
  return process.env.MAIL_FROM ?? "The Quiet Courier <edition@quietcourier.com>";
}

export function editionSender() {
  return mailFrom().match(/<([^>]+)>/)?.[1] ?? mailFrom();
}

export function contactEmail() {
  return process.env.CONTACT_EMAIL ?? "hello@quietcourier.com";
}

// Signs readers' download links and referrers' stats pages. Changing it turns all of them off.
export function linkSecret() {
  const value = process.env.READ_LINK_SECRET;
  if (value && value.length >= 32) return value;
  if (isProduction) throw new Error("READ_LINK_SECRET must be set to at least 32 characters");
  return "development-only-read-link-secret-not-for-production";
}
