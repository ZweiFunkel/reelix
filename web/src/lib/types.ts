import type { components } from './api-types'

export type Library = components['schemas']['Library']
export type Category = components['schemas']['Category']
export type MediaItem = components['schemas']['MediaItem']
export type CategoryChildren = components['schemas']['CategoryChildren']
export type LibraryType = 'FOLDER' | 'PHOTO' | 'M3U'
export type User = components['schemas']['User']
export type Profile = components['schemas']['Profile']
export type MeResponse = components['schemas']['MeResponse']
