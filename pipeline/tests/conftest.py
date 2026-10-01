from pathlib import Path

import pytest

from courier.models import load_edition

SAMPLE = Path(__file__).resolve().parent.parent / "samples" / "kansas-city.json"


@pytest.fixture(scope="session")
def sample_path():
    return SAMPLE


@pytest.fixture(scope="session")
def edition():
    return load_edition(SAMPLE)
