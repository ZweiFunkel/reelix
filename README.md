# Reelix

Eigenständiger, selbstgehosteter Media-Server (Jellyfin/Netflix-Alternative) — Teil des NOVEX Labs Produktportfolios, aber eigenständig vermarktet über die Firmenwebsite.

## Vision

- Läuft überall: Linux-Server (Backend), Web-Client, native Apps für Mac/Windows/Android — Ziel u. a. Veröffentlichung im Play Store.
- Sehr modernes UI/UX, Anspruch: "wie Netflix, eher noch besser".
- Kernidee Bibliotheksstruktur: Nutzer legt auf dem Server Basisordner an (z. B. `Filme`, `Serien`). Jeder Unterordner darunter wird automatisch zu einer eigenen Kategorie — keine manuelle Kategorisierung nötig, rein durch Ordnerstruktur.
- Lokale Ergänzung: Client (Mac/PC) kann zusätzlich lokale Dateien einbinden, die nur lokal angezeigt/genutzt werden (nicht zwingend auf dem Server).
- Volle Format-Offenheit, explizit inkl. **M3U-Playlists** (IPTV-Nutzung auf bestimmten Geräten).
- **Eigene Foto-Bibliothek** als dritter Content-Typ (neben Filme/Serien und M3U) — eigene Browse-Ansicht, EXIF, Thumbnails, Alben = Ordner, analog zur Video-Bibliothek.
- Installation: geführtes Konsolen-Skript auf dem Linux-Server übernimmt die Infrastruktur (Docker, Pfade, Port); die eigentliche Einrichtung (Admin-Account, Bibliotheken) passiert danach komplett über die Web-UI.
- Monetarisierung: Kernprodukt/Software bleibt quasi Open-Source-artig nutzbar, optionales Abo (z. B. ~5€) für Zusatzservice/Komfortfunktionen — noch zu definieren, welche Features hinter das Abo wandern.

## Architektur (entschieden, siehe vollständigen Plan)

Zwei Teile: **Reelix Core** (dieses Repo — Go-Server + React/TS-Frontend, komplett eigenständig, keine Abhängigkeit zu NOVEX-Labs-Servern) und **Reelix Cloud** (dünnes Modul im bestehenden novex-labs-Monolithen, nur für Lizenzcheck/Remote-Access-Relay/Sync — später, Phase 5).

- **Server**: Go (`chi` Router, `modernc.org/sqlite`, `golang-migrate`), SQLite als Default-DB (wie Jellyfin/Plex), ffmpeg direkt via `exec.CommandContext` für Direct-Play/HLS-Transcoding.
- **Frontend**: eine React+TypeScript+Vite+Tailwind-Codebasis, geteilt über Web, Capacitor (Android/Play-Store) und Tauri (Mac/Windows-Desktop inkl. lokaler Dateien).
- **Verteilung**: ein Docker-Image (Go-Binary embedded das gebaute Frontend via `embed.FS`), Multi-Arch (amd64/arm64) für NAS/Raspberry Pi.
- **In-App-Updates**: Admin kann Updates direkt aus der App anstoßen (nicht nur via `docker pull`/Linux-Paketmanager) — Binary-Installation self-updated sich selbst, Docker-Installation nutzt einen optionalen Updater-Sidecar mit Docker-Socket-Zugriff (nicht der Hauptcontainer selbst).

Vollständiger Architektur-Plan (Datenmodell, Scan-Algorithmus, Streaming-Pipeline, Roadmap): `C:\Users\simon\.claude\plans\shiny-yawning-brook.md`

## Status

**Phase 0-5 (Foundations, MVP, Multi-User/Auth, Foto-Bibliothek, M3U/IPTV, Desktop/Mobile-Shells) abgeschlossen** und Ende-zu-Ende verifiziert:

```
server/    Go-Modul: cmd/reelix-server, internal/{api,auth,config,db,library,m3u,stream,webui}
web/       React+TS+Vite+Tailwind, TanStack Query, hls.js, generierter API-Client aus shared/openapi/
shared/    OpenAPI-Spec (Single Source of Truth für Go- und TS-Typen)
Dockerfile, deploy/docker-compose.example.yml, deploy/install.sh  (geschrieben, syntaktisch geprüft, aber noch nicht auf echtem Docker getestet — kein Docker auf diesem Rechner; Test folgt auf dem echten Linux-Server)
```

**Phase 1 MVP — verifiziert mit echten Testvideos (synthetische mp4/mkv, ffmpeg-generiert):**
- Library anlegen (Web-UI + API), Ordner-Scan → beliebig tiefer Kategorie-Baum spiegelt exakt die Ordnerstruktur.
- Root-Dateien (ohne Unterordner) korrekt als Library-Root-Items browsebar.
- Move-Detection bestätigt: Datei umbenannt + Rescan → gleiche `MediaItem.id` bleibt erhalten (Watch-History-sicher).
- Soft-Delete bestätigt: Datei gelöscht + Rescan → verschwindet aus der Browse-Ansicht.
- Direct-Play (mp4) mit echtem HTTP-Range-Support (206 Partial Content) verifiziert.
- Transcode-Pfad (mkv) verifiziert: ffmpeg erzeugt HLS-Segmente, im Browser via hls.js erfolgreich abgespielt (readyState 4, korrekte Dauer/Auflösung).
- Web-UI (Library-Liste → Breadcrumb-Browsing → Grid mit Kategorie-/Titel-Kacheln → Player) manuell im Browser durchklickt.

**Phase 2 Multi-User/Auth — verifiziert:**
- Web-basierter First-Run-Wizard (Admin-Account erstellen) → Login → "Who's watching"-Profilauswahl → Browsen/Abspielen, komplett im Browser durchgeklickt.
- Argon2id-Passwort-/PIN-Hashing, Session-Cookies (SQLite-backed), RBAC (`RequireAuth`/`RequireAdmin`/`RequireProfile`) serverseitig verifiziert (401/403 korrekt bei fehlendem Login/Profil/Admin-Rechten).
- Kind-Profil mit PIN-Schutz getestet: falsche PIN → Fehlermeldung im UI (nach Bugfix, siehe unten), richtige PIN → Zugriff.
- Watch-Progress-Tracking verifiziert: Position/Dauer/Watched-Flag persistiert pro Profil und taucht korrekt in Browse-/Detail-Antworten wieder auf.
- **Zwei echte Bugs beim Testen gefunden und behoben:** (1) Frontend zeigte API-Fehlermeldungen nie an, weil openapi-fetch den rohen `{error: string}`-Body durchreicht statt einer echten `Error` — zentraler `unwrap()`-Helper in `lib/api.ts` behebt das für alle Hooks. (2) Kind-Profile erbten Admin-Rechte vom übergeordneten Account (RBAC prüfte nur die Rolle des Users, nicht ob das aktive Profil ein Kind-Profil ist) UND gleichzeitig konnten Nicht-Admin-Profile die Library-Liste gar nicht abrufen (das komplette `/api/libraries`-Set war admin-only, auch das reine Auflisten) — beides gefixt: `RequireAdmin` prüft jetzt zusätzlich das aktive Profil, Auflisten ist jetzt `RequireProfile`, nur Anlegen/Scannen bleibt `RequireAdmin`.

**Phase 3 Foto-Bibliothek — verifiziert mit echten Testbildern (ffmpeg-generierte jpg/png + eine absichtlich kaputte .heic-Datei):**
- `PHOTO`-Bibliothekstyp nutzt exakt dieselbe Ordner-Scan/Kategorie-Baum-Engine wie Video — Alben = Ordner, beliebig tief verschachtelt, gleiches Move-/Soft-Delete-Verhalten.
- EXIF-Extraktion (`goexif`) und Thumbnail-Generierung (`golang.org/x/image`, Downscale auf 480px, JPEG-Encode) verifiziert: echte Bilder bekommen ein Thumbnail unter `/config/thumbnails/{id}.jpg`, die kaputte .heic-Datei wird korrekt indiziert, aber ohne Thumbnail (404) — kein Scan-Abbruch bei undekodierbaren Formaten.
- Web-UI: Foto-Kacheln zeigen echte Thumbnails (mit Fallback-Icon bei 404), Klick öffnet eine Lightbox mit dem Originalbild in voller Auflösung über den bestehenden `/stream`-Endpoint (Fotos werden nie transkodiert, nur direkt ausgeliefert) — im Browser bis zum fertig geladenen Bild durchgeklickt.

**Phase 4 M3U/IPTV — verifiziert mit einer echten Playlist (lokale Datei, Kanäle zeigen auf Apples öffentlichen HLS-Teststream):**
- `M3U`-Bibliothekstyp: Parser (`internal/m3u`) liest lokale Dateien oder HTTP(S)-URLs, `#EXTINF`-Attribute (`group-title`, `tvg-id`, `tvg-logo`) werden korrekt extrahiert.
- `group-title` wird zu einer echten Category (genau wie ein Ordner bei Video/Foto) — Kanäle ohne Gruppe landen als Root-Items, exakt dasselbe Browse-API-Verhalten wie bei Ordner-Bibliotheken (ein Code-Pfad für alle drei Quellentypen, per einheitlichem `itemType`-Feld in der DTO).
- Streaming: Kanal-Anfrage liefert einen 302-Redirect auf die externe Stream-URL (kein Transcoding, kein Proxy in v1) — im Browser bis zur tatsächlichen Live-Wiedergabe verifiziert (hls.js lud echte Segmente von Apples CDN, `readyState 4`, korrekte 1280×720-Auflösung, keine Fehler).
- Web-UI: M3U-Option in "Add library" aktiv, Kanal-Kacheln mit "LIVE"-Badge statt Laufzeit-Anzeige.

**Phase 5 Desktop/Mobile-Shells — verifiziert:**
- Toolchains installiert: Rust+MSVC-Build-Tools (Tauri), JDK 21+Android SDK/Gradle (Capacitor).
- `desktop/`: Tauri-2-App, embedded `web/dist`, `identifier` = `com.novexlabs.reelix`. Release-Build (`cargo build --release`) erfolgreich, Prozess gestartet und verifiziert (Fenstertitel "Reelix", `Responding: True`).
- Lokale Dateien: Rust-Commands (`pick_local_folders`, `add_local_root`, `list_local_root_contents`, `list_local_category_contents`) mit eigenem SQLite-Index im OS-App-Data-Verzeichnis (`rusqlite`, bundled) — spiegelt die Server-Scan-Logik (Ordner→Kategorie, Datei→Item), aber bewusst einfacher (kein Generations-/Move-Tracking, da manuell angestoßene, kleine private Ordner). Nichts davon läuft über einen Server-Endpoint — die Nicht-Sync-Garantie ist strukturell, nicht nur eine Einstellung.
- `mobile/`: Capacitor-Android-Projekt, `cap add android` + Gradle-Debug-Build erfolgreich (`app-debug.apk`), Package/Label per `aapt dump badging` verifiziert (`com.novexlabs.reelix`, "Reelix", `INTERNET`-Permission).
- **Echte Architektur-Lücke beim Bauen gefunden und gefixt:** Web/Desktop/Mobile teilen sich einen Frontend-Build, aber Tauri/Capacitor laden ihn von einem lokalen Asset-Origin, nicht vom eigentlichen Reelix-Server — relative `fetch('/api/...')`-Calls hätten dort ins Leere gelaufen. Gefixt mit `lib/platform.ts` (Native-Shell-Erkennung via `window.__TAURI__`/`window.Capacitor`, Server-URL in `localStorage`) + einer `ServerConnectPage`, die auf beiden nativen Shells vor Setup/Login erscheint, plus `credentials:'include'` im API-Client für den Cross-Origin-Cookie-Fall.

**Phase 6 Reelix Cloud — gebaut im NOVEX-Labs-Monolith (anderes Repo), compile-verifiziert:**
- Layout an bestehende Konvention angepasst (nicht wie ursprünglich geplant eigenes `com.streamercards.reelix`-Package — der Monolith ist flach nach Schicht organisiert, Klassen tragen nur `Reelix*`-Präfix, wie bei allen anderen Produkten auch).
- Neu: `model/ReelixInstance.java` (owner, instanceId, licenseStatus FREE/ACTIVE/EXPIRED, lastSeenAt), `model/ReelixWatchStateSync.java` (owner, externalItemId, position, watched, updatedAt — last-write-wins), passende Repositories, `controller/ReelixController.java` (`POST /api/reelix/license/validate`, `GET`+`POST /api/reelix/sync/watchstate`), genau nach dem `Authentication`/`getAuthUser`-Muster von `ShareSplitController`.
- `SecurityConfig`: `/api/reelix/**` → `authenticated()` (gleiche Zeilenform wie Helix). `AppProductSeeder`: Reelix-Kachel ergänzt (🎬, Route `/reelix`) — **Achtung:** der Seeder überspringt komplett, wenn irgendein aktives Produkt schon existiert, läuft also auf bereits geseedeten DBs (lokal/prod) nicht erneut; Zeile muss dort manuell nachgetragen werden. `R2StorageService.PRODUCT_CATEGORIES`: `"reelix" → ["artwork"]` ergänzt.
- **Echte Erkenntnis beim Recherchieren:** Es gibt in diesem Monolithen gar keine echte Zahlungs-Gateway-Integration — ShareSplit/Spliiit ist komplett manuelles Tracking (freitextiges `method`-Feld, keine echte Abbuchung). "Spliiit-Billing wiederverwenden" heißt also: dasselbe manuelle Tracking-Muster übernehmen, nicht eine bestehende Zahlungsanbindung anzapfen, die es nicht gibt. Echtes automatisches Abbuchen für das €5-Abo baue ich bewusst nicht — dafür fehlt die Gateway-Anbindung komplett, und Geldbewegungen sind ohnehin außerhalb dessen, was ich autonom umsetze.
- Bewusst nicht gebaut (laut Plan explizit letzter, riskantester Teilschritt): Relay-Daemon + `ReelixRelayAuthController` für Port-forwarding-freien Fernzugriff.

Noch offen: Docker-Build + install.sh auf dem Ziel-Server verifizieren. Bewusst nicht in v1: geplante automatische Playlist-Aktualisierung (nur manueller Rescan), CORS-Proxy für Kanäle mit restriktiven Cross-Origin-Headern, Installer-Bundling für Desktop (NSIS/WiX/Codesigning fehlen noch), Play-Store-Signierung, Reelix-Relay-Daemon, echte Zahlungsanbindung für das Abo. **Bekannte Einschränkung:** Cookie-basierte Session-Auth über native Shells hinweg funktioniert nur zuverlässig, wenn der Server per HTTPS mit passenden CORS-Headern erreichbar ist — ein Token-basierter Auth-Modus für native Clients wäre ein sauberer Fix, aber bewusst nicht Teil dieser Phase (eigene sicherheitsrelevante Design-Entscheidung).
