import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The Android build has no equivalent of Tauri's getVersion(), but its
// update check still needs to know what version it is. tauri.conf.json
// is the single place the release version is bumped, so read it from
// there at build time rather than keeping a second copy in sync by hand.
//
// The server's Docker build only copies web/ into its build stage, so
// that file isn't reachable there — fall back rather than failing the
// build. The version is only consulted by the Android update check,
// which is built from a full checkout by CI, never from that image.
function readAppVersion(): string {
  try {
    return JSON.parse(readFileSync('../desktop/src-tauri/tauri.conf.json', 'utf8')).version
  } catch {
    return '0.0.0'
  }
}

const appVersion = readAppVersion()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8096',
    },
  },
})
