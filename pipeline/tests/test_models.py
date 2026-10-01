import json

import pytest

from courier.models import ContentError, load_edition


@pytest.fixture
def write(tmp_path, sample_path):
    def _write(mutate):
        d = json.loads(sample_path.read_text())
        mutate(d)
        p = tmp_path / "edition.json"
        p.write_text(json.dumps(d))
        return p
    return _write


def test_sample_loads(edition):
    assert edition.lead.title.startswith("100 years ago")
    assert all(a.attribution for a in edition.articles.values())


def test_rejects_non_commercial_license(write):
    def mutate(d):
        d["articles"][0]["license"]["commercial"] = False
    with pytest.raises(ContentError, match="commercial"):
        load_edition(write(mutate))


def test_rejects_missing_attribution(write):
    def mutate(d):
        d["articles"][1]["attribution"] = ""
    with pytest.raises(ContentError, match="attribution"):
        load_edition(write(mutate))


def test_rejects_unknown_front_page_story(write):
    def mutate(d):
        d["front"]["lead"] = "does-not-exist"
    with pytest.raises(ContentError, match="unknown article"):
        load_edition(write(mutate))


def test_no_derivatives_flag(edition):
    assert edition.lead.no_derivatives
    assert not edition.articles["nasa-moon-base"].no_derivatives
