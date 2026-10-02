"use client";

import { useEffect, useId, useRef, useState } from "react";

type Option = { id: number; label: string };

export function PlacePicker({
  initialId,
  initialLabel,
  describedBy,
  invalid,
}: {
  initialId: number | null;
  initialLabel: string;
  describedBy?: string;
  invalid: boolean;
}) {
  const listId = useId();
  const [text, setText] = useState(initialLabel);
  const [selectedId, setSelectedId] = useState<number | null>(initialId);
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const latest = useRef(0);

  useEffect(() => {
    if (selectedId !== null || text.trim().length < 2) return;
    const ticket = ++latest.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(text)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const { results } = (await res.json()) as { results: Option[] };
        if (ticket !== latest.current) return;
        setOptions(results);
        setActive(results.length ? 0 : -1);
        setOpen(true);
        setStatus(results.length ? `${results.length} places found. Use the arrow keys to choose.` : "No places found.");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setStatus("City search isn't responding. Try again in a moment.");
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, selectedId]);

  function choose(option: Option) {
    setSelectedId(option.id);
    setText(option.label);
    setOpen(false);
    setStatus(`${option.label} chosen.`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !options.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && options.length > 0;
  return (
    <div className="combo">
      <input
        id="placeQuery"
        name="placeQuery"
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        placeholder="Start typing a city or town"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSelectedId(null);
          if (e.target.value.trim().length < 2) {
            setOpen(false);
            setOptions([]);
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => options.length && selectedId === null && setOpen(true)}
      />
      <input type="hidden" name="placeId" value={selectedId ?? ""} />
      <ul id={listId} role="listbox" className="combo-list" hidden={!showList}>
        {options.map((o, i) => (
          <li
            key={o.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? "combo-option is-active" : "combo-option"}
            onMouseDown={(e) => {
              e.preventDefault();
              choose(o);
            }}
          >
            {o.label}
          </li>
        ))}
      </ul>
      <span className="visually-hidden" role="status" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
