from pathlib import Path

import pytest

from courier.models import load_edition
from courier.sources import chronicling

SAMPLE = Path(__file__).resolve().parent.parent / "samples" / "kansas-city.json"


@pytest.fixture(scope="session")
def sample_path():
    return SAMPLE


@pytest.fixture(scope="session")
def edition():
    return load_edition(SAMPLE)


@pytest.fixture(autouse=True)
def archive_index(tmp_path, monkeypatch):
    path = tmp_path / "archive-index.json.gz"
    monkeypatch.setattr(chronicling, "INDEX", path)
    chronicling._index.cache_clear()
    yield path
    chronicling._index.cache_clear()
