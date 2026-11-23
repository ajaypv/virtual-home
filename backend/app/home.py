"""State and rules for the virtual house. Simulated devices only, nothing physical is ever controlled."""

import json
import os
import re
import threading
from copy import deepcopy
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOMS = {"living": "Living room", "kitchen": "Kitchen", "bedroom": "Bedroom", "reading": "Reading nook"}
DOORS = {"front": "Front door", "bedroom": "Bedroom door"}
ALIASES = {
    "living": "living", "living room": "living", "lounge": "living",
    "kitchen": "kitchen", "dining": "kitchen", "dining room": "kitchen",
    "bedroom": "bedroom", "upstairs": "bedroom", "reading": "reading", "reading nook": "reading",
    "all": "all", "house": "all", "whole house": "all",
}
DEFAULT_VIDEO_ID = "M7lc1UVf-VE"
DEFAULT_PATH = Path(__file__).resolve().parents[1] / "data" / "house.json"


class HomeError(ValueError):
    """A request the house cannot honour. The message is safe to show to the user."""


def initial_house() -> dict:
    return {
        "id": "cozy-home", "name": "Cozy home", "revision": 0,
        "lights": {key: {"name": name, "on": True, "brightness": 80} for key, name in ROOMS.items()},
        "doors": {key: {"name": name, "open": False} for key, name in DOORS.items()},
        "tv": {"on": False, "video_id": DEFAULT_VIDEO_ID},
        "last_action": "Welcome home. Change a light, a door or the TV.",
    }


def youtube_video_id(value: str) -> str:
    if not isinstance(value, str):
        raise HomeError("Use a YouTube video link or an 11-character video ID.")
    value = value.strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", value):
        return value
    try:
        url = urlsplit(value)
        valid = url.scheme == "https" and not url.username and not url.password and url.port in (None, 443)
        video_id = ""
        if valid and url.hostname in ("youtu.be", "www.youtu.be"):
            video_id = url.path.removeprefix("/")
        elif valid and url.hostname in ("youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"):
            if url.path == "/watch":
                video_id = parse_qs(url.query).get("v", [""])[0]
            elif re.fullmatch(r"/(?:embed|shorts)/[A-Za-z0-9_-]{11}", url.path):
                video_id = url.path.rsplit("/", 1)[1]
        if re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            return video_id
    except ValueError:
        pass
    raise HomeError("Use a valid HTTPS YouTube video link, not a playlist or another website.")


class Home:
    """The one house. Every change is validated first, then applied, saved and given a new revision."""

    def __init__(self, path: Path | None = None):
        self._path = path
        self._lock = threading.Lock()
        self._house = self._load()

    @property
    def path(self) -> Path:
        return self._path or Path(os.getenv("HOME_DATA_FILE", "").strip() or DEFAULT_PATH)

    def _load(self) -> dict:
        house = initial_house()
        try:
            saved = json.loads(self.path.read_text(encoding="utf-8"))
            for key in ROOMS:
                light = saved["lights"][key]
                house["lights"][key].update(on=bool(light["on"]), brightness=int(light["brightness"]))
            for key in DOORS:
                house["doors"][key]["open"] = bool(saved["doors"][key]["open"])
            house["tv"].update(on=bool(saved["tv"]["on"]), video_id=youtube_video_id(saved["tv"]["video_id"]))
            house["revision"] = int(saved["revision"])
            house["last_action"] = str(saved["last_action"])
        except (OSError, ValueError, KeyError, TypeError):
            return initial_house()  # no file yet, or one that is damaged: start fresh
        return house

    def _save(self) -> None:
        path = self.path
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_text(json.dumps(self._house, indent=1), encoding="utf-8")
        os.replace(tmp, path)

    def _done(self, message: str) -> dict:
        self._house["last_action"] = message
        self._house["revision"] += 1
        self._save()
        return deepcopy(self._house)

    def state(self) -> dict:
        with self._lock:
            return deepcopy(self._house)

    def lights(self, room: str, on: bool | None = None, brightness: int | None = None) -> dict:
        target = ALIASES.get(room.strip().lower()) if isinstance(room, str) else None
        if target is None:
            raise HomeError("Unknown room. Choose living room, kitchen, bedroom, reading nook or all.")
        if on is not None and type(on) is not bool:
            raise HomeError("on must be true or false.")
        if brightness is not None and (type(brightness) is not int or not 0 <= brightness <= 100):
            raise HomeError("Brightness must be a whole number from 0 to 100.")
        if on is None and brightness is None:
            raise HomeError("Specify on, off or a brightness.")
        if on is True and brightness == 0:
            raise HomeError("Zero brightness means off. Choose a positive brightness to turn a light on.")
        with self._lock:
            for key in (list(ROOMS) if target == "all" else [target]):
                light = self._house["lights"][key]
                if brightness is not None:
                    light["brightness"] = brightness
                    light["on"] = brightness > 0
                if on is not None:
                    light["on"] = on
                    if on and light["brightness"] == 0:
                        light["brightness"] = 80
            label = "All lights" if target == "all" else f"{ROOMS[target]} lights"
            value = f"set to {brightness}%" if brightness is not None and on is not False else ("on" if on else "off")
            return self._done(f"{label} {value}.")

    def door(self, door: str, open: bool) -> dict:
        if door not in DOORS:
            raise HomeError("Choose the front door or bedroom door.")
        if type(open) is not bool:
            raise HomeError("open must be true or false.")
        with self._lock:
            self._house["doors"][door]["open"] = open
            return self._done(f"{DOORS[door]} {'opened' if open else 'closed'}.")

    def tv(self, on: bool, video_url: str | None = None) -> dict:
        if type(on) is not bool:
            raise HomeError("on must be true or false.")
        video_id = youtube_video_id(video_url) if video_url is not None else None
        with self._lock:
            if video_id is not None:
                self._house["tv"]["video_id"] = video_id
            self._house["tv"]["on"] = on
            return self._done("TV turned on. YouTube may need a tap to play." if on else "TV turned off.")

    def command(self, text: str) -> dict:
        """Run a plain-English request such as "turn off the kitchen lights". Returns the reply and the new state."""
        if not isinstance(text, str) or not text.strip():
            raise HomeError("Say what to change, for example: turn off the kitchen lights.")
        text = text.strip()
        low = re.sub(r"\b(please|can you|could you|would you)\b", "", text.lower()).strip(" .?!,")
        low = re.sub(r"\s+", " ", low)
        tv = r"(?:the |my |our )?(?:living room )?(?:tv|television)"
        match = re.fullmatch(rf"(?:(?:turn|switch|power)\s+)?(?P<power>on|off)\s+{tv}", low) \
            or re.fullmatch(rf"(?:(?:turn|switch|power)\s+)?{tv}\s+(?P<power>on|off)", low)
        if match:
            house = self.tv(match["power"] == "on")
            return {"reply": house["last_action"], "house": house}
        # The original text keeps the case-sensitive video ID.
        match = re.fullmatch(rf"(?:please\s+)?play\s+(?P<url>https://\S+)\s+on\s+{tv}[.!?]?", text, re.I)
        if match:
            house = self.tv(True, match["url"])
            return {"reply": house["last_action"], "house": house}
        light = r"(?:(?:the|all|all the|my|our)\s+)?(?P<room>[a-z ]*?)(?:\s+)?(?:lights?|lamps?)"
        match = re.fullmatch(rf"(?:(?:turn|switch)\s+)?(?P<power>on|off)\s+{light}", low) \
            or re.fullmatch(rf"(?:(?:turn|switch)\s+)?{light}\s+(?P<power>on|off)", low) \
            or re.fullmatch(r"(?:(?:turn|switch)\s+)?(?P<power>on|off)\s+(?:the\s+)?(?:lights?|lamps?)\s+in\s+(?:the\s+)?(?P<room>[a-z ]+)", low)
        if match:
            house = self.lights(match["room"].strip() or "all", on=match["power"] == "on")
            return {"reply": house["last_action"], "house": house}
        match = re.fullmatch(rf"(?:dim|set)\s+{light}\s+to\s+(?P<brightness>\d+)\s*(?:%|percent)", low)
        if match:
            house = self.lights(match["room"].strip() or "all", brightness=int(match["brightness"]))
            return {"reply": house["last_action"], "house": house}
        match = re.fullmatch(r"(?P<action>open|close|shut)\s+(?:the\s+)?(?P<door>front|bedroom)\s+door", low)
        if match:
            house = self.door(match["door"], match["action"] == "open")
            return {"reply": house["last_action"], "house": house}
        raise HomeError("I could not match that. Try: turn off the kitchen lights, set bedroom lights to 30 percent, open the front door, turn on the TV.")
