mod commands;

use commands::local_files::{
    add_local_playlist, add_local_root, list_local_category_contents, list_local_playlists,
    list_local_root_contents, list_local_roots, list_m3u_files_in_folder, list_playlist_channels,
    pick_local_folders, pick_local_m3u_file, pick_local_m3u_folder, read_local_text_file,
    remove_local_playlist, remove_local_root, rescan_local_root,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_local_folders,
            add_local_root,
            list_local_roots,
            rescan_local_root,
            remove_local_root,
            list_local_root_contents,
            list_local_category_contents,
            pick_local_m3u_file,
            pick_local_m3u_folder,
            list_m3u_files_in_folder,
            read_local_text_file,
            add_local_playlist,
            list_local_playlists,
            list_playlist_channels,
            remove_local_playlist,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
