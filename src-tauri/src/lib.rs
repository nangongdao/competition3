use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command as StdCommand, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

/// Host platform name for display in the UI (e.g. "macos", "linux", "windows").
#[tauri::command]
fn get_host_platform() -> String {
    std::env::consts::OS.to_string()
}

/// Execute a shell command on the host system and return combined output.
///
/// Used by the in-app terminal. In a desktop build this runs locally on the
/// user's machine; in a browser build this endpoint is not reachable and the
/// UI degrades gracefully.
#[tauri::command]
fn run_terminal_command(command: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let shell = "cmd";
    #[cfg(target_os = "windows")]
    let flag = "/C";

    #[cfg(not(target_os = "windows"))]
    let shell = "sh";
    #[cfg(not(target_os = "windows"))]
    let flag = "-c";

    let output = StdCommand::new(shell)
        .arg(flag)
        .arg(&command)
        .output()
        .map_err(|e| format!("Failed to run command: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(if stdout.is_empty() { stderr } else { stdout })
}

/// Shared state that holds the active interactive terminal child process.
///
/// The desktop terminal starts a long-lived shell (sh / cmd) and streams its
/// output back to the frontend via Tauri events. Only one interactive session
/// is supported at a time for simplicity.
///
/// The child handle is wrapped in `Arc<Mutex<...>>` so both the exit-monitor
/// thread and the command handlers can inspect it without moving ownership.
struct TerminalState {
    child: Mutex<Option<Arc<Mutex<Option<Child>>>>>,
    stdin: Mutex<Option<ChildStdin>>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            stdin: Mutex::new(None),
        }
    }
}

/// Return `true` when the shared child is still running (or unknown/error).
fn child_is_running(shared: &Mutex<Option<Child>>) -> bool {
    match shared.lock() {
        Ok(mut g) => match g.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(Some(_)) => false, // exited
                Ok(None) => true,
                Err(_) => true,
            },
            None => false,
        },
        Err(_) => false,
    }
}

/// Spawn an interactive shell for the in-app terminal.
///
/// The child process is started with a piped stdin/stdout/stderr. Output is
/// pushed to the frontend as `terminal-output` events; the process exit status
/// is pushed as a `terminal-exit` event. Input is written with
/// `write_terminal`.
///
/// Returns the current working directory of the spawned shell so the frontend
/// can render a sensible prompt context.
#[tauri::command]
fn spawn_terminal(
    app: AppHandle,
    state: State<'_, TerminalState>,
) -> Result<String, String> {
    // If a terminal is already running, do nothing but report its directory.
    let mut child_guard = state.child.lock().map_err(|e| e.to_string())?;
    if let Some(shared) = child_guard.as_ref() {
        if child_is_running(shared) {
            return Ok("already-running".to_string());
        }
    }

    #[cfg(target_os = "windows")]
    let mut child = StdCommand::new("cmd")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn shell: {e}"))?;

    #[cfg(not(target_os = "windows"))]
    let mut child = StdCommand::new("sh")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn shell: {e}"))?;

    let stdin = child.stdin.take().ok_or("Failed to open shell stdin")?;

    // Capture stdout and stderr in background threads, forwarding each line to
    // the frontend as a `terminal-output` event. This keeps the event payload
    // small and gives the UI predictable chunking for line-oriented tools.
    let stdout = child.stdout.take().ok_or("Failed to open shell stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open shell stderr")?;
    let app_out = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = match line {
                Ok(line) => line,
                Err(_) => break,
            };
            let _ = app_out.emit("terminal-output", line);
        }
    });
    let app_err = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            let line = match line {
                Ok(line) => line,
                Err(_) => break,
            };
            let _ = app_err.emit("terminal-error-output", line);
        }
    });

    // Wrap the child in Arc<Mutex> so the state, `is_terminal_running`, and the
    // exit-monitor thread can all share it without moving ownership.
    let shared_child = Arc::new(Mutex::new(Some(child)));
    let shared_for_monitor = Arc::clone(&shared_child);

    // Wait for the child to exit on a background thread and notify the UI.
    let app_exit = app.clone();
    std::thread::spawn(move || loop {
        let status = shared_for_monitor.lock().ok().and_then(|mut g| {
            g.as_mut().and_then(|c| c.try_wait().ok().flatten())
        });
        match status {
            Some(code) => {
                let _ = app_exit.emit(
                    "terminal-exit",
                    code.code().unwrap_or(-1),
                );
                break;
            }
            None => {
                std::thread::sleep(std::time::Duration::from_millis(80));
            }
        }
    });

    // Store the shared child handle for inspection / termination.
    *child_guard = Some(shared_child);

    let mut stdin_guard = state.stdin.lock().map_err(|e| e.to_string())?;
    *stdin_guard = Some(stdin);

    Ok(current_dir_label())
}

/// Write a single line of user input to the interactive terminal's stdin.
#[tauri::command]
fn write_terminal(
    state: State<'_, TerminalState>,
    input: String,
) -> Result<(), String> {
    let mut stdin_guard = state.stdin.lock().map_err(|e| e.to_string())?;
    let stdin = stdin_guard
        .as_mut()
        .ok_or("Terminal is not running — start it first")?;
    // xterm 的 onData 把 Enter 报告为 `\r`，而 shell 通过管道读到 `\n` 才会
    // 执行命令，这里把 `\r` 归一化为 `\n`，保证命令在交互模式下被正确解析。
    let normalized = input.replace('\r', "\n");
    stdin
        .write_all(normalized.as_bytes())
        .and_then(|_| stdin.flush())
        .map_err(|e| format!("Failed to write to terminal: {e}"))
}

/// Terminate the active interactive terminal process (if any).
#[tauri::command]
fn terminate_terminal(state: State<'_, TerminalState>) -> Result<(), String> {
    let child_guard = state.child.lock().map_err(|e| e.to_string())?;
    let mut stdin_guard = state.stdin.lock().map_err(|e| e.to_string())?;

    if let Some(shared) = child_guard.as_ref() {
        if let Ok(mut inner) = shared.lock() {
            if let Some(mut child) = inner.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
    drop(child_guard);
    // Clear the shared child handle so a new terminal can be spawned.
    if let Ok(mut g) = state.child.lock() {
        *g = None;
    }
    *stdin_guard = None;
    Ok(())
}

/// Return whether an interactive terminal session is currently active.
#[tauri::command]
fn is_terminal_running(state: State<'_, TerminalState>) -> bool {
    let guard = state.child.lock().ok();
    match guard.as_ref().and_then(|g| g.as_ref()) {
        Some(shared) => child_is_running(shared),
        None => false,
    }
}

/// Current working directory label shown in the terminal header.
fn current_dir_label() -> String {
    std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| ".".to_string())
}

/// Window control helpers.
#[tauri::command]
fn minimize_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("Main window not found")?
        .minimize()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn maximize_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn close_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("Main window not found")?
        .close()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_fullscreen(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    let fullscreen = window.is_fullscreen().unwrap_or(false);
    window
        .set_fullscreen(!fullscreen)
        .map_err(|e| e.to_string())
}

/// Whether the current window is maximized (for the desktop chrome indicator).
#[tauri::command]
fn is_window_maximized(app: AppHandle) -> Result<bool, String> {
    app.get_webview_window("main")
        .ok_or("Main window not found")
        .map(|w| w.is_maximized().unwrap_or(false))
        .map_err(|e| e.to_string())
}

/// System information for the desktop status bar: platform, arch, cpu/memory.
#[tauri::command]
fn get_system_info() -> serde_json::Value {
    let cpus = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(0);

    let mem_kb = read_meminfo_kb();

    serde_json::json!({
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "cpus": cpus,
        "memoryKb": mem_kb,
    })
}

#[cfg(target_os = "linux")]
fn read_meminfo_kb() -> u64 {
    std::fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with("MemTotal:"))
                .and_then(|l| l.split_whitespace().nth(1))
                .and_then(|v| v.parse().ok())
        })
        .unwrap_or(0)
}

#[cfg(not(target_os = "linux"))]
fn read_meminfo_kb() -> u64 {
    0
}

/// Open a path in the OS default file manager / browser (guarded by CSP).
#[tauri::command]
fn reveal_in_file_manager(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let shell = app.shell();
    #[cfg(target_os = "windows")]
    let _ = shell.open(path, None);
    #[cfg(not(target_os = "windows"))]
    {
        let _ = shell.open(path, None);
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(TerminalState::default())
        .invoke_handler(tauri::generate_handler![
            run_terminal_command,
            get_host_platform,
            spawn_terminal,
            write_terminal,
            terminate_terminal,
            is_terminal_running,
            minimize_window,
            maximize_window,
            close_window,
            toggle_fullscreen,
            is_window_maximized,
            get_system_info,
            reveal_in_file_manager,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
