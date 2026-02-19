use crate::sessions;
use crate::AppState;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use tauri::{AppHandle, Emitter, Manager, Position, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
  pub name: String,
  pub size: String,
  pub primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutEventPayload {
  action: String,
  index: Option<usize>,
  delta: Option<i8>,
}

#[tauri::command]
pub fn list_sessions(state: State<'_, AppState>) -> Result<Vec<sessions::SessionSummary>, String> {
  sessions::list_sessions(&state.sessions_root)
}

#[tauri::command]
pub fn create_session(name: String, state: State<'_, AppState>) -> Result<sessions::SessionSummary, String> {
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
pub fn duplicate_session(id: String, state: State<'_, AppState>) -> Result<sessions::SessionSummary, String> {
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
pub fn load_session(id: String, state: State<'_, AppState>) -> Result<sessions::SessionData, String> {
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
pub fn show_overlay_window(app: AppHandle) -> Result<(), String> {
  let overlay = app
    .get_webview_window("overlay")
    .ok_or_else(|| String::from("Overlay window is not available"))?;

  overlay.show().map_err(|error| error.to_string())?;
  overlay.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn hide_overlay_window(app: AppHandle) -> Result<(), String> {
  let overlay = app
    .get_webview_window("overlay")
    .ok_or_else(|| String::from("Overlay window is not available"))?;

  overlay.hide().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn register_default_shortcuts(app: AppHandle) -> Result<(), String> {
  let manager = app.global_shortcut();
  manager.unregister_all().map_err(|error| error.to_string())?;

  let toggle = Shortcut::from_str("CmdOrCtrl+Shift+S").map_err(|error| error.to_string())?;
  manager.register(toggle).map_err(to_conflict_error)?;

  let speed_up = Shortcut::from_str("CmdOrCtrl+Up").map_err(|error| error.to_string())?;
  manager.register(speed_up).map_err(to_conflict_error)?;

  let speed_down = Shortcut::from_str("CmdOrCtrl+Down").map_err(|error| error.to_string())?;
  manager.register(speed_down).map_err(to_conflict_error)?;

  (1..=9)
    .map(|index| Shortcut::from_str(&format!("CmdOrCtrl+{index}")))
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| error.to_string())?
    .into_iter()
    .try_for_each(|shortcut| manager.register(shortcut).map_err(to_conflict_error))
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
    .and_then(|monitor| monitor.name().cloned())
    .unwrap_or_default();

  let monitors = app
    .available_monitors()
    .map_err(|error| error.to_string())?
    .into_iter()
    .map(|monitor| {
      let name = monitor
        .name()
        .cloned()
        .unwrap_or_else(|| String::from("Unnamed Monitor"));
      let size = format!("{}x{}", monitor.size().width, monitor.size().height);
      let primary = name == primary_name;

      MonitorInfo { name, size, primary }
    })
    .collect::<Vec<_>>();

  Ok(monitors)
}

#[tauri::command]
pub fn move_overlay_to_monitor(monitor_name: String, app: AppHandle) -> Result<(), String> {
  let overlay = app
    .get_webview_window("overlay")
    .ok_or_else(|| String::from("Overlay window is not available"))?;

  let monitor = app
    .available_monitors()
    .map_err(|error| error.to_string())?
    .into_iter()
    .find(|item| {
      item
        .name()
        .map(|name| name.as_str() == monitor_name.as_str())
        .unwrap_or(false)
    })
    .ok_or_else(|| String::from("Selected monitor was not found"))?;

  let position = monitor.position();
  overlay
    .set_position(Position::Physical(tauri::PhysicalPosition::new(
      position.x + 80,
      position.y + 80,
    )))
    .map_err(|error| error.to_string())?;

  overlay.show().map_err(|error| error.to_string())?;
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
  let normalized = shortcut_text.to_lowercase();

  if normalized.ends_with("+shift+s") {
    let _ = app.emit(
      "shortcut-event",
      ShortcutEventPayload {
        action: String::from("toggle-play"),
        index: None,
        delta: None,
      },
    );
    return;
  }

  if normalized.ends_with("+up") {
    let _ = app.emit(
      "shortcut-event",
      ShortcutEventPayload {
        action: String::from("speed-change"),
        index: None,
        delta: Some(4),
      },
    );
    return;
  }

  if normalized.ends_with("+down") {
    let _ = app.emit(
      "shortcut-event",
      ShortcutEventPayload {
        action: String::from("speed-change"),
        index: None,
        delta: Some(-4),
      },
    );
    return;
  }

  for index in 1..=9 {
    if normalized.ends_with(&format!("+{index}")) {
      let _ = app.emit(
        "shortcut-event",
        ShortcutEventPayload {
          action: String::from("jump-section"),
          index: Some(index - 1),
          delta: None,
        },
      );
      return;
    }
  }
}

fn to_conflict_error(error: tauri_plugin_global_shortcut::Error) -> String {
  format!(
    "Shortcut registration conflict: {}. Another app may already use this key combination.",
    error
  )
}
