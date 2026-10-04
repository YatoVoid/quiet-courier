import "server-only";
import type { User } from "@/db/schema";
import { getPlace, placeLabel } from "./places";

export const TIME_ZONES = ["UTC", ...Intl.supportedValuesOf("timeZone")];

export async function profileInitial(user: User) {
  const place = user.placeId ? await getPlace(user.placeId) : null;
  return {
    name: user.name ?? "",
    weather: user.localWeather ? "local" : "none",
    placeId: place ? String(place.id) : "",
    placeLabel: place ? placeLabel(place) : "",
    timeZone: user.timeZone ?? "",
    format: user.format ?? "",
    deliveryMethod: user.deliveryMethod,
    deliveryEmail: user.deliveryEmail ?? "",
  };
}
