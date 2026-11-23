// End-to-end check for a running Worker: node scripts/smoke.mjs [base-url]
// Proves that homes are isolated, that an MCP agent's change reaches a watching page, and that bad input is rejected.
import assert from 'node:assert/strict'

const base = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const suffix = Math.random().toString(36).slice(2, 8)
const a = `smoke-a-${suffix}`
const b = `smoke-b-${suffix}`

const rest = async (id, path = '', body) => {
  const res = await fetch(`${base}/api/homes/${id}${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  return { status: res.status, body: await res.json() }
}

let nextId = 1
const mcp = async (id, method, params) => {
  const res = await fetch(`${base}/mcp/${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  })
  const text = await res.text()
  const data = text.split('\n').find((line) => line.startsWith('data:'))
  return JSON.parse(data ? data.slice(5) : text)
}

function watch(id) {
  const socket = new WebSocket(`${base.replace(/^http/, 'ws')}/api/homes/${id}/ws`)
  const messages = []
  socket.onmessage = (event) => messages.push(JSON.parse(event.data))
  return { socket, messages, ready: new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error('WebSocket failed')) }) }
}
const settle = (ms = 700) => new Promise((resolve) => setTimeout(resolve, ms))

const watcherA = watch(a)
const watcherB = watch(b)
await Promise.all([watcherA.ready, watcherB.ready])
await settle()
assert.equal(watcherA.messages.length, 1, 'a watcher gets the current house on connect')

// An agent turns off A's kitchen light through MCP.
const call = await mcp(a, 'tools/call', { name: 'set_lights', arguments: { room: 'kitchen', on: false } })
assert.equal(call.result.structuredContent.lights.kitchen.on, false)
await settle()
assert.equal(watcherA.messages.at(-1).lights.kitchen.on, false, 'the page watching A is updated live')
assert.equal(watcherB.messages.length, 1, 'a page watching B hears nothing about A')
assert.equal((await rest(b)).body.lights.kitchen.on, true, 'home B is untouched')
assert.equal((await rest(a)).body.revision, 1)

// Several writers to different homes never overwrite each other.
await Promise.all([
  rest(a, '/door', { door: 'front', open: true }),
  rest(b, '/door', { door: 'front', open: false }),
  mcp(b, 'tools/call', { name: 'set_tv', arguments: { on: true, video_url: 'https://youtu.be/aqz-KE-bpKQ' } }),
])
assert.equal((await rest(a)).body.doors.front.open, true)
assert.deepEqual((await rest(b)).body.tv, { on: true, video_id: 'aqz-KE-bpKQ' })
assert.equal((await rest(a)).body.tv.on, false)

// Bad input is refused and changes nothing.
const bad = await mcp(a, 'tools/call', { name: 'set_lights', arguments: { room: 'garage', on: true } })
assert.equal(bad.result.isError, true)
assert.equal((await rest(a, '/command', { text: 'make me a sandwich' })).status, 422)
assert.equal((await rest('Bad_ID')).status, 404)
assert.equal((await fetch(`${base}/mcp/Bad_ID`, { method: 'POST' })).status, 404)

// Deleting a home tells its watchers, resets it, and leaves other homes alone.
const closedWith = new Promise((resolve) => { watcherB.socket.onclose = (event) => resolve(event.code) })
assert.equal((await fetch(`${base}/api/homes/${b}`, { method: 'DELETE' })).status, 200)
assert.equal(await closedWith, 4000, 'a watcher of a deleted home is told')
const reset = (await rest(b)).body
assert.equal(reset.revision, 0)
assert.equal(reset.tv.on, false, 'a deleted home starts fresh')
assert.equal((await rest(a)).body.doors.front.open, true, 'home A survives the deletion of B')

watcherA.socket.close()
console.log(`OK: ${base} (homes ${a}, ${b})`)
