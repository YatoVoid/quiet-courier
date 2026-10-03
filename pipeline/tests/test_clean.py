from courier.clean import blocks, is_english


def test_reading_time_labels_are_dropped():
    out = blocks("<p>2 min read</p><p>3 Minutes Read</p><p>The wing glowed.</p><p>We read for 2 min read-alouds.</p>")
    assert [b["text"] for b in out] == ["The wing glowed.", "We read for 2 min read-alouds."]


def _article(title, *paragraphs):
    return {"title": title, "deck": None, "body": [{"kind": "p", "text": t} for t in paragraphs]}


def test_english_articles_pass_the_language_check():
    assert is_english(_article(
        "NASA Model Wing Lights Up During First Pressure Sensitive Paint Tests",
        "Engineers at NASA's Langley Research Center have tested a new paint that glows under light, "
        "and the results will help the agency measure pressure across the surface of a wing."))
    assert is_english(_article(
        "How a farmers' protest in Bucharest was inflated online",
        "The slogan, 'Jos guvernul, sus ţăranii,' spread from accounts that had been dormant for years, "
        "and it was picked up by pages that are run from outside the country."))


def test_non_english_articles_fail_the_language_check():
    assert not is_english(_article(
        "La NASA abre solicitudes para próxima promoción de directores de vuelo",
        "La NASA está aceptando solicitudes para su próxima clase de directores de vuelo, que se encargarán "
        "de liderar las misiones de la agencia desde el centro de control en Houston, por primera vez desde 2023."))
    assert not is_english(_article(
        "La NASA ouvre les candidatures", "Les directeurs de vol sont responsables de la sécurité de l'équipage et "
        "de la mission dans le centre de contrôle, et la sélection est ouverte pour une nouvelle promotion."))
    assert not is_english(_article(
        "Die NASA sucht Flugdirektoren", "Die Bewerbung ist ab sofort möglich, und die neuen Flugdirektoren werden "
        "sich mit dem Team in Houston um die Sicherheit der Missionen kümmern, auch bei der Mondlandung."))


def test_too_little_text_to_judge_is_kept():
    assert is_english(_article("Artemis II", "Liftoff."))
