#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod sessions;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Listener, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_updater::UpdaterExt;

const APP_READY_EVENT: &str = "app_ready";
const MAIN_WINDOW_LABEL: &str = "main";
const MAIN_WINDOW_SHOW_FALLBACK_MS: u64 = 3000;
const MONITOR_MOVE_DEBOUNCE_MS: u64 = 150;
const MONITOR_MOVE_POLL_MS: u64 = 100;

pub struct AppState {
    pub sessions_root: PathBuf,
    pub shortcut_actions: Mutex<HashMap<String, commands::ShortcutAction>>,
    pub active_bindings: Mutex<Vec<commands::ShortcutBinding>>,
    pub saved_main_monitor_key: Mutex<Option<String>>,
    pub _log_guard: tracing_appender::non_blocking::WorkerGuard,
}

fn should_unregister_shortcuts(window_label: &str, focused: bool) -> bool {
    !focused || window_label != "overlay"
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

fn show_main_window(app: &tauri::AppHandle) {
    let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    let _ = main_window.show();
    let _ = main_window.set_focus();
}

fn register_main_window_ready_hooks(app: &tauri::AppHandle) {
    let has_shown_main_window = Arc::new(AtomicBool::new(false));

    let event_window_flag = Arc::clone(&has_shown_main_window);
    let event_window_handle = app.clone();
    app.listen(APP_READY_EVENT, move |_| {
        if event_window_flag
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            show_main_window(&event_window_handle);
        }
    });

    let fallback_window_flag = Arc::clone(&has_shown_main_window);
    let fallback_window_handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(MAIN_WINDOW_SHOW_FALLBACK_MS));
        if fallback_window_flag
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            show_main_window(&fallback_window_handle);
        }
    });
}

fn register_main_window_monitor_change_hooks(app: &tauri::AppHandle) -> Result<(), String> {
    let main_window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| String::from("Main window is not available"))?;

    let moved_at = Arc::new(Mutex::new(None::<Instant>));
    let moved_at_for_events = Arc::clone(&moved_at);
    let app_handle_for_scale = app.clone();
    let main_window_for_scale = main_window.clone();

    main_window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) => {
            if let Ok(mut locked) = moved_at_for_events.lock() {
                *locked = Some(Instant::now());
            }
        }
        WindowEvent::ScaleFactorChanged { .. } => {
            let _ = commands::check_and_notify_monitor_change(
                &main_window_for_scale,
                &app_handle_for_scale,
            );
        }
        _ => {}
    });

    let moved_at_for_loop = Arc::clone(&moved_at);
    let main_window_for_loop = main_window.clone();
    let app_handle_for_loop = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(MONITOR_MOVE_POLL_MS));

        let should_check = match moved_at_for_loop.lock() {
            Ok(mut locked) => match *locked {
                Some(last_moved_at) => {
                    if last_moved_at.elapsed() >= Duration::from_millis(MONITOR_MOVE_DEBOUNCE_MS) {
                        *locked = None;
                        true
                    } else {
                        false
                    }
                }
                None => false,
            },
            Err(_) => false,
        };

        if should_check {
            let _ = commands::check_and_notify_monitor_change(
                &main_window_for_loop,
                &app_handle_for_loop,
            );
        }
    });

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
                let window_label = window.label();
                if window_label == "overlay" && *focused {
                    // Re-register active bindings when overlay gains focus
                    if let Some(state) = window.try_state::<AppState>() {
                        if let Ok(bindings) = state.active_bindings.lock() {
                            let _ =
                                commands::apply_bindings(window.app_handle(), &bindings, &state);
                        }
                    }
                    return;
                }

                if should_unregister_shortcuts(window_label, *focused) {
                    // Do not hijack keys in other apps when app focus shifts away from the overlay.
                    let _ = window.app_handle().global_shortcut().unregister_all();
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

            tracing_subscriber::fmt().with_writer(non_blocking).init();

            tracing::info!("Glance started");

            app.manage(AppState {
                sessions_root,
                shortcut_actions: Mutex::new(HashMap::new()),
                active_bindings: Mutex::new(Vec::new()),
                saved_main_monitor_key: Mutex::new(None),
                _log_guard: guard,
            });
            create_overlay_window_if_missing(app.handle())?;
            register_main_window_ready_hooks(app.handle());
            register_main_window_monitor_change_hooks(app.handle())?;

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
            commands::get_monitors,
            commands::get_main_window_current_monitor,
            commands::move_overlay_to_monitor,
            commands::move_main_to_monitor,
            commands::move_window_to_monitor,
            commands::snap_overlay_to_top_center,
            commands::export_session_to_path,
            commands::export_diagnostics
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Glance application");
}

#[cfg(test)]
mod tests {
    use super::should_unregister_shortcuts;

    #[test]
    fn keeps_shortcuts_only_for_focused_overlay() {
        assert!(!should_unregister_shortcuts("overlay", true));
        assert!(should_unregister_shortcuts("overlay", false));
        assert!(should_unregister_shortcuts("main", true));
        assert!(should_unregister_shortcuts("main", false));
    }
}
