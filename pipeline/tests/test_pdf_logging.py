import logging

import courier.pdf  # noqa: F401  (installs the filter)


def test_harfbuzz_fallback_notice_is_dropped_but_other_warnings_stay(caplog):
    log = logging.getLogger("weasyprint")
    with caplog.at_level(logging.WARNING, logger="weasyprint"):
        log.warning('Using fontTools instead of HarfBuzz-Subset for font "Fell".')
        log.warning("Ignored `foo: bar` at 1:1, unknown property.")
    assert [r.getMessage() for r in caplog.records] == ["Ignored `foo: bar` at 1:1, unknown property."]
