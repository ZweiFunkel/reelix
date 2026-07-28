// Android update checking. The Tauri updater plugin is desktop-only,
// and this APK is sideloaded rather than installed from the Play Store,
// so nothing updates it automatically — without this an Android user
// has no way to even learn a new version exists.
//
// Deliberately hands the APK URL to the system browser instead of
// downloading and invoking the package installer in-app: that would
// need the REQUEST_INSTALL_PACKAGES permission and a FileProvider, and
// Play Store policy treats that permission as sensitive. The browser
// download + "tap to install" flow is what sideloaders already expect.

declare const __APP_VERSION__: string

const RELEASES_API = 'https://api.github.com/repos/ZweiFunkel/reelix/releases/latest'

export type AndroidUpdate = { version: string; apkUrl: string }

export function currentAppVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
}

// Compares dotted numeric versions (0.1.10 > 0.1.9), which a plain
// string compare gets wrong.
function isNewer(candidate: string, current: string): boolean {
  const toParts = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const a = toParts(candidate)
  const b = toParts(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

export async function checkAndroidUpdate(): Promise<AndroidUpdate | null> {
  const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub responded with ${res.status}`)

  const release = (await res.json()) as { tag_name?: string; assets?: { name: string; browser_download_url: string }[] }
  const latest = (release.tag_name ?? '').replace(/^v/, '')
  if (!latest || !isNewer(latest, currentAppVersion())) return null

  const apk = release.assets?.find((a) => a.name.endsWith('.apk'))
  if (!apk) return null

  return { version: latest, apkUrl: apk.browser_download_url }
}

export async function openAndroidUpdate(update: AndroidUpdate): Promise<void> {
  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url: update.apkUrl })
}
