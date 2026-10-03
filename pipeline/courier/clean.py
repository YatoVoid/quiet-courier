import html as htmllib
import re

MEDIA_TAGS = r"figure|script|style|img-comparison-slider|audio|video|iframe|noscript|svg"
CHROME_HEADINGS = {
    "share", "details", "related terms", "downloads", "references & resources", "explore more",
    "you may also be interested in:", "discover more topics from nasa", "keep exploring",
    "related", "learn more and get involved", "media contacts", "media contact",
}
READING_TIME = re.compile(r"^\d+\s*min(?:ute)?s?\s+read$", re.I)
INLINE_CAPTION = re.compile(r"^[^.]{0,80}\. Photo(?:graph)? (?:by|via) [^.]+\. (?:Used with permission|Screenshot)[^.]*\.\s*")


def text(fragment: str) -> str:
    fragment = re.sub(r"<br\s*/?>", " ", fragment)
    fragment = re.sub(r"<[^>]+>", "", fragment)
    return re.sub(r"\s+", " ", htmllib.unescape(fragment)).strip()


def blocks(markup: str) -> list[dict]:
    markup = re.sub(rf"<({MEDIA_TAGS})\b.*?</\1>", "", markup, flags=re.S | re.I)
    markup = re.sub(r'<div class="audio-player-caption">.*?</div>', "", markup, flags=re.S)
    out = []
    for m in re.finditer(r"<(p|h2|h3|h4)([^>]*)>(.*?)</\1>", markup, flags=re.S | re.I):
        tag, attrs, inner = m.groups()
        t = text(inner)
        if not t or "caption" in attrs or READING_TIME.match(t):
            continue
        if tag.lower() != "p":
            kind = "h"
        elif "fine-print" in attrs:
            kind = "note"
        else:
            kind = "p"
        out.append({"kind": kind, "text": t})
    return out


def omitted_media(markup: str) -> list[str]:
    found = []
    if re.search(r"<(img|figure)\b", markup, re.I):
        found.append("images")
    if re.search(r"<audio\b", markup, re.I):
        found.append("audio")
    if re.search(r"<(video|iframe)\b", markup, re.I):
        found.append("video")
    return found


def changes_note(omitted: list[str], extra: list[str] = (), edited: bool = False) -> str | None:
    parts = list(omitted) + list(extra)
    if not parts:
        return None if not edited else "Text edited."
    joined = parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]
    tail = "Text otherwise unedited." if edited else "Text unedited."
    return f"{joined[0].upper()}{joined[1:]} omitted. {tail}"


def strip_inline_captions(body: list[dict]) -> bool:
    changed = False
    for b in body:
        new = INLINE_CAPTION.sub("", b["text"])
        if new != b["text"]:
            b["text"], changed = new, True
    return changed


def drop_non_latin(body: list[dict]) -> bool:
    """Drop paragraphs that are mostly CJK, Arabic, Cyrillic and so on. The print fonts are Latin-only."""
    keep = [b for b in body if _latin_share(b["text"]) >= 0.6]
    changed = len(keep) != len(body)
    body[:] = keep
    return changed


def _latin_share(s: str) -> float:
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return 1.0
    return sum(c.isascii() or "À" <= c <= "ɏ" for c in letters) / len(letters)


def trim_site_chrome(body: list[dict]) -> list[dict]:
    """Agency feeds embed navigation, share bars and contact blocks around the story."""
    start = 0
    while start < len(body) and _looks_like_nav(body[start]["text"]):
        start += 1
    out = []
    for b in body[start:]:
        t = b["text"].strip()
        if b["kind"] == "h" and (t.lower().rstrip(":") in {h.rstrip(":") for h in CHROME_HEADINGS}
                                 or t.lower().startswith(("want to ", "download", "subscribe"))):
            break
        if t.lower().startswith(("-end-", "for more information", "learn more about", "media contact")):
            break
        if re.fullmatch(r"https?://\S+", t) or re.search(r"\b\d{3}-\d{3}-\d{4}\b", t) or "@nasa.gov" in t:
            continue
        if t.startswith("@") or re.fullmatch(r"(Article|Video|Image)( \d+ \w+ ago)?", t):
            continue
        out.append(b)
    return out


def _looks_like_nav(t: str) -> bool:
    words = t.split()
    if len(words) < 6 or t.rstrip().endswith((".", "?", "!", "”", '"')):
        return False
    capitalized = sum(w[:1].isupper() or w == "&" for w in words)
    return capitalized / len(words) > 0.6


def mark_labels(body: list[dict]) -> None:
    for b in body:
        t = b["text"]
        if b["kind"] == "p" and t.endswith(":") and len(t.split()) <= 14 and not t.endswith("are:"):
            b["kind"] = "label"


def word_count(article: dict) -> int:
    return sum(len(b["text"].split()) for b in article["body"])


def mentions(article: dict, words: tuple[str, ...], opening_only: bool = True) -> bool:
    body = article["body"][:2] if opening_only else article["body"]
    hay = " ".join([article["title"], article.get("deck") or "", *(b["text"] for b in body)]).lower()
    return any(re.search(rf"\b{re.escape(w.lower())}", hay) for w in words)


# Function words only: names and loanwords appear in every language, these don't.
# Words that are also common English (a, as, die, do, en, on, un) are left out.
ENGLISH_WORDS = frozenset(
    "the and of to is that for with are was this be from at have has its their will which were been but not "
    "they it by an".split())
OTHER_WORDS = frozenset(
    "el la los las del que y para por una es se al sus como más también pero sobre fue "
    "le les et est une du dans pour qui sur pas avec sont ce cette "
    "der das und ist nicht mit dem ein eine auch sich von zu "
    "não uma em com os ao pelo pela são".split())


def is_english(article: dict, sample: int = 200) -> bool:
    text = " ".join([article["title"], article.get("deck") or "", *(b["text"] for b in article["body"])])
    words = re.findall(r"[^\W\d_]+", text.lower())[:sample]
    english = sum(w in ENGLISH_WORDS for w in words)
    other = sum(w in OTHER_WORDS for w in words)
    return english + other < 5 or english > other
