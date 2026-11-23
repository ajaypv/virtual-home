import assert from 'node:assert/strict'
import test from 'node:test'
import { HomeError, initialHouse, isHomeId, runCommand, setDoor, setLights, setTv, youtubeVideoId } from '../src/logic.ts'

const fresh = () => initialHouse('demo-home')

test('lights, doors and the TV change a copy and bump the revision', () => {
  const start = fresh()
  let house = setLights(start, 'kitchen', false)
  house = setLights(house, 'bedroom', undefined, 30)
  house = setDoor(house, 'front', true)
  house = setTv(house, true, 'https://youtu.be/aqz-KE-bpKQ')
  assert.equal(house.lights.kitchen.on, false)
  assert.deepEqual(house.lights.bedroom, { name: 'Bedroom', on: true, brightness: 30 })
  assert.equal(house.doors.front.open, true)
  assert.deepEqual(house.tv, { on: true, video_id: 'aqz-KE-bpKQ' })
  assert.equal(house.revision, 4)
  assert.equal(start.revision, 0, 'the input is never mutated')
  assert.equal(start.lights.kitchen.on, true)
})

test('invalid requests throw HomeError', () => {
  const house = fresh()
  const calls: (() => unknown)[] = [
    () => setLights(house, 'garage', true),
    () => setLights(house, 'all', undefined, 101),
    () => setLights(house, 'all', undefined, 1.5),
    () => setLights(house, 'all', true, 0),
    () => setLights(house, 'all'),
    () => setLights(house, 'all', 'yes'),
    () => setDoor(house, 'garage', true),
    () => setDoor(house, 'front', 'yes'),
    () => setTv(house, 'yes'),
    () => setTv(house, true, 'https://example.com/watch?v=M7lc1UVf-VE'),
    () => setTv(house, true, 'https://www.youtube.com/playlist?list=abc'),
  ]
  for (const call of calls) assert.throws(call, HomeError)
})

test('YouTube IDs keep their case and reject other hosts', () => {
  assert.equal(youtubeVideoId('M7lc1UVf-VE'), 'M7lc1UVf-VE')
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=M7lc1UVf-VE&t=5'), 'M7lc1UVf-VE')
  assert.equal(youtubeVideoId('https://www.youtube.com/shorts/M7lc1UVf-VE'), 'M7lc1UVf-VE')
  for (const bad of ['http://youtu.be/M7lc1UVf-VE', 'https://user@youtu.be/M7lc1UVf-VE', 'https://evil.test/embed/M7lc1UVf-VE', 'nope']) {
    assert.throws(() => youtubeVideoId(bad), HomeError)
  }
})

test('plain-English commands', () => {
  let house = fresh()
  const run = (text: string) => (house = runCommand(house, text).house)
  assert.equal(run('Turn off the kitchen lights').lights.kitchen.on, false)
  assert.equal(run('turn on all lights').lights.kitchen.on, true)
  assert.equal(run('Please set bedroom lights to 30 percent').lights.bedroom.brightness, 30)
  assert.equal(run('turn off the lights in the reading nook').lights.reading.on, false)
  assert.equal(run('open the front door').doors.front.open, true)
  assert.equal(run('turn on the TV').tv.on, true)
  assert.deepEqual(run('play https://youtu.be/aqz-KE-bpKQ on the TV').tv, { on: true, video_id: 'aqz-KE-bpKQ' })
  assert.equal(run('turn the television off').tv.on, false)
  assert.equal(runCommand(house, 'turn off all lights').reply, 'All lights off.')
  for (const bad of ['make me a sandwich', '', 'turn off the garage lights', 'play https://evil.test/x on the TV']) {
    assert.throws(() => runCommand(house, bad), HomeError)
  }
})

test('home IDs are short, lowercase and URL-safe', () => {
  for (const ok of ['abc', 'my-home', 'a1b2c3d4e5', 'x'.repeat(32)]) assert.ok(isHomeId(ok), ok)
  for (const bad of ['ab', '-abc', 'abc-', 'ABC', 'my home', 'a/b', '../x', 'x'.repeat(33), '', 42, null]) assert.ok(!isHomeId(bad), String(bad))
})
