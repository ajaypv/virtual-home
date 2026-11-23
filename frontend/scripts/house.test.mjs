import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { youtubeEmbedUrl } from '../src/house/youtube.ts'

test('downloaded models retain source hashes and the nodes used for light and door animation', () => {
  const read = (name, hash) => {
    const data = readFileSync(new URL(`../public/models/cozy-home/${name}.glb`, import.meta.url))
    assert.equal(createHash('sha256').update(data).digest('hex'), hash)
    assert.equal(data.readUInt32LE(0), 0x46546c67)
    assert.equal(data.readUInt32LE(4), 2)
    return JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString())
  }
  const house = read('house', '2c1086a40368a682b0b200a33430cefbc7e2f601399bad748640a803b9661d32')
  const door = read('door', 'fff3e4b02fd7a974ef911e10f5281be474c050a1d2411287cf987a9d13d117e5')
  const tv = read('tv', '97b7c64b19eb9dd89d4daa3ad0fc4c781083046385cb8858e35a02821caa0632')
  read('tv-unit', 'b7806eae5cca268dad17ea5925a8331da90879c8db26b4df9a33704fd9701a5f')
  assert.ok(tv.nodes.some((n) => n.name === 'tv_1'))
  for (const name of ['033-floor-lamp', '046-table-lamp']) assert.ok(house.nodes.some((n) => n.name === name))
  for (const name of ['door', 'door-glass', 'door-mustard']) assert.ok(door.nodes.some((n) => n.name === name))
  assert.ok(house.buffers.every((buffer) => !buffer.uri))
  assert.ok(door.buffers.every((buffer) => !buffer.uri))
})

test('TV embeds use only validated video IDs and start muted with native controls', () => {
  const url = new URL(youtubeEmbedUrl('M7lc1UVf-VE'))
  assert.equal(url.origin, 'https://www.youtube-nocookie.com')
  assert.equal(url.pathname, '/embed/M7lc1UVf-VE')
  assert.equal(url.searchParams.get('autoplay'), '1')
  assert.equal(url.searchParams.get('mute'), '1')
  for (const invalid of ['bad', '../anything?', 'M7lc1UVf-VE?autoplay=0', 'https://example.com']) {
    assert.throws(() => youtubeEmbedUrl(invalid))
  }
})
