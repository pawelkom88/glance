use crate::sessions;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalSize, Position,
    Size, State,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

const OVERLAY_MIN_WIDTH: u32 = 500;
const OVERLAY_MIN_HEIGHT: u32 = 400;
const OVERLAY_DEFAULT_WIDTH: u32 = 1120;
const OVERLAY_DEFAULT_HEIGHT: u32 = 400;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub name: String,
    pub size: String,
    pub primary: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowOverlayRequest {
    pub saved_monitor_name: Option<String>,
    pub saved_bounds: Option<OverlayBounds>,
    pub prefer_top_center: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowOverlayResult {
    pub monitor_name: String,
    pub used_saved_bounds: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutAction {
    action: String,
    index: Option<usize>,
    delta: Option<i8>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutBinding {
    pub action: String,
    pub accelerator: String,
}

#[tauri::command]
pub fn list_sessions(state: State<'_, AppState>) -> Result<Vec<sessions::SessionSummary>, String> {
    sessions::list_sessions(&state.sessions_root)
}

#[tauri::command]
pub fn create_session(
    name: String,
    state: State<'_, AppState>,
) -> Result<sessions::SessionSummary, String> {
    sessions::create_session(&state.sessions_root, name)
}

#[tauri::command]
pub fn create_session_from_markdown(
    name: String,
    markdown: String,
    state: State<'_, AppState>,
) -> Result<sessions::SessionSummary, String> {
    sessions::create_session_from_markdown(&state.sessions_root, name, markdown)
}

#[tauri::command]
pub fn duplicate_session(
    id: String,
    state: State<'_, AppState>,
) -> Result<sessions::SessionSummary, String> {
    sessions::duplicate_session(&state.sessions_root, id)
}

#[tauri::command]
pub fn delete_session(id: String, state: State<'_, AppState>) -> Result<(), String> {
    sessions::delete_session(&state.sessions_root, id)
}

#[tauri::command]
pub fn export_session_markdown(id: String, state: State<'_, AppState>) -> Result<String, String> {
    sessions::export_session_markdown(&state.sessions_root, id)
}

#[tauri::command]
pub fn load_session(
    id: String,
    state: State<'_, AppState>,
) -> Result<sessions::SessionData, String> {
    sessions::load_session(&state.sessions_root, id)
}

#[tauri::command]
pub fn save_session(
    id: String,
    markdown: String,
    meta: sessions::SessionMeta,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sessions::save_session(&state.sessions_root, id, markdown, meta)
}

#[tauri::command]
pub fn show_overlay_window(
    request: ShowOverlayRequest,
    app: AppHandle,
) -> Result<ShowOverlayResult, String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("Overlay window is not available"))?;
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Main window is not available"))?;

    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;
    if monitors.is_empty() {
        return Err(String::from("No monitors available"));
    }

    let main_position = main_window
        .outer_position()
        .map_err(|error| error.to_string())?;
    let main_size = main_window
        .outer_size()
        .map_err(|error| error.to_string())?;
    let center_x = main_position.x + (main_size.width as i32 / 2);
    let center_y = main_position.y + (main_size.height as i32 / 2);

    let primary_monitor = app.primary_monitor().map_err(|error| error.to_string())?;
    let target_monitor = monitors
        .iter()
        .find(|monitor| monitor_contains_point(monitor, center_x, center_y))
        .cloned()
        .or(primary_monitor)
        .or_else(|| monitors.first().cloned())
        .ok_or_else(|| String::from("Unable to resolve target monitor"))?;

    let target_monitor_name = monitor_label(&target_monitor);
    let mut used_saved_bounds = false;

    // Guard against accidental fullscreen/maximized state which blocks normal dragging.
    if overlay.is_fullscreen().map_err(|error| error.to_string())? {
        overlay
            .set_fullscreen(false)
            .map_err(|error| error.to_string())?;
    }

    if overlay.is_maximized().map_err(|error| error.to_string())? {
        overlay.unmaximize().map_err(|error| error.to_string())?;
    }

    overlay
        .set_min_size(Some(Size::Logical(LogicalSize::new(
            OVERLAY_MIN_WIDTH as f64,
            OVERLAY_MIN_HEIGHT as f64,
        ))))
        .map_err(|error| error.to_string())?;

    if request.saved_monitor_name.as_deref() == Some(target_monitor_name.as_str()) {
        if let Some(saved_bounds) = request.saved_bounds.as_ref() {
            if is_bounds_inside_monitor(saved_bounds, &target_monitor) {
                apply_overlay_bounds(&overlay, saved_bounds)?;
                used_saved_bounds = true;
            }
        }
    }

    if !used_saved_bounds {
        let current_size = overlay
            .outer_size()
            .map_err(|error| error.to_string())
            .unwrap_or(PhysicalSize::new(
                OVERLAY_DEFAULT_WIDTH,
                OVERLAY_DEFAULT_HEIGHT,
            ));
        let width = current_size.width.max(OVERLAY_MIN_WIDTH) as i32;
        let height = current_size.height.max(OVERLAY_MIN_HEIGHT) as i32;
        let monitor_position = target_monitor.position();
        let monitor_size = target_monitor.size();

        let raw_x = monitor_position.x + ((monitor_size.width as i32 - width) / 2);
        let raw_y = if request.prefer_top_center {
            monitor_position.y
        } else {
            monitor_position.y + ((monitor_size.height as i32 - height) / 2)
        };

        let (clamped_x, clamped_y) = clamp_to_monitor(raw_x, raw_y, width, height, &target_monitor);
        overlay
            .set_size(Size::Physical(PhysicalSize::new(
                width as u32,
                height as u32,
            )))
            .map_err(|error| error.to_string())?;
        overlay
            .set_position(Position::Physical(PhysicalPosition::new(
                clamped_x, clamped_y,
            )))
            .map_err(|error| error.to_string())?;
    }

    overlay.show().map_err(|error| error.to_string())?;
    overlay.set_focus().map_err(|error| error.to_string())?;

    Ok(ShowOverlayResult {
        monitor_name: target_monitor_name,
        used_saved_bounds,
    })
}

#[tauri::command]
pub fn hide_overlay_window(app: AppHandle) -> Result<(), String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("Overlay window is not available"))?;

    overlay.hide().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn hide_main_window(app: AppHandle) -> Result<(), String> {
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Main window is not available"))?;

    main_window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) -> Result<(), String> {
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Main window is not available"))?;

    main_window.show().map_err(|error| error.to_string())?;
    main_window.set_focus().map_err(|error| error.to_string())?;
    app.emit_to("main", "main-window-shown", ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn start_overlay_drag(app: AppHandle) -> Result<(), String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("Overlay window is not available"))?;

    if overlay.is_fullscreen().map_err(|error| error.to_string())? {
        overlay
            .set_fullscreen(false)
            .map_err(|error| error.to_string())?;
    }

    if overlay.is_maximized().map_err(|error| error.to_string())? {
        overlay.unmaximize().map_err(|error| error.to_string())?;
    }

    overlay.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn register_shortcuts(
    bindings: Vec<ShortcutBinding>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = app.global_shortcut();
    manager
        .unregister_all()
        .map_err(|error| error.to_string())?;

    let mut action_map = std::collections::HashMap::<String, ShortcutAction>::new();

    for binding in bindings {
        if uses_overlay_local_shortcut(&binding.action, &binding.accelerator) {
            continue;
        }

        let shortcut = Shortcut::from_str(&binding.accelerator)
            .map_err(|error| format!("Invalid shortcut for {}: {}", binding.action, error))?;
        manager.register(shortcut.clone()).map_err(|error| {
            format!(
        "Shortcut registration conflict for '{}' ({}) - {}. Choose a different combination.",
        binding.action, binding.accelerator, error
      )
        })?;

        let mapped = binding_to_shortcut_action(&binding.action)?;
        action_map.insert(normalize_shortcut_text(&shortcut.to_string()), mapped);
    }

    let mut locked = state
        .shortcut_actions
        .lock()
        .map_err(|_| String::from("Unable to update shortcut mappings"))?;
    *locked = action_map;

    Ok(())
}

#[tauri::command]
pub fn register_default_shortcuts(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    register_shortcuts(default_shortcut_bindings(), app, state)
}

#[tauri::command]
pub fn set_overlay_always_on_top(enabled: bool, app: AppHandle) -> Result<(), String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("Overlay window is not available"))?;

    overlay
        .set_always_on_top(enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let primary_name = app
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .as_ref()
        .map(monitor_label)
        .unwrap_or_default();

    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|monitor| {
            let name = monitor_label(&monitor);
            let size = format!("{}x{}", monitor.size().width, monitor.size().height);
            let primary = name == primary_name;

            MonitorInfo {
                name,
                size,
                primary,
            }
        })
        .collect::<Vec<_>>();

    Ok(monitors)
}

#[tauri::command]
pub fn move_overlay_to_monitor(monitor_name: String, app: AppHandle) -> Result<(), String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("Overlay window is not available"))?;
    let was_visible = overlay.is_visible().map_err(|error| error.to_string())?;

    let monitor = app
        .available_monitors()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|item| monitor_label(item).as_str() == monitor_name.as_str())
        .ok_or_else(|| String::from("Selected monitor was not found"))?;

    let overlay_size = overlay
        .outer_size()
        .map_err(|error| error.to_string())
        .unwrap_or(PhysicalSize::new(
            OVERLAY_DEFAULT_WIDTH,
            OVERLAY_DEFAULT_HEIGHT,
        ));
    let width = overlay_size.width.max(OVERLAY_MIN_WIDTH) as i32;
    let height = overlay_size.height.max(OVERLAY_MIN_HEIGHT) as i32;
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let centered_x = monitor_position.x + ((monitor_size.width as i32 - width) / 2);
    let top_y = monitor_position.y;
    let (x, y) = clamp_to_monitor(centered_x, top_y, width, height, &monitor);

    overlay
        .set_size(Size::Physical(PhysicalSize::new(
            width as u32,
            height as u32,
        )))
        .map_err(|error| error.to_string())?;
    overlay
        .set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|error| error.to_string())?;

    if was_visible {
        overlay.show().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn export_session_to_path(
    id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let session = sessions::load_session(&state.sessions_root, id)?;
    let mut output_path = PathBuf::from(path);

    if output_path.extension().is_none() {
        output_path.set_extension("md");
    }

    let parent = output_path
        .parent()
        .ok_or_else(|| String::from("Invalid export path"))?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    fs::write(&output_path, session.markdown).map_err(|error| error.to_string())?;
    Ok(output_path.display().to_string())
}

pub fn handle_shortcut_event(app: &AppHandle, shortcut_text: &str) {
    let Some(overlay_window) = app.get_webview_window("overlay") else {
        return;
    };

    let is_overlay_visible = overlay_window.is_visible().unwrap_or(false);
    if !is_overlay_visible {
        return;
    }

    let is_overlay_focused = overlay_window.is_focused().unwrap_or(false);
    if !is_overlay_focused {
        return;
    }

    let normalized = normalize_shortcut_text(shortcut_text);
    if let Ok(locked) = app.state::<AppState>().shortcut_actions.lock() {
        if let Some(action) = locked.get(&normalized).cloned() {
            let _ = app.emit("shortcut-event", action);
            return;
        }
    }
}

fn monitor_label(monitor: &Monitor) -> String {
    monitor
        .name()
        .cloned()
        .unwrap_or_else(|| String::from("Unnamed Monitor"))
}

fn monitor_contains_point(monitor: &Monitor, x: i32, y: i32) -> bool {
    let position = monitor.position();
    let size = monitor.size();
    let max_x = position.x + size.width as i32;
    let max_y = position.y + size.height as i32;

    x >= position.x && x < max_x && y >= position.y && y < max_y
}

fn is_bounds_inside_monitor(bounds: &OverlayBounds, monitor: &Monitor) -> bool {
    if bounds.width <= 0.0 || bounds.height <= 0.0 {
        return false;
    }

    let x = bounds.x.round() as i32;
    let y = bounds.y.round() as i32;
    let width = bounds.width.round() as i32;
    let height = bounds.height.round() as i32;
    let position = monitor.position();
    let size = monitor.size();
    let right = x + width;
    let bottom = y + height;
    let monitor_right = position.x + size.width as i32;
    let monitor_bottom = position.y + size.height as i32;

    x >= position.x && y >= position.y && right <= monitor_right && bottom <= monitor_bottom
}

fn clamp_to_monitor(x: i32, y: i32, width: i32, height: i32, monitor: &Monitor) -> (i32, i32) {
    let position = monitor.position();
    let size = monitor.size();
    let max_x = position.x + (size.width as i32 - width).max(0);
    let max_y = position.y + (size.height as i32 - height).max(0);

    (x.clamp(position.x, max_x), y.clamp(position.y, max_y))
}

fn apply_overlay_bounds(
    overlay: &tauri::WebviewWindow,
    bounds: &OverlayBounds,
) -> Result<(), String> {
    let width = bounds.width.round().max(OVERLAY_MIN_WIDTH as f64) as u32;
    let height = bounds.height.round().max(OVERLAY_MIN_HEIGHT as f64) as u32;
    overlay
        .set_size(Size::Physical(PhysicalSize::new(width, height)))
        .map_err(|error| error.to_string())?;

    overlay
        .set_position(Position::Physical(PhysicalPosition::new(
            bounds.x.round() as i32,
            bounds.y.round() as i32,
        )))
        .map_err(|error| error.to_string())
}

fn normalize_shortcut_text(value: &str) -> String {
    value.to_lowercase().replace(' ', "")
}

fn uses_overlay_local_shortcut(action: &str, accelerator: &str) -> bool {
    let normalized = normalize_shortcut_text(accelerator);
    (action == "toggle-play" && normalized == "space")
        || (action == "start-over" && normalized == "r")
}

fn binding_to_shortcut_action(action: &str) -> Result<ShortcutAction, String> {
    if action == "toggle-play" {
        return Ok(ShortcutAction {
            action: String::from("toggle-play"),
            index: None,
            delta: None,
        });
    }

    if action == "speed-up" {
        return Ok(ShortcutAction {
            action: String::from("speed-change"),
            index: None,
            delta: Some(1),
        });
    }

    if action == "speed-down" {
        return Ok(ShortcutAction {
            action: String::from("speed-change"),
            index: None,
            delta: Some(-1),
        });
    }

    if action == "start-over" {
        return Ok(ShortcutAction {
            action: String::from("start-over"),
            index: None,
            delta: None,
        });
    }

    if let Some(value) = action.strip_prefix("jump-") {
        let parsed = value
            .parse::<usize>()
            .map_err(|_| format!("Unsupported shortcut action '{}'", action))?;

        if !(1..=9).contains(&parsed) {
            return Err(format!("Unsupported shortcut action '{}'", action));
        }

        return Ok(ShortcutAction {
            action: String::from("jump-section"),
            index: Some(parsed - 1),
            delta: None,
        });
    }

    Err(format!("Unsupported shortcut action '{}'", action))
}

fn default_shortcut_bindings() -> Vec<ShortcutBinding> {
    vec![
        ShortcutBinding {
            action: String::from("toggle-play"),
            accelerator: String::from("Space"),
        },
        ShortcutBinding {
            action: String::from("start-over"),
            accelerator: String::from("R"),
        },
        ShortcutBinding {
            action: String::from("speed-up"),
            accelerator: String::from("CmdOrCtrl+Up"),
        },
        ShortcutBinding {
            action: String::from("speed-down"),
            accelerator: String::from("CmdOrCtrl+Down"),
        },
        ShortcutBinding {
            action: String::from("jump-1"),
            accelerator: String::from("CmdOrCtrl+1"),
        },
        ShortcutBinding {
            action: String::from("jump-2"),
            accelerator: String::from("CmdOrCtrl+2"),
        },
        ShortcutBinding {
            action: String::from("jump-3"),
            accelerator: String::from("CmdOrCtrl+3"),
        },
        ShortcutBinding {
            action: String::from("jump-4"),
            accelerator: String::from("CmdOrCtrl+4"),
        },
        ShortcutBinding {
            action: String::from("jump-5"),
            accelerator: String::from("CmdOrCtrl+5"),
        },
        ShortcutBinding {
            action: String::from("jump-6"),
            accelerator: String::from("CmdOrCtrl+6"),
        },
        ShortcutBinding {
            action: String::from("jump-7"),
            accelerator: String::from("CmdOrCtrl+7"),
        },
        ShortcutBinding {
            action: String::from("jump-8"),
            accelerator: String::from("CmdOrCtrl+8"),
        },
        ShortcutBinding {
            action: String::from("jump-9"),
            accelerator: String::from("CmdOrCtrl+9"),
        },
    ]
}
