import type { Library } from '../lib/types'
import { isNativeShell } from '../lib/platform'
import { HomeIcon, FilmIcon, ShieldIcon, DeviceIcon } from './icons'

export type PathEntry = { libraryId: number; categoryId: number | null; label: string }
export type Page =
  | { kind: 'home' }
  | { kind: 'browse'; path: PathEntry[] }
  | { kind: 'admin' }
  | { kind: 'detail'; mediaItemId: number }
  | { kind: 'show'; anchorMediaItemId: number }
  | { kind: 'local' }

export function Sidebar({
  libraries,
  page,
  isAdmin,
  onNavigate,
}: {
  libraries: Library[] | undefined
  page: Page
  isAdmin: boolean
  onNavigate: (page: Page) => void
}) {
  const isHome = page.kind === 'home'

  return (
    <nav className="w-56 shrink-0 border-r border-neutral-900 bg-neutral-950 flex flex-col gap-1 py-6 px-3">
      <span className="text-xl font-semibold px-3 mb-6">
        Reel<span className="text-red-500">ix</span>
      </span>

      <button
        onClick={() => onNavigate({ kind: 'home' })}
        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
          isHome ? 'bg-red-600 text-white' : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
        }`}
      >
        <HomeIcon className="w-5 h-5" />
        Home
      </button>

      {isNativeShell() && (
        <button
          onClick={() => onNavigate({ kind: 'local' })}
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
            page.kind === 'local' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
          }`}
        >
          <DeviceIcon className="w-5 h-5" />
          On This Device
        </button>
      )}

      {libraries && libraries.length > 0 && (
        <div className="mt-4 flex flex-col gap-1">
          <span className="px-3 text-xs font-medium uppercase tracking-wide text-neutral-600">Libraries</span>
          {libraries.map((lib) => {
            const active = page.kind === 'browse' && page.path[0]?.libraryId === lib.id
            return (
              <button
                key={lib.id}
                onClick={() => onNavigate({ kind: 'browse', path: [{ libraryId: lib.id!, categoryId: null, label: lib.name! }] })}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active ? 'bg-red-600 text-white' : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
                }`}
              >
                <FilmIcon className="w-5 h-5" />
                <span className="truncate">{lib.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {isAdmin && (
        <button
          onClick={() => onNavigate({ kind: 'admin' })}
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors mt-auto ${
            page.kind === 'admin' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
          }`}
        >
          <ShieldIcon className="w-5 h-5" />
          Admin
        </button>
      )}
    </nav>
  )
}
