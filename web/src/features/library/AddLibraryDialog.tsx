import { useState } from 'react'
import { useCreateLibrary, useTriggerScan } from './hooks'
import type { LibraryType } from '../../lib/types'

export function AddLibraryDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (libraryId: number, name: string) => void }) {
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [type, setType] = useState<LibraryType>('FOLDER')
  const createLibrary = useCreateLibrary()
  const triggerScan = useTriggerScan()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const lib = await createLibrary.mutateAsync({ name, rootPath, type })
    if (lib?.id != null) {
      await triggerScan.mutateAsync(lib.id)
      onCreated(lib.id, lib.name ?? name)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <form
        onSubmit={submit}
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 w-full max-w-md flex flex-col gap-4"
      >
        <h2 className="text-lg font-medium">Add library</h2>

        <label className="flex flex-col gap-1 text-sm text-neutral-400">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Filme"
            className="bg-neutral-800 rounded px-3 py-2 text-neutral-100 outline-none focus:ring-1 focus:ring-red-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-400">
          {type === 'M3U' ? 'Playlist path or URL' : 'Root path (on the server)'}
          <input
            required
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            placeholder={type === 'M3U' ? 'https://provider.example/playlist.m3u8' : '/media/filme'}
            className="bg-neutral-800 rounded px-3 py-2 text-neutral-100 outline-none focus:ring-1 focus:ring-red-500 font-mono text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-400">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LibraryType)}
            className="bg-neutral-800 rounded px-3 py-2 text-neutral-100 outline-none focus:ring-1 focus:ring-red-500"
          >
            <option value="FOLDER">Folder (movies/series)</option>
            <option value="PHOTO">Photos</option>
            <option value="M3U">M3U/IPTV playlist</option>
          </select>
        </label>

        {createLibrary.isError && (
          <p className="text-sm text-red-400">{(createLibrary.error as Error).message}</p>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createLibrary.isPending || triggerScan.isPending}
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 font-medium"
          >
            {createLibrary.isPending || triggerScan.isPending ? 'Adding…' : 'Add & scan'}
          </button>
        </div>
      </form>
    </div>
  )
}
