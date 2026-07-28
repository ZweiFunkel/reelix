import { useState } from 'react'
import type { Library } from '../lib/types'
import { isNativeShell } from '../lib/platform'
import { HomeIcon, FilmIcon, ShieldIcon, DeviceIcon } from './icons'
import type { Page } from './Sidebar'

// The phone counterpart to Sidebar: a fixed bottom tab bar, which is
// what an Android user expects and what actually fits — the sidebar's
// fixed 224px column left almost nothing for content on a phone.
// Libraries don't get their own permanent tab (there can be any number
// of them); one "Libraries" tab opens a sheet listing them instead.
export function MobileNav({
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
  const [librariesOpen, setLibrariesOpen] = useState(false)

  const go = (next: Page) => {
    setLibrariesOpen(false)
    onNavigate(next)
  }

  const tabClass = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[11px] ${
      active ? 'text-red-500' : 'text-neutral-400'
    }`

  return (
    <>
      {librariesOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/70 flex items-end" onClick={() => setLibrariesOpen(false)}>
          <div
            className="w-full max-h-[70vh] overflow-y-auto rounded-t-2xl bg-neutral-900 border-t border-neutral-800 p-4 pb-24"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 px-1 pb-2">Libraries</p>
            {(!libraries || libraries.length === 0) && <p className="text-sm text-neutral-500 px-1 py-2">No libraries yet.</p>}
            {libraries?.map((lib) => (
              <button
                key={lib.id}
                onClick={() => go({ kind: 'browse', path: [{ libraryId: lib.id!, categoryId: null, label: lib.name! }] })}
                className="w-full flex items-center gap-3 px-2 py-3 rounded-md text-sm text-neutral-200 hover:bg-neutral-800 text-left"
              >
                <FilmIcon className="w-5 h-5 text-neutral-500 shrink-0" />
                <span className="truncate">{lib.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex border-t border-neutral-800 bg-neutral-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <button onClick={() => go({ kind: 'home' })} className={tabClass(page.kind === 'home')}>
          <HomeIcon className="w-6 h-6" />
          Home
        </button>

        <button onClick={() => setLibrariesOpen((v) => !v)} className={tabClass(page.kind === 'browse' || librariesOpen)}>
          <FilmIcon className="w-6 h-6" />
          Libraries
        </button>

        {isNativeShell() && (
          <button onClick={() => go({ kind: 'local' })} className={tabClass(page.kind === 'local')}>
            <DeviceIcon className="w-6 h-6" />
            Device
          </button>
        )}

        {isAdmin && (
          <button onClick={() => go({ kind: 'admin' })} className={tabClass(page.kind === 'admin')}>
            <ShieldIcon className="w-6 h-6" />
            Admin
          </button>
        )}
      </nav>
    </>
  )
}
