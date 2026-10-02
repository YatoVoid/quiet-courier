"use client";

import { useActionState } from "react";
import type { ProfileState } from "@/app/actions/account";
import { FORMATS } from "@/lib/formats";

type Values = { name: string; cityId: string; format: string; deliveryEmail: string };

export function ProfileForm({
  action,
  initial,
  cities,
  withTerms,
  submitLabel,
}: {
  action: (prev: ProfileState, form: FormData) => Promise<ProfileState>;
  initial: Values;
  cities: { id: string; label: string }[];
  withTerms: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values: Record<string, string> = { ...initial, ...state.values };
  const errors = state.errors ?? {};
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

      <div className="field">
        <label htmlFor="cityId">City</label>
        <span className="hint" id="city-hint">Sets the weather, sunrise and almanac.</span>
        <select id="cityId" name="cityId" defaultValue={values.cityId}
          aria-describedby={describedBy("cityId", "city-hint")} aria-invalid={errors.cityId ? true : undefined}>
          <option value="" disabled>
            Choose a city
          </option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {error("cityId")}
      </div>

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
