from courier.clean import blocks


def test_reading_time_labels_are_dropped():
    out = blocks("<p>2 min read</p><p>3 Minutes Read</p><p>The wing glowed.</p><p>We read for 2 min read-alouds.</p>")
    assert [b["text"] for b in out] == ["The wing glowed.", "We read for 2 min read-alouds."]
