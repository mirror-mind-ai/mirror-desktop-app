//! The Mirror Desktop shell.
//!
//! Rust stays thin on purpose: window and menus, the updater, native dialogs,
//! deep links, and spawning and supervising the host process. Application
//! behavior lives in the host (Node) and the UI (React); nothing in the turn
//! hot path crosses this crate.

mod host;

use tauri::RunEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(host::HostState::default())
        .invoke_handler(tauri::generate_handler![host::host_endpoint])
        .setup(|app| {
            host::spawn(&app.handle().clone())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Mirror Desktop")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                host::stop(app);
            }
        });
}
