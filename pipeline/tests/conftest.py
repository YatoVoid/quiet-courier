from pathlib import Path

import pytest

from broadsheet.models import load_edition

SAMPLE = Path(__file__).resolve().parent.parent / "samples" / "sample_edition.json"


@pytest.fixture(scope="session")
def sample_path():
    return SAMPLE


@pytest.fixture(scope="session")
def edition():
    return load_edition(SAMPLE)
