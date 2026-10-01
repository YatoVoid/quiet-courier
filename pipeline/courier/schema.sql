-- Plain SQL so the same tables can move to Postgres (Supabase) in Phase 3.
CREATE TABLE IF NOT EXISTS editions (
    id            TEXT PRIMARY KEY,          -- "<date>/<city>"
    edition_date  TEXT NOT NULL,
    city_id       TEXT NOT NULL,
    paper_name    TEXT NOT NULL,
    number        INTEGER NOT NULL,
    word_count    INTEGER NOT NULL,
    reading_min   INTEGER NOT NULL,
    built_at      TEXT NOT NULL,
    edition_json  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS edition_items (
    edition_id    TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    item_id       TEXT NOT NULL,
    kind          TEXT NOT NULL,             -- article, poem, weather
    section       TEXT,
    title         TEXT NOT NULL,
    source_name   TEXT NOT NULL,
    source_url    TEXT NOT NULL,
    license_id    TEXT NOT NULL,
    attribution   TEXT NOT NULL,
    changes       TEXT,
    word_count    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (edition_id, position)
);
CREATE INDEX IF NOT EXISTS edition_items_url ON edition_items (source_url);

CREATE TABLE IF NOT EXISTS source_runs (
    edition_id    TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
    source        TEXT NOT NULL,
    ok            INTEGER NOT NULL,
    items         INTEGER NOT NULL,
    duration_ms   INTEGER NOT NULL,
    error         TEXT,
    PRIMARY KEY (edition_id, source)
);
