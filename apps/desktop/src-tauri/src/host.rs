//! The host process: spawned at startup, supervised for the app's lifetime.
//!
//! The shell mints a token, starts the host with it in the environment (never
//! in argv, which `ps` shows), reads the one line the host writes to stdout
//! — `{"event":"listening","port":N,...}` — and hands port and token to the
//! webview through the `host_endpoint` command and the `host-ready` event.
//! Everything after that happens between the webview and the host directly.
//!
//! In development the host is `node packages/host/src/main.ts` from the
//! repository; a bundled app runs the embedded runtime instead (spike 2).

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use rand::RngCore;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
pub struct HostEndpoint {
    pub port: u16,
    pub token: String,
}

#[derive(Default)]
pub struct HostState {
    endpoint: Mutex<Option<HostEndpoint>>,
    child: Mutex<Option<Child>>,
}

#[derive(serde::Deserialize)]
struct ListeningLine {
    event: String,
    port: u16,
}

fn mint_token() -> String {
    let mut bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// The host entry for a development run, resolved from this crate's location in the repository.
fn development_host_entry() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/host/src/main.ts")
        .canonicalize()
        .expect("packages/host/src/main.ts exists beside the shell in a checkout")
}

pub fn spawn(app: &AppHandle) -> Result<(), String> {
    let token = mint_token();
    let entry = development_host_entry();
    let mut child = Command::new("node")
        .arg(&entry)
        .env("MIRROR_HOST_TOKEN", &token)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| format!("could not start the host with `node {}`: {error}", entry.display()))?;

    let stdout = child.stdout.take().ok_or("host stdout is unavailable")?;
    {
        let state = app.state::<HostState>();
        let mut slot = state.child.lock().map_err(|_| "host state poisoned")?;
        *slot = Some(child);
    }

    // The host announces its port once; everything else it says goes to stderr.
    let handle = app.clone();
    std::thread::spawn(move || {
        let mut line = String::new();
        if BufReader::new(stdout).read_line(&mut line).is_err() {
            log_line("host: stdout closed before it announced a port");
            return;
        }
        match serde_json::from_str::<ListeningLine>(line.trim()) {
            Ok(announced) if announced.event == "listening" => {
                let endpoint = HostEndpoint { port: announced.port, token };
                let state = handle.state::<HostState>();
                if let Ok(mut slot) = state.endpoint.lock() {
                    *slot = Some(endpoint.clone());
                }
                log_line(&format!("host: listening on 127.0.0.1:{}", endpoint.port));
                let _ = handle.emit("host-ready", endpoint);
            }
            _ => log_line(&format!("host: unexpected first line {line:?}")),
        }
    });
    Ok(())
}

/// Stop the host when the app exits. The host closes its sessions on SIGTERM,
/// which `Child::kill` does not send; a graceful stop with a bounded wait is
/// the next step once the shell owns a signal-capable supervisor.
pub fn stop(app: &AppHandle) {
    let state = app.state::<HostState>();
    let taken = state.child.lock().ok().and_then(|mut slot| slot.take());
    if let Some(mut child) = taken {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn log_line(message: &str) {
    eprintln!("{message}");
}

/// Where the host listens and the token that opens it, once the host has announced itself.
#[tauri::command]
pub fn host_endpoint(state: tauri::State<'_, HostState>) -> Option<HostEndpoint> {
    state.endpoint.lock().ok().and_then(|slot| slot.clone())
}
