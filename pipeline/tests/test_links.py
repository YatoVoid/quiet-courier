from courier.links import check_in_token, read_link

SECRET = "development-only-read-link-secret-not-for-production"
USER = "0b1e7c2a-3f4d-4e5a-9b6c-7d8e9f0a1b2c"


# The same values are asserted in web/lib/server/check-in.test.ts, which verifies these links.
def test_tokens_match_what_the_site_verifies():
    assert check_in_token(SECRET, USER) == "Cx58Kj9NTlqbbH2OnwobLAqekLKk-CUcV7bISQ7BOZ_Ga2"
    assert read_link("https://quietcourier.com", SECRET, USER, 3) == \
        "https://quietcourier.com/read/Cx58Kj9NTlqbbH2OnwobLAXjreaNDYUt3fCeqYdvFaxWMV"
