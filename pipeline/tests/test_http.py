import http.client

from courier.http import Http


class Cut:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        raise http.client.IncompleteRead(b"{", 100)


class Whole(Cut):
    def read(self):
        return b"{}"


def test_cut_off_download_is_retried(monkeypatch):
    answers = iter([Cut(), Whole()])
    monkeypatch.setattr("urllib.request.urlopen", lambda req, timeout: next(answers))
    assert Http("test", backoff=0).json("https://example.org/x") == {}
