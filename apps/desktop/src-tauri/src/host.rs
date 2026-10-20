//! The host process: spawned at startup, supervised for the app's lifetime.
//!
//! The shell mints a token, starts the host with it in the environment (never
//! in argv, which `ps` shows), reads the one line the host writes to stdout
//! — `{"event":"listening","port":N,...}` — and hands port and token to the
//! webview through the `host_endpoint` command and the `host-ready` event.
//! Everything after that happens between the webview and the host directly.
//!
//! A bundled app runs the host on the embedded runtime: the `mirror-node`
//! sidecar beside the executable, over the staged host in the app's
//! resources. In a checkout neither exists, and the host is
//! `node packages/host/src/main.ts` from the repository — the development
//! fallback, never chosen when the embedded runtime is present.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
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

/// Which Node runs the host, and which host.
struct HostRuntime {
    node: PathBuf,
    entry: PathBuf,
    kind: &'static str,
}

/// The embedded runtime when the bundle carries it; the checkout's otherwise.
fn resolve_runtime(app: &AppHandle) -> Result<HostRuntime, String> {
    let sidecar_name = if cfg!(windows) { "mirror-node.exe" } else { "mirror-node" };
    let sidecar = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join(sidecar_name)));
    let staged_entry = app
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("host").join("src").join("main.ts"));
    if let (Some(node), Some(entry)) = (sidecar, staged_entry) {
        if node.is_file() && entry.is_file() {
            return Ok(HostRuntime { node, entry, kind: "embedded" });
        }
    }
    let entry = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/host/src/main.ts")
        .canonicalize()
        .map_err(|_| "no embedded runtime, and no packages/host/src/main.ts beside the shell".to_string())?;
    Ok(HostRuntime { node: PathBuf::from("node"), entry, kind: "development" })
}

pub fn spawn(app: &AppHandle) -> Result<(), String> {
    let token = mint_token();
    let runtime = resolve_runtime(app)?;
    let runtime_bin = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("no app data directory: {error}"))?
        .join("runtime")
        .join("bin");
    log_line(&format!("host: {} runtime {} · {}", runtime.kind, runtime.node.display(), runtime.entry.display()));
    let mut child = Command::new(&runtime.node)
        .arg(&runtime.entry)
        .env("MIRROR_HOST_TOKEN", &token)
        .env("MIRROR_DESKTOP_RUNTIME_DIR", &runtime_bin)
        // Held open for the shell's lifetime: the host shuts down when it closes.
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| format!("could not start the host with `{} {}`: {error}", runtime.node.display(), runtime.entry.display()))?;

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
