# Virtual home

A furnished, interactive 3D house in the browser. Turn lights on and off or dim them, open and close doors, and put a YouTube video on the living room TV. Everything is simulated: no physical device is ever controlled.

- **3D house**: a two-storey cutaway home built with Three.js. Drag to orbit, scroll or pinch to zoom, and pick a room to focus the camera.
- **Lights**: four rooms (living room, kitchen, bedroom, reading nook) with on/off and brightness.
- **Doors**: front and bedroom doors that swing open and shut.
- **TV**: a YouTube video plays on the 3D TV screen. **Watch TV** moves the camera in front of it.
- **Saved state**: the house is stored in `backend/data/house.json` and survives restarts.

## Run

Backend (needs [uv](https://docs.astral.sh/uv/)):

```bash
cd backend
uv sync
uv run uvicorn app.main:app --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5190. Set `HOME_API` to point the dev server at a backend on another address, and `HOME_DATA_FILE` to move the saved state.

Tests: `cd backend && uv run pytest` and `cd frontend && npm test`.

## Ask the house in plain English

Type into the **Ask the house** box, or call the API. No AI key is needed; requests are matched by rules, and anything it does not understand is rejected without changing the house.

- "Turn off the kitchen lights", "turn on all lights", "turn off the lights in the reading nook"
- "Set bedroom lights to 30 percent"
- "Open the front door", "close the bedroom door"
- "Turn on the TV", "turn off the television", "play https://youtu.be/M7lc1UVf-VE on the TV"

```bash
curl -X POST localhost:5190/api/house/command -H "Content-Type: application/json" -d '{"text":"turn off the kitchen lights"}'
```

## Control it from anything

The page polls the backend every second, so any client that calls the API changes the house you are looking at, for example an AI agent or a script.

| Request | Body |
|---|---|
| `GET /api/house` | none |
| `POST /api/house/command` | `{"text": "turn off the kitchen lights"}` |
| `POST /api/house/lights` | `{"room": "kitchen", "on": false}` or `{"room": "all", "brightness": 30}` |
| `POST /api/house/door` | `{"door": "front", "open": true}` |
| `POST /api/house/tv` | `{"on": true, "video_url": "https://youtu.be/M7lc1UVf-VE"}` |

Rooms are `living`, `kitchen`, `bedroom`, `reading` or `all`; doors are `front` and `bedroom`. Invalid requests return `422` with a message and change nothing.

```bash
curl -X POST localhost:5190/api/house/lights -H "Content-Type: application/json" -d '{"room":"all","on":false}'
```

## Notes

- The TV embeds YouTube's own player (privacy-enhanced domain, muted autoplay). It needs internet access, loads only while the TV is on, and does not download video. Browsers may need a tap to play or unmute, and some videos do not allow embedding. A browser without H.264/VP9 support shows a black player; use a regular Chrome, Edge, Firefox or Safari.
- There is no sign-in. Anyone who can reach the backend can change the house, so keep it on a trusted network.
- WebGL is required.

## Credits

The house, door, TV and cabinet models are unchanged CC0 downloads from [Cozy Home Interiors by 3D Assets](https://3dassets.dev/packs/cozy-home-interiors). Sources, hashes and license are in [`frontend/public/models/cozy-home`](frontend/public/models/cozy-home).

This was extracted from [Aangan](https://github.com/ajaypv/aangan), where an AI assistant controls the same house by voice and chat.
