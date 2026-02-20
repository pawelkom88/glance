#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod sessions;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

pub struct AppState {
  pub sessions_root: PathBuf,
  pub shortcut_actions: Mutex<HashMap<String, commands::ShortcutAction>>,
}

fn create_overlay_window_if_missing(app: &tauri::AppHandle) -> Result<(), String> {
  if app.get_webview_window("overlay").is_some() {
    return Ok(());
  }

  WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("/#overlay".into()))
    .title("Glance Overlay")
    .always_on_top(true)
    .visible(false)
    .decorations(false)
    .resizable(true)
    .skip_taskbar(true)
    .inner_size(1120.0, 400.0)
    .min_inner_size(500.0, 400.0)
    .build()
    .map_err(|error| error.to_string())?;

  Ok(())
}

fn main() {
  tauri::Builder::default()
    .plugin(
      tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, event| {
        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
          commands::handle_shortcut_event(app, &shortcut.to_string());
        }
      }).build(),
    )
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
      let sessions_root = app_data_dir.join("sessions");
      sessions::ensure_storage(&sessions_root)?;

      app.manage(AppState {
        sessions_root,
        shortcut_actions: Mutex::new(HashMap::new()),
      });
      create_overlay_window_if_missing(app.handle())?;

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::list_sessions,
      commands::create_session,
      commands::create_session_from_markdown,
      commands::duplicate_session,
      commands::delete_session,
      commands::export_session_markdown,
      commands::load_session,
      commands::save_session,
      commands::show_overlay_window,
      commands::hide_overlay_window,
      commands::hide_main_window,
      commands::show_main_window,
      commands::start_overlay_drag,
      commands::register_shortcuts,
      commands::register_default_shortcuts,
      commands::set_overlay_always_on_top,
      commands::list_monitors,
      commands::move_overlay_to_monitor,
      commands::export_session_to_path
    ])
    .run(tauri::generate_context!())
    .expect("failed to run Glance application");
}
