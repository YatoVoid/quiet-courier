import datetime as dt
import gzip
import json

import pytest

from courier.sources import chronicling


def _gz(data: dict) -> bytes:
    return gzip.compress(json.dumps(data).encode())


def _ship(data: dict) -> None:
    chronicling.INDEX.write_bytes(_gz(data))
    chronicling._index.cache_clear()


ISSUE = [{"id": "https://www.loc.gov/item/x/1927-12-31/ed-1/", "title": "Paper"}]


class Served:
    def __init__(self, body: bytes):
        self.body = body

    def get(self, url, accept="*/*"):
        assert url == chronicling.INDEX_URL
        return self.body


def test_next_range_continues_from_the_end_six_weeks_at_a_time():
    _ship({"1927-12-30": ISSUE, "1927-12-31": ISSUE})
    assert chronicling.next_index_range(dt.date(2026, 12, 1)) == (dt.date(2028, 1, 1), dt.date(2028, 1, 5))
    assert chronicling.next_index_range(dt.date(2027, 3, 1)) == (dt.date(2028, 1, 1), dt.date(2028, 2, 14))
    assert chronicling.next_index_range(dt.date(2026, 10, 3)) is None, "already 13 months ahead"


def test_empty_index_starts_today():
    assert chronicling.next_index_range(dt.date(2026, 10, 3)) == (dt.date(2026, 10, 3), dt.date(2026, 11, 16))


def test_refresh_keeps_a_newer_published_index_and_merges_it():
    _ship({"1927-12-31": ISSUE})
    newer = Served(_gz({"1927-12-31": ISSUE, "1928-01-15": ISSUE}))
    assert chronicling.refresh_index(newer) == dt.date(1928, 1, 15)
    assert chronicling.DOWNLOADED.exists() and set(chronicling._index()) == {"1927-12-31", "1928-01-15"}
    assert chronicling.refresh_index(newer) is None, "nothing new the second time"


def test_refresh_ignores_an_older_copy_and_rejects_bad_ones():
    _ship({"1928-03-01": ISSUE})
    assert chronicling.refresh_index(Served(_gz({"1927-12-31": ISSUE}))) is None
    assert not chronicling.DOWNLOADED.exists()
    with pytest.raises(ValueError, match="expected shape"):
        chronicling.refresh_index(Served(_gz({"not a date": ISSUE, "1929-01-01": ISSUE})))
    with pytest.raises(ValueError, match="expected shape"):
        chronicling.refresh_index(Served(_gz({"1929-01-01": [{"no": "id"}]})))
    assert not chronicling.DOWNLOADED.exists()
