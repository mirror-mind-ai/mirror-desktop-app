//! The Mirror Desktop shell.
//!
//! Rust stays thin on purpose: window and menus, the updater, native dialogs,
//! deep links, and spawning and supervising the host process. Application
//! behavior lives in the host (Node) and the UI (React); nothing in the turn
//! hot path crosses this crate.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Mirror Desktop");
}
