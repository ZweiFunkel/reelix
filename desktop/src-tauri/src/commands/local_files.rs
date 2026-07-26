// Local-only media indexing for the desktop client. Everything here
// lives in a SQLite DB in the OS app-data directory and is never synced
// to the Reelix server — the non-sync guarantee is architectural (no
// server endpoint accepts this data), not a toggle. See plan §6.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "avi", "mov", "webm", "m4v", "ts", "wmv", "flv", "mpg", "mpeg"];
const PHOTO_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif"];

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("local-library.db"))
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let conn = Connection::open(db_path(app)?).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS local_root (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS local_category (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            root_id INTEGER NOT NULL,
            parent_id INTEGER,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            UNIQUE (root_id, path)
        );
        CREATE TABLE IF NOT EXISTS local_item (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            root_id INTEGER NOT NULL,
            category_id INTEGER,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            media_type TEXT NOT NULL,
            UNIQUE (root_id, path)
        );
        CREATE TABLE IF NOT EXISTS local_playlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            source_path TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS local_channel (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            group_title TEXT NOT NULL DEFAULT '',
            stream_url TEXT NOT NULL,
            tvg_logo TEXT NOT NULL DEFAULT ''
        );
        ",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn media_type_for(ext: &str) -> Option<&'static str> {
    let ext = ext.to_lowercase();
    if VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        Some("video")
    } else if PHOTO_EXTENSIONS.contains(&ext.as_str()) {
        Some("photo")
    } else {
        None
    }
}

#[derive(Serialize)]
pub struct LocalRoot {
    pub id: i64,
    pub path: String,
}

#[derive(Serialize)]
pub struct LocalCategory {
    pub id: i64,
    pub name: String,
    #[serde(rename = "parentCategoryId")]
    pub parent_category_id: Option<i64>,
}

#[derive(Serialize)]
pub struct LocalItem {
    pub id: i64,
    pub title: String,
    #[serde(rename = "mediaType")]
    pub media_type: String,
    pub path: String,
}

#[derive(Serialize)]
pub struct LocalChildren {
    pub subcategories: Vec<LocalCategory>,
    pub items: Vec<LocalItem>,
}

/// Opens a native multi-folder picker. Returns an empty vec if the user
/// cancels.
#[tauri::command]
pub async fn pick_local_folders(app: AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folders(move |paths| {
        let paths = paths
            .unwrap_or_default()
            .into_iter()
            .filter_map(|p| p.into_path().ok())
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        let _ = tx.send(paths);
    });
    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_local_roots(app: AppHandle) -> Result<Vec<LocalRoot>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare("SELECT id, path FROM local_root ORDER BY id").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(LocalRoot { id: row.get(0)?, path: row.get(1)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Adds a folder as a local root and immediately scans it.
#[tauri::command]
pub fn add_local_root(app: AppHandle, path: String) -> Result<i64, String> {
    let conn = open_db(&app)?;
    conn.execute("INSERT OR IGNORE INTO local_root (path) VALUES (?1)", [&path])
        .map_err(|e| e.to_string())?;
    let root_id: i64 = conn
        .query_row("SELECT id FROM local_root WHERE path = ?1", [&path], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    scan_local_root_internal(&conn, root_id, &path)?;
    Ok(root_id)
}

#[tauri::command]
pub fn rescan_local_root(app: AppHandle, root_id: i64) -> Result<(), String> {
    let conn = open_db(&app)?;
    let path: String = conn
        .query_row("SELECT path FROM local_root WHERE id = ?1", [root_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    scan_local_root_internal(&conn, root_id, &path)
}

/// Unregisters a local root — never touches the files on disk, same
/// non-destructive contract as the server's library delete.
#[tauri::command]
pub fn remove_local_root(app: AppHandle, root_id: i64) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM local_item WHERE root_id = ?1", [root_id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM local_category WHERE root_id = ?1", [root_id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM local_root WHERE id = ?1", [root_id]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Local scans are simpler than the server's: no generation tracking or
/// move detection, just clear and re-walk. These are small, manually
/// triggered, user-owned folders, not a whole media library — the extra
/// sophistication isn't worth it here.
fn scan_local_root_internal(conn: &Connection, root_id: i64, root_path: &str) -> Result<(), String> {
    conn.execute("DELETE FROM local_item WHERE root_id = ?1", [root_id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM local_category WHERE root_id = ?1", [root_id]).map_err(|e| e.to_string())?;

    let root = PathBuf::from(root_path);
    let mut category_ids: std::collections::HashMap<String, i64> = std::collections::HashMap::new();

    for entry in walkdir::WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        let rel = match path.strip_prefix(&root) {
            Ok(r) if !r.as_os_str().is_empty() => r,
            _ => continue,
        };
        let rel_str = rel.to_string_lossy().replace('\\', "/");

        if entry.file_type().is_dir() {
            let parent_id = parent_category_id(&category_ids, &rel_str);
            let name = entry.file_name().to_string_lossy().to_string();
            conn.execute(
                "INSERT INTO local_category (root_id, parent_id, name, path) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![root_id, parent_id, name, rel_str],
            )
            .map_err(|e| e.to_string())?;
            let id = conn.last_insert_rowid();
            category_ids.insert(rel_str, id);
            continue;
        }

        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let Some(media_type) = media_type_for(ext) else { continue };
        let category_id = parent_category_id(&category_ids, &rel_str);
        let name = entry.file_name().to_string_lossy().to_string();
        conn.execute(
            "INSERT INTO local_item (root_id, category_id, name, path, media_type) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![root_id, category_id, name, rel_str, media_type],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn parent_category_id(category_ids: &std::collections::HashMap<String, i64>, rel_path: &str) -> Option<i64> {
    let parent = std::path::Path::new(rel_path).parent()?;
    if parent.as_os_str().is_empty() {
        return None;
    }
    category_ids.get(&parent.to_string_lossy().replace('\\', "/")).copied()
}

#[tauri::command]
pub fn list_local_root_contents(app: AppHandle, root_id: i64) -> Result<LocalChildren, String> {
    let conn = open_db(&app)?;
    children(&conn, root_id, None)
}

#[tauri::command]
pub fn list_local_category_contents(app: AppHandle, root_id: i64, category_id: i64) -> Result<LocalChildren, String> {
    let conn = open_db(&app)?;
    children(&conn, root_id, Some(category_id))
}

fn children(conn: &Connection, root_id: i64, category_id: Option<i64>) -> Result<LocalChildren, String> {
    let mut subcategories = Vec::new();
    let mut stmt = match category_id {
        Some(_) => conn.prepare("SELECT id, name, parent_id FROM local_category WHERE parent_id = ?1 ORDER BY name").map_err(|e| e.to_string())?,
        None => conn.prepare("SELECT id, name, parent_id FROM local_category WHERE root_id = ?1 AND parent_id IS NULL ORDER BY name").map_err(|e| e.to_string())?,
    };
    let param: i64 = category_id.unwrap_or(root_id);
    let rows = stmt
        .query_map([param], |row| {
            Ok(LocalCategory { id: row.get(0)?, name: row.get(1)?, parent_category_id: row.get(2)? })
        })
        .map_err(|e| e.to_string())?;
    for r in rows {
        subcategories.push(r.map_err(|e| e.to_string())?);
    }

    let mut items = Vec::new();
    let mut stmt = match category_id {
        Some(_) => conn.prepare("SELECT id, name, media_type, path FROM local_item WHERE category_id = ?1 ORDER BY name").map_err(|e| e.to_string())?,
        None => conn.prepare("SELECT id, name, media_type, path FROM local_item WHERE root_id = ?1 AND category_id IS NULL ORDER BY name").map_err(|e| e.to_string())?,
    };
    let rows = stmt
        .query_map([param], |row| {
            Ok(LocalItem { id: row.get(0)?, title: row.get(1)?, media_type: row.get(2)?, path: row.get(3)? })
        })
        .map_err(|e| e.to_string())?;
    for r in rows {
        items.push(r.map_err(|e| e.to_string())?);
    }

    Ok(LocalChildren { subcategories, items })
}

// --- Local M3U playlists ---
//
// Parsing itself lives in the shared TS layer (web/src/lib/m3u.ts) so
// the exact same logic runs on desktop and Android — Rust here is just
// file access (picker + read) and storage, per the "Rust stays shell
// boilerplate" rule in plan §6. A playlist works fully offline: adding
// one and browsing its channel list never touches the Reelix server;
// only playing a channel needs network, to reach that channel's own
// stream URL.

#[derive(Serialize)]
pub struct LocalPlaylist {
    pub id: i64,
    pub name: String,
    #[serde(rename = "sourcePath")]
    pub source_path: String,
}

#[derive(Serialize)]
pub struct LocalChannel {
    pub id: i64,
    pub name: String,
    #[serde(rename = "groupTitle")]
    pub group_title: String,
    #[serde(rename = "streamUrl")]
    pub stream_url: String,
    #[serde(rename = "tvgLogo")]
    pub tvg_logo: String,
}

#[derive(Deserialize)]
pub struct ChannelInput {
    pub name: String,
    #[serde(rename = "groupTitle")]
    pub group_title: String,
    #[serde(rename = "streamUrl")]
    pub stream_url: String,
    #[serde(rename = "tvgLogo")]
    pub tvg_logo: String,
}

/// Opens a native file picker filtered to M3U playlists. Returns None
/// if the user cancels.
#[tauri::command]
pub async fn pick_local_m3u_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter("M3U playlist", &["m3u", "m3u8"])
        .pick_file(move |path| {
            let _ = tx.send(path.and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().to_string()));
        });
    rx.recv().map_err(|e| e.to_string())
}

/// Generic text-file read, reused by the M3U import flow — the frontend
/// picks the file, reads its contents through this command, parses it
/// with the shared TS parser, then calls add_local_playlist with the
/// result.
#[tauri::command]
pub fn read_local_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_local_playlist(app: AppHandle, name: String, source_path: String, channels: Vec<ChannelInput>) -> Result<i64, String> {
    let conn = open_db(&app)?;
    conn.execute("INSERT INTO local_playlist (name, source_path) VALUES (?1, ?2)", rusqlite::params![name, source_path])
        .map_err(|e| e.to_string())?;
    let playlist_id = conn.last_insert_rowid();
    for ch in channels {
        conn.execute(
            "INSERT INTO local_channel (playlist_id, name, group_title, stream_url, tvg_logo) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![playlist_id, ch.name, ch.group_title, ch.stream_url, ch.tvg_logo],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(playlist_id)
}

#[tauri::command]
pub fn list_local_playlists(app: AppHandle) -> Result<Vec<LocalPlaylist>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare("SELECT id, name, source_path FROM local_playlist ORDER BY id").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(LocalPlaylist { id: row.get(0)?, name: row.get(1)?, source_path: row.get(2)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_playlist_channels(app: AppHandle, playlist_id: i64) -> Result<Vec<LocalChannel>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id, name, group_title, stream_url, tvg_logo FROM local_channel WHERE playlist_id = ?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([playlist_id], |row| {
            Ok(LocalChannel { id: row.get(0)?, name: row.get(1)?, group_title: row.get(2)?, stream_url: row.get(3)?, tvg_logo: row.get(4)? })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_local_playlist(app: AppHandle, playlist_id: i64) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM local_channel WHERE playlist_id = ?1", [playlist_id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM local_playlist WHERE id = ?1", [playlist_id]).map_err(|e| e.to_string())?;
    Ok(())
}
