import { DurableObject } from 'cloudflare:workers'
import { HomeError, initialHouse, runCommand, setDoor, setLights, setTv, type House } from './logic.ts'

export type HomeResult = { ok: true; house: House; reply: string } | { ok: false; error: string }

// A home nobody has changed for this long is deleted, so abandoned test homes do not pile up.
const IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** One virtual home. Each home ID maps to its own instance, so people testing at the same time never touch each other's house.
 *  Methods return a result instead of throwing: errors thrown across a Durable Object RPC call lose their class. */
export class Home extends DurableObject<Env> {
  private house: House | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Answered by the runtime without waking the object, so idle viewers cost nothing.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  private async load(id: string): Promise<House> {
    this.house ??= (await this.ctx.storage.get<House>('house')) ?? initialHouse(id)
    return this.house
  }

  private async commit(house: House): Promise<void> {
    this.house = house
    await this.ctx.storage.put('house', house)
    await this.ctx.storage.setAlarm(Date.now() + IDLE_TTL_MS)
    const message = JSON.stringify(house)
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message)
      } catch {
        // a socket that is already closing is cleaned up by webSocketClose
      }
    }
  }

  private async change(id: string, run: (house: House) => House): Promise<HomeResult> {
    try {
      const house = run(await this.load(id))
      await this.commit(house)
      return { ok: true, house, reply: house.last_action }
    } catch (error) {
      if (error instanceof HomeError) return { ok: false, error: error.message }
      throw error
    }
  }

  async getState(id: string): Promise<House> {
    return this.load(id)
  }

  lights(id: string, room: unknown, on?: unknown, brightness?: unknown) {
    return this.change(id, (house) => setLights(house, room, on, brightness))
  }

  door(id: string, door: unknown, open: unknown) {
    return this.change(id, (house) => setDoor(house, door, open))
  }

  tv(id: string, on: unknown, videoUrl?: unknown) {
    return this.change(id, (house) => setTv(house, on, videoUrl))
  }

  command(id: string, text: unknown) {
    return this.change(id, (house) => runCommand(house, text).house)
  }

  /** Delete the home: watchers are told, and the next visit starts a fresh default house. */
  async destroy(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.close(4000, 'deleted')
      } catch {
        // already closing
      }
    }
    this.house = null
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }

  /** WebSocket upgrade: the viewer gets the current house at once, then every change as it happens. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket upgrade', { status: 426 })
    const id = new URL(request.url).searchParams.get('id') ?? 'home'
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.send(JSON.stringify(await this.load(id)))
    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(): void {
    // Viewers only listen; ping/pong is handled by the auto-response.
  }

  webSocketClose(socket: WebSocket, code: number): void {
    if (code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code)) socket.close(code)
    else socket.close()
  }

  webSocketError(socket: WebSocket): void {
    socket.close()
  }

  async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length > 0) {
      // Someone is still watching: keep the home and check again later.
      await this.ctx.storage.setAlarm(Date.now() + IDLE_TTL_MS)
      return
    }
    this.house = null
    await this.ctx.storage.deleteAll()
  }
}
