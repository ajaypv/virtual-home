# Virtual home

A furnished, interactive 3D house in the browser that **AI agents can control over MCP**. Switch lights on and off or dim them, open and close doors, and play a YouTube video on the living room TV. Everything is simulated: no physical device is ever controlled.

It runs on Cloudflare Workers. There is no sign-in and no API key: open the site, create a home, and point any MCP-capable agent at it.

## How people use it

1. Open the site and choose **Create a private home** (random ID) or open a home by ID.
2. In the home, open **Connect an AI agent** and copy the MCP URL or the ready-made `claude mcp add` command.
3. Ask your agent to "turn off the kitchen lights", "open the front door" or "put on `https://youtu.be/...`". The house on screen changes live.

Each home has its own page and its own MCP endpoint:

| What | URL |
|---|---|
| Watch and control a home | `https://<your-worker>/h/<home-id>` |
| MCP server for that home | `https://<your-worker>/mcp/<home-id>` |

A home ID is 3-32 lowercase letters, digits or hyphens.

### MCP tools

| Tool | Does |
|---|---|
| `get_house` | Read lights, doors and TV |
| `set_lights` | `room` (`living`, `kitchen`, `bedroom`, `reading`, `all`), `on`, `brightness` 0-100 |
| `set_door` | `door` (`front`, `bedroom`), `open` |
| `set_tv` | `on`, optional `video_url` (HTTPS YouTube link or 11-character ID) |

Every tool declares input and output schemas, and rejects bad input without changing the house.

### Why every home has its own ID

If everyone shared one house, one tester's agent would overwrite another's. Each home ID maps to its own [Durable Object](https://developers.cloudflare.com/durable-objects/), which holds that house's state and is the only thing that can change it. Requests are serialised per home, so two agents in the same home do not race either, and homes never see each other's changes.

**There is no login, so the ID is the only protection.** Anyone who knows a home's ID can watch and control it:

- **Create a private home** generates a random 10-character ID that is hard to guess. Use it for your own tests.
- A simple ID like `demo` is shared with everyone who types it. Fine for a demo, not for private use.

A home nobody has changed for 30 days is deleted automatically.

## REST API

The same operations are available without MCP. Errors return `422` with `{"detail": "..."}` and change nothing.

| Request | Body |
|---|---|
| `GET /api/homes/<id>` | none |
| `POST /api/homes/<id>/lights` | `{"room": "kitchen", "on": false}` or `{"room": "all", "brightness": 30}` |
| `POST /api/homes/<id>/door` | `{"door": "front", "open": true}` |
| `POST /api/homes/<id>/tv` | `{"on": true, "video_url": "https://youtu.be/M7lc1UVf-VE"}` |
| `POST /api/homes/<id>/command` | `{"text": "turn off the kitchen lights"}` |
| `GET /api/homes/<id>/ws` | WebSocket: the current house on connect, then after every change |

The **Ask the house** box on the page uses `command`: plain English matched by rules, with no AI model or key.

## Run it locally

```bash
npm install
npm --prefix frontend install
npm run build      # builds the page into frontend/dist
npm run dev        # Worker + page + Durable Objects on http://localhost:8787
```

For frontend work with hot reload, keep `npm run dev` running and in another terminal run `npm run dev:ui` (http://localhost:5190, proxied to the Worker).

Checks:

```bash
npm test           # logic and model tests
npm run typecheck
npm run smoke      # end to end against a running Worker (default http://127.0.0.1:8787)
```

`npm run smoke -- https://your-worker.workers.dev` runs the same checks against a deployment: isolation between homes, an MCP change reaching a watching page live, concurrent writers, and rejected bad input.

## Deploy to Cloudflare

```bash
npx wrangler login
npm run deploy
```

The first deploy creates the `Home` Durable Object class (SQLite-backed, available on the Workers free plan) and publishes the Worker with its static assets at `https://virtual-home.<your-subdomain>.workers.dev`. Add a custom domain in the dashboard if you want one; for MCP on a custom domain, see `allowedHostnames` in the [`createMcpHandler` docs](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/).

## How it works

- `worker/src/index.ts` routes `/mcp/<id>` to a stateless [`createMcpHandler`](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/), `/api/homes/<id>` to the home, and everything else to the static page.
- `worker/src/home.ts` is the `Home` Durable Object: validated changes, persistence, and live updates to watchers over the hibernating WebSocket API (idle viewers cost nothing).
- `worker/src/logic.ts` holds the rules as pure functions, so they are unit-tested under plain Node.
- `worker/src/mcp.ts` defines the MCP tools.
- `frontend/` is the Vite + React + Three.js page.

## Notes

- This is public and unauthenticated by design. Each request to a home runs a Durable Object, so a busy public deployment uses Workers and Durable Objects quota. [Workers rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) can be added if it is abused.
- The TV embeds YouTube's own player (privacy-enhanced domain, muted autoplay). It needs internet access, loads only while the TV is on, and does not download video. Browsers may need a tap to play or unmute, and some videos do not allow embedding. A browser without H.264/VP9 support shows a black player.
- WebGL is required.

## Credits

The house, door, TV and cabinet models are unchanged CC0 downloads from [Cozy Home Interiors by 3D Assets](https://3dassets.dev/packs/cozy-home-interiors). Sources, hashes and license are in [`frontend/public/models/cozy-home`](frontend/public/models/cozy-home).

This was extracted from [Aangan](https://github.com/ajaypv/aangan), where an AI assistant controls the same house by voice and chat.
