import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod'
import type { HomeResult } from './home.ts'
import { describe, type House } from './logic.ts'

const light = z.object({ name: z.string(), on: z.boolean(), brightness: z.number() })
const door = z.object({ name: z.string(), open: z.boolean() })
const houseShape = {
  id: z.string(),
  name: z.string(),
  revision: z.number(),
  lights: z.object({ living: light, kitchen: light, bedroom: light, reading: light }),
  doors: z.object({ front: door, bedroom: door }),
  tv: z.object({ on: z.boolean(), video_id: z.string() }),
  last_action: z.string(),
}

const INSTRUCTIONS =
  'This is one simulated 3D house with four room lights (living, kitchen, bedroom, reading), a front door, a bedroom door and a living room TV that plays YouTube. ' +
  'Nothing physical is controlled. Changes appear live for anyone viewing the home. Call get_house first if you need the current state.'

/** A fresh MCP server for one home. The handler is stateless, so the house itself lives in that home's Durable Object. */
export function createHomeServer(homeId: string, env: Env): McpServer {
  const stub = env.HOMES.get(env.HOMES.idFromName(homeId))
  const server = new McpServer({ name: 'virtual-home', version: '1.0.0' }, { instructions: INSTRUCTIONS })

  const outcome = (result: HomeResult) =>
    result.ok
      ? { structuredContent: result.house, content: [{ type: 'text' as const, text: `${result.house.last_action} ${describe(result.house)}` }] }
      : { isError: true, content: [{ type: 'text' as const, text: result.error }] }

  server.registerTool(
    'get_house',
    {
      description: 'Read the current state of this virtual house: each room light (on/off and brightness 0-100), both doors and the TV.',
      inputSchema: {},
      outputSchema: houseShape,
      annotations: { readOnlyHint: true },
    },
    async () => {
      const house: House = await stub.getState(homeId)
      return { structuredContent: house, content: [{ type: 'text' as const, text: describe(house) }] }
    },
  )

  server.registerTool(
    'set_lights',
    {
      description:
        'Turn lights on or off and/or set their brightness in one room or in the whole house. Use room "all" for every light. Brightness 0 means off; do not combine on=true with brightness 0.',
      inputSchema: {
        room: z.enum(['living', 'kitchen', 'bedroom', 'reading', 'all']).describe('Which room, or "all"'),
        on: z.boolean().optional().describe('true to switch on, false to switch off'),
        brightness: z.number().int().min(0).max(100).optional().describe('Brightness percent, 0-100'),
      },
      outputSchema: houseShape,
    },
    async ({ room, on, brightness }) => outcome(await stub.lights(homeId, room, on, brightness)),
  )

  server.registerTool(
    'set_door',
    {
      description: 'Open or close the front door or the bedroom door in the virtual house.',
      inputSchema: {
        door: z.enum(['front', 'bedroom']),
        open: z.boolean().describe('true to open, false to close'),
      },
      outputSchema: houseShape,
    },
    async ({ door: name, open }) => outcome(await stub.door(homeId, name, open)),
  )

  server.registerTool(
    'set_tv',
    {
      description:
        'Turn the living room TV on or off. Optionally pick the YouTube video to play with a user-provided HTTPS YouTube link or an exact 11-character video ID; never invent one. Playback starts muted and the viewer may need to tap to play.',
      inputSchema: {
        on: z.boolean(),
        video_url: z.string().max(200).optional().describe('YouTube link or video ID'),
      },
      outputSchema: houseShape,
    },
    async ({ on, video_url }) => outcome(await stub.tv(homeId, on, video_url)),
  )

  return server
}
