from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, StrictBool, StrictInt

from .home import Home, HomeError

app = FastAPI(title="Virtual home")
home = Home()


class Lights(BaseModel):
    room: str
    on: StrictBool | None = None
    brightness: StrictInt | None = None


class Door(BaseModel):
    door: str
    open: StrictBool


class Tv(BaseModel):
    on: StrictBool
    video_url: str | None = None


class Command(BaseModel):
    text: str = Field(max_length=300)


def _run(action, *args, **kwargs) -> dict:
    try:
        return action(*args, **kwargs)
    except HomeError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/house")
def get_house():
    return home.state()


@app.post("/api/house/lights")
def set_lights(body: Lights):
    return _run(home.lights, body.room, body.on, body.brightness)


@app.post("/api/house/door")
def set_door(body: Door):
    return _run(home.door, body.door, body.open)


@app.post("/api/house/tv")
def set_tv(body: Tv):
    return _run(home.tv, body.on, body.video_url)


@app.post("/api/house/command")
def run_command(body: Command):
    return _run(home.command, body.text)
