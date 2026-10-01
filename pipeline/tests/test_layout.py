import pytest

from broadsheet.layout import FrontPlan, dropcap, fit_font_size, sentences, units


def _text(blocks):
    return " ".join(b.text for b in blocks)


def test_sentences_skip_abbreviations():
    s = "Dr. Ariel Deutsch spoke on Oct. 1 in the U.S. capital. A. J. Orme agreed. “Yes,” he said."
    assert sentences(s) == ["Dr. Ariel Deutsch spoke on Oct. 1 in the U.S. capital.", "A. J. Orme agreed.", "“Yes,” he said."]


def test_sentences_rejoin_to_original(edition):
    for a in edition.articles.values():
        for b in a.body:
            assert " ".join(sentences(b.text)) == b.text


@pytest.mark.parametrize("article_id", ["conv-schrodinger", "nasa-moon-base", "gv-ukraine-business"])
def test_every_jump_point_keeps_text_whole(edition, article_id):
    # CC BY-ND sources forbid edits, so a jump must not drop or change a word.
    a = edition.articles[article_id]
    for n in range(1, len(units(a)) + 1):
        split = FrontPlan({a.id: n}).split(a)
        assert _text(split.front + split.rest) == _text(a.body)
        assert split.front[-1].kind not in ("h", "label")
        if split.rest:
            assert all(b.kind != "pcont" for b in split.front)


def test_whole_story_does_not_jump(edition):
    a = edition.articles["nasa-5g"]
    split = FrontPlan({a.id: len(units(a))}).split(a)
    assert not split.jumps


def test_dropcap_escapes_and_keeps_quote():
    assert str(dropcap("“Hello <b>")) == '<span class="dropcap">“H</span>ello &lt;b&gt;'


def test_nameplate_shrinks_for_long_names():
    short = fit_font_size("The Gazette", 300, 46)
    long = fit_font_size("The Morning Placeholder of Greater Kansas City", 300, 46)
    assert short == 46
    assert long < 20
