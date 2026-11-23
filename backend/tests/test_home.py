import pytest
from fastapi.testclient import TestClient

from app.home import Home, HomeError, youtube_video_id


@pytest.fixture
def home(tmp_path):
    return Home(tmp_path / "house.json")


def test_lights_doors_and_tv_change_and_persist(home, tmp_path):
    home.lights("kitchen", on=False)
    home.lights("bedroom", brightness=30)
    home.door("front", True)
    state = home.tv(True, "https://youtu.be/aqz-KE-bpKQ")
    assert state["lights"]["kitchen"]["on"] is False
    assert state["lights"]["bedroom"] == {"name": "Bedroom", "on": True, "brightness": 30}
    assert state["doors"]["front"]["open"] is True
    assert state["tv"] == {"on": True, "video_id": "aqz-KE-bpKQ"}
    assert state["revision"] == 4
    assert Home(tmp_path / "house.json").state() == state


def test_invalid_requests_change_nothing(home):
    before = home.state()
    for call in (
        lambda: home.lights("garage", on=True),
        lambda: home.lights("all", brightness=101),
        lambda: home.lights("all", on=True, brightness=0),
        lambda: home.lights("all"),
        lambda: home.door("garage", True),
        lambda: home.tv(True, "https://example.com/watch?v=M7lc1UVf-VE"),
        lambda: home.tv(True, "https://www.youtube.com/playlist?list=abc"),
    ):
        with pytest.raises(HomeError):
            call()
    assert home.state() == before


def test_youtube_ids_keep_their_case_and_reject_other_hosts():
    assert youtube_video_id("M7lc1UVf-VE") == "M7lc1UVf-VE"
    assert youtube_video_id("https://www.youtube.com/watch?v=M7lc1UVf-VE&t=5") == "M7lc1UVf-VE"
    assert youtube_video_id("https://www.youtube.com/shorts/M7lc1UVf-VE") == "M7lc1UVf-VE"
    for bad in ("http://youtu.be/M7lc1UVf-VE", "https://user@youtu.be/M7lc1UVf-VE", "https://evil.test/embed/M7lc1UVf-VE"):
        with pytest.raises(HomeError):
            youtube_video_id(bad)


def test_a_damaged_save_file_starts_fresh(tmp_path):
    (tmp_path / "house.json").write_text("{not json", encoding="utf-8")
    assert Home(tmp_path / "house.json").state()["revision"] == 0


def test_plain_english_commands(home):
    assert home.command("Turn off the kitchen lights")["house"]["lights"]["kitchen"]["on"] is False
    assert home.command("turn on all lights")["house"]["lights"]["kitchen"]["on"] is True
    assert home.command("Please set bedroom lights to 30 percent")["house"]["lights"]["bedroom"]["brightness"] == 30
    assert home.command("turn off the lights in the reading nook")["house"]["lights"]["reading"]["on"] is False
    assert home.command("open the front door")["house"]["doors"]["front"]["open"] is True
    assert home.command("turn on the TV")["house"]["tv"]["on"] is True
    played = home.command("play https://youtu.be/aqz-KE-bpKQ on the TV")["house"]["tv"]
    assert played == {"on": True, "video_id": "aqz-KE-bpKQ"}
    assert home.command("turn the television off")["house"]["tv"]["on"] is False
    for bad in ("make me a sandwich", "", "turn off the garage lights", "play https://evil.test/x on the TV"):
        before = home.state()
        with pytest.raises(HomeError):
            home.command(bad)
        assert home.state() == before


def test_http_api_reports_errors_as_422(monkeypatch, tmp_path):
    from app import main

    monkeypatch.setattr(main, "home", Home(tmp_path / "house.json"))
    client = TestClient(main.app)
    assert client.post("/api/house/command", json={"text": "turn off all lights"}).json()["reply"] == "All lights off."
    assert client.post("/api/house/command", json={"text": "dance"}).status_code == 422
    assert client.post("/api/house/lights", json={"room": "all", "on": False}).json()["lights"]["living"]["on"] is False
    bad = client.post("/api/house/lights", json={"room": "garage", "on": True})
    assert bad.status_code == 422 and "Unknown room" in bad.json()["detail"]
    assert client.post("/api/house/tv", json={"on": "yes"}).status_code == 422
    assert client.get("/api/house").json()["revision"] == 2
