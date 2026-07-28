import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The Android build has no equivalent of Tauri's getVersion(), but its
// update check still needs to know what version it is. tauri.conf.json
// is the single place the release version is bumped, so read it from
// there at build time rather than keeping a second copy in sync by hand.
const appVersion = JSON.parse(readFileSync('../desktop/src-tauri/tauri.conf.json', 'utf8')).version

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
