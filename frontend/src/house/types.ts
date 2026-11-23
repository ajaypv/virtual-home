export type HouseRoom = 'living' | 'kitchen' | 'bedroom' | 'reading'
export type HouseDoor = 'front' | 'bedroom'
export type HouseView = HouseRoom | 'all' | 'tv'

export interface HouseState {
  id: string
  name: string
  revision: number
  lights: Record<HouseRoom, { name: string; on: boolean; brightness: number }>
  doors: Record<HouseDoor, { name: string; open: boolean }>
  tv: { on: boolean; video_id: string }
  last_action: string
}

export const HOUSE_ROOMS: HouseRoom[] = ['living', 'kitchen', 'bedroom', 'reading']
export const HOUSE_DOORS: HouseDoor[] = ['front', 'bedroom']
