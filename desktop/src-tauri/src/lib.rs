mod commands;

use commands::local_files::{
    add_local_root, list_local_category_contents, list_local_root_contents, list_local_roots,
    pick_local_folders, rescan_local_root,
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
            list_local_root_contents,
            list_local_category_contents,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
