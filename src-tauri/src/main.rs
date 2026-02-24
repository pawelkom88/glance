#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod sessions;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_updater::UpdaterExt;

pub struct AppState {
    pub sessions_root: PathBuf,
    pub shortcut_actions: Mutex<HashMap<String, commands::ShortcutAction>>,
    pub active_bindings: Mutex<Vec<commands::ShortcutBinding>>,
    pub _log_guard: tracing_appender::non_blocking::WorkerGuard,
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
        .shadow(false)
        .transparent(true)
        .resizable(true)
        .skip_taskbar(true)
        .inner_size(1120.0, 400.0)
        .min_inner_size(500.0, 400.0)
        .build()
        .map_err(|error: tauri::Error| error.to_string())?;

    Ok(())
}

async fn check_update(app: tauri::AppHandle) {
    if let Ok(updater) = app.updater() {
        if let Ok(Some(update)) = updater.check().await {
            // Silently install and restart if an update is found
            let _ = update.download_and_install(|_, _| {}, || {}).await;
            app.restart();
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        commands::handle_shortcut_event(app, &shortcut.to_string());
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(focused) = event {
                if window.label() == "overlay" {
                    if *focused {
                        // Re-register active bindings when overlay gains focus
                        if let Some(state) = window.try_state::<AppState>() {
                            if let Ok(bindings) = state.active_bindings.lock() {
                                let _ = commands::apply_bindings(window.app_handle(), &bindings, &state);
                            }
                        }
                    } else {
                        // Do not hijack keys in other apps when overlay is unfocused.
                        let _ = window.app_handle().global_shortcut().unregister_all();
                    }
                }
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                check_update(handle).await;
            });

            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            let sessions_root = app_data_dir.join("sessions");
            sessions::ensure_storage(&sessions_root)?;

            let app_log_dir = app
                .path()
                .app_log_dir()
                .map_err(|error| error.to_string())?;
            std::fs::create_dir_all(&app_log_dir).map_err(|error| error.to_string())?;

            let file_appender = tracing_appender::rolling::daily(&app_log_dir, "glance.log");
            let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
            
            tracing_subscriber::fmt()
                .with_writer(non_blocking)
                .init();
            
            tracing::info!("Glance started");

            app.manage(AppState {
                sessions_root,
                shortcut_actions: Mutex::new(HashMap::new()),
                active_bindings: Mutex::new(Vec::new()),
                _log_guard: guard,
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
            commands::recover_overlay_focus,
            commands::register_shortcuts,
            commands::register_default_shortcuts,
            commands::set_overlay_always_on_top,
            commands::list_monitors,
            commands::move_overlay_to_monitor,
            commands::export_session_to_path,
            commands::export_diagnostics
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Glance application");
}
