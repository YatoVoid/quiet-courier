"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import type { ProfileState } from "@/app/actions/account";
import { FORMATS } from "@/lib/formats";
import { PlacePicker } from "./place-picker";

type Values = {
  name: string;
  weather: string;
  placeId: string;
  placeLabel: string;
  timeZone: string;
  format: string;
  deliveryEmail: string;
};

const noSubscribe = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function ProfileForm({
  action,
  initial,
  timeZones,
  withTerms,
  submitLabel,
}: {
  action: (prev: ProfileState, form: FormData) => Promise<ProfileState>;
  initial: Values;
  timeZones: string[];
  withTerms: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values: Record<string, string> = { ...initial, ...state.values };
  const errors = state.errors ?? {};
  const [weather, setWeather] = useState(values.weather || "local");
  const detectedZone = useSyncExternalStore(noSubscribe, browserTimeZone, () => "");
  const zone = values.timeZone || (timeZones.includes(detectedZone) ? detectedZone : "");
  const describedBy = (field: string, hint?: string) =>
    [hint, errors[field] ? `${field}-error` : null].filter(Boolean).join(" ") || undefined;
  const error = (field: string) =>
    errors[field] ? (
      <span className="error" id={`${field}-error`}>
        {errors[field]}
      </span>
    ) : null;

  return (
    <form action={formAction} noValidate key={JSON.stringify(state.values ?? initial)}>
      {Object.keys(errors).length > 0 && (
        <div className="notice" role="alert">
          <p>Some answers need fixing. They&rsquo;re marked below.</p>
        </div>
      )}
      {state.saved && (
        <div className="notice" role="status">
          <p>{state.saved}</p>
        </div>
      )}

      <div className="field">
        <label htmlFor="name">Your name</label>
        <span className="hint" id="name-hint">Printed under the masthead: &ldquo;Delivered to Ada Reader.&rdquo;</span>
        <input id="name" name="name" type="text" autoComplete="name" maxLength={60} defaultValue={values.name}
          aria-describedby={describedBy("name", "name-hint")} aria-invalid={errors.name ? true : undefined} />
        {error("name")}
      </div>

      <fieldset className="field">
        <legend>Weather</legend>
        <span className="hint" id="weather-hint">
          Your city sets only the forecast, sunrise and sunset, and the almanac. The news is the same in every edition.
        </span>
        <label className="choice">
          <input type="radio" name="weather" value="local" checked={weather === "local"} onChange={() => setWeather("local")} />
          <strong>Include the weather for my city</strong>
          <span>Today&rsquo;s forecast in the masthead and a forecast page inside. Any city or town in the world.</span>
        </label>
        {weather === "local" && (
          <div className="sub-field">
            <label htmlFor="placeQuery" className="sub-label">City or town</label>
            <PlacePicker
              initialId={values.placeId ? Number(values.placeId) : null}
              initialLabel={values.placeLabel ?? ""}
              describedBy={describedBy("placeId", "weather-hint")}
              invalid={Boolean(errors.placeId)}
            />
            {error("placeId")}
          </div>
        )}
        <label className="choice">
          <input type="radio" name="weather" value="none" checked={weather === "none"} onChange={() => setWeather("none")} />
          <strong>General edition, no local weather</strong>
          <span>The masthead shows the moon and the day of the year instead. You still choose a time zone so the paper arrives in your morning.</span>
        </label>
        {weather === "none" && (
          <div className="sub-field">
            <label htmlFor="timeZone" className="sub-label">Time zone</label>
            <select id="timeZone" name="timeZone" key={zone} defaultValue={zone}
              aria-describedby={describedBy("timeZone")} aria-invalid={errors.timeZone ? true : undefined}>
              <option value="" disabled>
                Choose a time zone
              </option>
              {timeZones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replaceAll("_", " ").replaceAll("/", " / ")}
                </option>
              ))}
            </select>
            {error("timeZone")}
          </div>
        )}
        {error("weather")}
      </fieldset>

      <fieldset className="field" aria-describedby={describedBy("format")}>
        <legend>Your reader</legend>
        {FORMATS.map((f) => (
          <label className="choice" key={f.id}>
            <input type="radio" name="format" value={f.id} defaultChecked={values.format === f.id} />
            <strong>{f.label}</strong>
            <span>{f.devices}</span>
            <span>{f.file}</span>
          </label>
        ))}
        {error("format")}
      </fieldset>

      <div className="field">
        <label htmlFor="deliveryEmail">Deliver to</label>
        <span className="hint" id="delivery-hint">
          Your Send to Kindle address, ending in @kindle.com. The setup guide shows where to find it. Another address works
          too; we&rsquo;ll ask it to confirm first.
        </span>
        <input id="deliveryEmail" name="deliveryEmail" type="email" autoComplete="off" spellCheck={false}
          defaultValue={values.deliveryEmail} aria-describedby={describedBy("deliveryEmail", "delivery-hint")}
          aria-invalid={errors.deliveryEmail ? true : undefined} />
        {error("deliveryEmail")}
      </div>

      {withTerms && (
        <div className="field">
          <label className="check">
            <input type="checkbox" name="acceptTerms" defaultChecked={values.acceptTerms === "on"}
              aria-describedby={describedBy("acceptTerms")} aria-invalid={errors.acceptTerms ? true : undefined} />
            <span>
              I agree to the <a href="/terms" target="_blank">terms of service</a> and have read the{" "}
              <a href="/privacy" target="_blank">privacy policy</a>.
            </span>
          </label>
          {error("acceptTerms")}
        </div>
      )}

      <button className="button" type="submit" disabled={pending}>
        {pending ? "Saving" : submitLabel}
      </button>
    </form>
  );
}
