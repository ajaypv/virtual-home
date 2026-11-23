import { createMcpHandler } from 'agents/mcp/server'
import { createHomeServer } from './mcp.ts'
import { isHomeId } from './logic.ts'

export { Home } from './home.ts'

const MAX_BODY = 4096
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  const text = await request.text()
  if (text.length > MAX_BODY) return json({ detail: 'Request too large.' }, 413)
  try {
    const body: unknown = JSON.parse(text)
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>
  } catch {
    // reported below
  }
  return json({ detail: 'Send a JSON object.' }, 400)
}

async function homeApi(request: Request, env: Env, id: string, action: string): Promise<Response> {
  const stub = env.HOMES.get(env.HOMES.idFromName(id))
  if (action === 'ws') {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ detail: 'Expected a WebSocket upgrade.' }, 426)
    return stub.fetch(`https://home.internal/ws?id=${encodeURIComponent(id)}`, request)
  }
  if (action === '') {
    if (request.method !== 'GET') return json({ detail: 'Method not allowed.' }, 405)
    return json(await stub.getState(id))
  }
  if (request.method !== 'POST') return json({ detail: 'Method not allowed.' }, 405)
  const body = await readBody(request)
  if (body instanceof Response) return body
  let result
  switch (action) {
    case 'lights': result = await stub.lights(id, body.room, body.on, body.brightness); break
    case 'door': result = await stub.door(id, body.door, body.open); break
    case 'tv': result = await stub.tv(id, body.on, body.video_url); break
    case 'command': result = await stub.command(id, body.text); break
    default: return json({ detail: 'Not found.' }, 404)
  }
  if (!result.ok) return json({ detail: result.error }, 422)
  return json(action === 'command' ? { reply: result.reply, house: result.house } : result.house)
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)

    if (parts[0] === 'mcp') {
      const id = parts[1]
      if (!isHomeId(id) || parts.length > 2) {
        return json({ detail: 'Connect to /mcp/YOUR-HOME-ID, where the ID is 3-32 lowercase letters, digits or hyphens.' }, 404)
      }
      // Stateless: a fresh server per request, bound to this home. The route is this home's own path.
      return createMcpHandler(() => createHomeServer(id, env), { route: `/mcp/${id}` })(request, env, ctx)
    }

    if (parts[0] === 'api') {
      const id = parts[2]
      if (parts[1] !== 'homes' || !isHomeId(id) || parts.length > 4) return json({ detail: 'Not found.' }, 404)
      return homeApi(request, env, id, parts[3] ?? '')
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
