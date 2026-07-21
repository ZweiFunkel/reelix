// Local-only media indexing for the desktop client. Everything here
// lives in a SQLite DB in the OS app-data directory and is never synced
// to the Reelix server — the non-sync guarantee is architectural (no
// server endpoint accepts this data), not a toggle. See plan §6.

use rusqlite::Connection;
use serde::Serialize;
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
