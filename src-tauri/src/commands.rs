use crate::sessions;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition,
    PhysicalSize, Position, Size, State,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

const OVERLAY_MIN_WIDTH: u32 = 500;
const OVERLAY_MIN_HEIGHT: u32 = 200;
const OVERLAY_DEFAULT_WIDTH: u32 = 1120;
const OVERLAY_DEFAULT_HEIGHT: u32 = 400;
const MAIN_WINDOW_MOVE_SETTLE_MS: u64 = 50;
const HIDE_OVERLAY_ACTION: &str = "hide-overlay";
const LEGACY_TOGGLE_OVERLAY_ACTION: &str = "toggle-overlay";
const HIDE_OVERLAY_DEFAULT_ACCELERATOR: &str = "CmdOrCtrl+Shift+K";
const MAIN_WINDOW_LABEL: &str = "main";
const OVERLAY_WINDOW_LABEL: &str = "overlay";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: String,
    pub name: String,
    pub size: String,
    pub origin: String,
    pub primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedMonitor {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub composite_key: String,
    pub display_name: String,
    pub scale_factor: f64,
    pub is_primary: bool,
    pub position_x: i32,
    pub position_y: i32,
    pub logical_width: f64,
    pub logical_height: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorChangedPayload {
    pub name: String,
    pub display_name: String,
    pub width: u32,
    pub height: u32,
    pub composite_key: String,
}

#[cfg(test)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowOverlayResult {
    pub monitor_name: String,
    pub used_saved_bounds: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapOverlayResult {
    pub x: i32,
    pub y: i32,
    pub monitor_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutAction {
    action: String,
    index: Option<usize>,
    delta: Option<i8>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutBinding {
    pub action: String,
    pub accelerator: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GlanceVisibilityAction {
    HideAll,
    RestoreOverlay,
    Noop,
}

pub fn apply_bindings(
    app: &AppHandle,
    bindings: &[ShortcutBinding],
    state: &AppState,
) -> Result<(), String> {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all(); // Ignore error on unregister

    let mut action_map = std::collections::HashMap::<String, ShortcutAction>::new();

    for binding in bindings {
        if is_os_reserved_shortcut(&binding.accelerator) {
            return Err(format!(
                "OS Reserved: The shortcut '{}' is reserved by your operating system. Please choose another combination.",
                binding.accelerator
            ));
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

    // Overlay-scoped fallback shortcuts: keep core controls responsive even
    // when focus is transiently lost after native drag operations.
    let mut register_optional_shortcuts = |accelerators: &[&str], action: ShortcutAction| {
        for accelerator in accelerators {
            let Ok(shortcut) = Shortcut::from_str(accelerator) else {
                continue;
            };
            if manager.register(shortcut.clone()).is_ok() {
                action_map.insert(
                    normalize_shortcut_text(&shortcut.to_string()),
                    action.clone(),
                );
                break;
            }
        }
    };

    register_optional_shortcuts(
        &["Escape", "Esc"],
        ShortcutAction {
            action: String::from("escape-pressed"),
            index: None,
            delta: None,
        },
    );
    register_optional_shortcuts(
        &["CmdOrCtrl+=", "CmdOrCtrl+Plus", "CmdOrCtrl+NumpadAdd"],
        ShortcutAction {
            action: String::from("font-scale-change"),
            index: None,
            delta: Some(1),
        },
    );
    register_optional_shortcuts(
        &["CmdOrCtrl+-", "CmdOrCtrl+Minus", "CmdOrCtrl+NumpadSubtract"],
        ShortcutAction {
            action: String::from("font-scale-change"),
            index: None,
            delta: Some(-1),
        },
    );
    register_optional_shortcuts(
        &["CmdOrCtrl+0", "CmdOrCtrl+Numpad0"],
        ShortcutAction {
            action: String::from("font-scale-reset"),
            index: None,
            delta: None,
        },
    );

    if let Ok(mut locked) = state.shortcut_actions.lock() {
        *locked = action_map;
    }

    Ok(())
}

fn find_hide_overlay_binding(bindings: &[ShortcutBinding]) -> Option<ShortcutBinding> {
    bindings
        .iter()
        .find(|binding| {
            binding.action == HIDE_OVERLAY_ACTION || binding.action == LEGACY_TOGGLE_OVERLAY_ACTION
        })
        .cloned()
}

fn resolve_glance_visibility_action(
    overlay_visible: bool,
    main_visible: bool,
) -> GlanceVisibilityAction {
    if overlay_visible {
        return GlanceVisibilityAction::HideAll;
    }

    if !main_visible {
        return GlanceVisibilityAction::RestoreOverlay;
    }

    GlanceVisibilityAction::Noop
}

pub fn apply_hide_overlay_binding_only(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();

    let binding = state
        .active_bindings
        .lock()
        .ok()
        .and_then(|bindings| find_hide_overlay_binding(&bindings))
        .unwrap_or(ShortcutBinding {
            action: String::from(HIDE_OVERLAY_ACTION),
            accelerator: String::from(HIDE_OVERLAY_DEFAULT_ACCELERATOR),
        });

    if is_os_reserved_shortcut(&binding.accelerator) {
        return Err(format!(
            "OS Reserved: The shortcut '{}' is reserved by your operating system. Please choose another combination.",
            binding.accelerator
        ));
    }

    let shortcut = Shortcut::from_str(&binding.accelerator)
        .map_err(|error| format!("Invalid shortcut for {}: {}", binding.action, error))?;

    manager.register(shortcut.clone()).map_err(|error| {
        format!(
            "Shortcut registration conflict for '{}' ({}) - {}. Choose a different combination.",
            binding.action, binding.accelerator, error
        )
    })?;

    let mut action_map = HashMap::<String, ShortcutAction>::new();
    action_map.insert(
        normalize_shortcut_text(&shortcut.to_string()),
        ShortcutAction {
            action: String::from(HIDE_OVERLAY_ACTION),
            index: None,
            delta: None,
        },
    );

    if let Ok(mut locked) = state.shortcut_actions.lock() {
        *locked = action_map;
    }

    Ok(())
}

#[tauri::command]
pub fn list_sessions(state: State<'_, AppState>) -> Result<Vec<sessions::SessionSummary>, String> {
    sessions::list_sessions(&state.sessions_root)
}

#[tauri::command]
pub fn list_folders(state: State<'_, AppState>) -> Result<Vec<sessions::SessionFolder>, String> {
    sessions::list_folders(&state.sessions_root)
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
pub fn create_folder(
    name: String,
    state: State<'_, AppState>,
) -> Result<sessions::SessionFolder, String> {
    sessions::create_folder(&state.sessions_root, name)
}

#[tauri::command]
pub fn rename_folder(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<sessions::SessionFolder, String> {
    sessions::rename_folder(&state.sessions_root, id, name)
}

#[tauri::command]
pub fn delete_folder(id: String, state: State<'_, AppState>) -> Result<(), String> {
    sessions::delete_folder(&state.sessions_root, id)
}

#[tauri::command]
pub fn move_sessions_to_folder(
    session_ids: Vec<String>,
    folder_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    sessions::move_sessions_to_folder(&state.sessions_root, session_ids, folder_id)
}

#[tauri::command]
pub fn delete_session(id: String, state: State<'_, AppState>) -> Result<(), String> {
    sessions::delete_session(&state.sessions_root, id)
}

#[tauri::command]
pub fn open_sessions_folder(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(
            state.sessions_root.to_string_lossy().to_string(),
            None::<&str>,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn restore_from_backup(path: String) -> Result<(), String> {
    use std::path::Path;
    sessions::restore_from_backup(Path::new(&path))
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
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
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ShowOverlayResult, String> {
    show_overlay_window_inner(&app, &state)
}

fn show_overlay_window_inner(
    app: &AppHandle,
    state: &AppState,
) -> Result<ShowOverlayResult, String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("Overlay window is not available"))?;
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Main window is not available"))?;
    let target_monitor = main_window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(main_window
            .primary_monitor()
            .map_err(|error| error.to_string())?)
        .ok_or_else(|| String::from("No monitors available"))?;
    let target_monitor_label = monitor_label(&target_monitor);
    let target_monitor_size = *target_monitor.size();
    let target_monitor_position = *target_monitor.position();
    let target_monitor_id = monitor_key(&target_monitor);
    let target_monitor_selection_key = monitor_selection_key_from_parts(
        target_monitor_label.as_str(),
        target_monitor_size,
        target_monitor_position,
    );

    set_saved_main_monitor_key(app, Some(target_monitor_selection_key));

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

    let _ = overlay.hide();
    top_center_window_on_monitor(&overlay, &target_monitor)?;

    overlay.show().map_err(|error| error.to_string())?;
    overlay.set_focus().map_err(|error| error.to_string())?;
    recover_overlay_focus_inner(&app, &state)?;

    Ok(ShowOverlayResult {
        monitor_name: target_monitor_id,
        used_saved_bounds: false,
    })
}

#[tauri::command]
pub fn hide_overlay_window(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    hide_overlay_window_inner(&app, &state)
}

fn hide_overlay_window_inner(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let overlay = app
        .get_webview_window(OVERLAY_WINDOW_LABEL)
        .ok_or_else(|| String::from("Overlay window is not available"))?;

    overlay.hide().map_err(|error| error.to_string())?;
    apply_hide_overlay_binding_only(app, state)?;
    Ok(())
}

#[tauri::command]
pub fn hide_main_window(app: AppHandle) -> Result<(), String> {
    let main_window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| String::from("Main window is not available"))?;

    main_window.hide().map_err(|error| error.to_string())
}

pub fn toggle_glance_visibility(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let overlay = app
        .get_webview_window(OVERLAY_WINDOW_LABEL)
        .ok_or_else(|| String::from("Overlay window is not available"))?;
    let main_window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| String::from("Main window is not available"))?;
    let is_overlay_visible = overlay.is_visible().map_err(|error| error.to_string())?;
    let is_main_visible = main_window
        .is_visible()
        .map_err(|error| error.to_string())?;

    match resolve_glance_visibility_action(is_overlay_visible, is_main_visible) {
        GlanceVisibilityAction::HideAll => {
            hide_overlay_window_inner(app, state)?;
            main_window.hide().map_err(|error| error.to_string())?;
        }
        GlanceVisibilityAction::RestoreOverlay => {
            overlay.show().map_err(|error| error.to_string())?;
            overlay.set_focus().map_err(|error| error.to_string())?;
            recover_overlay_focus_inner(app, state)?;
        }
        GlanceVisibilityAction::Noop => {}
    }
    Ok(())
}

#[tauri::command]
pub fn show_main_window(saved_monitor_key: Option<String>, app: AppHandle) -> Result<(), String> {
    let main_window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| String::from("Main window is not available"))?;

    let tracked_monitor_key = read_saved_main_monitor_key(&app);
    if let Some(monitor_key) = resolve_main_window_restore_monitor_key(
        saved_monitor_key.as_deref(),
        tracked_monitor_key.as_deref(),
    ) {
        normalize_main_window_state(&main_window)?;
        let selected_monitor =
            move_main_window_to_monitor_selection(&main_window, monitor_key.as_str())?;
        set_saved_main_monitor_key(
            &app,
            Some(monitor_descriptor_selection_key(&selected_monitor)),
        );
    }

    main_window.show().map_err(|error| error.to_string())?;
    main_window.set_focus().map_err(|error| error.to_string())?;
    app.emit_to("main", "main-window-shown", ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn start_overlay_drag(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
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

    overlay
        .start_dragging()
        .map_err(|error| error.to_string())?;

    recover_overlay_focus_inner(&app, &state)
}

#[tauri::command]
pub fn recover_overlay_focus(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    recover_overlay_focus_inner(&app, &state)
}

#[tauri::command]
pub fn register_shortcuts(
    bindings: Vec<ShortcutBinding>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Save bindings to state so they can be re-applied on focus
    if let Ok(mut locked) = state.active_bindings.lock() {
        *locked = bindings.clone();
    }

    // Register to validate conflicts and activate shortcuts.
    apply_bindings(&app, &bindings, &state)?;

    // If overlay is not focused, keep only the global hide shortcut active.
    if let Some(overlay) = app.get_webview_window("overlay") {
        if !overlay.is_focused().unwrap_or(false) {
            apply_hide_overlay_binding_only(&app, &state)?;
        }
    } else {
        apply_hide_overlay_binding_only(&app, &state)?;
    }

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
    let monitors = collect_monitor_descriptors(&app)?;

    let monitors = monitors
        .iter()
        .map(monitor_info_from_descriptor)
        .collect::<Vec<_>>();

    Ok(monitors)
}

#[tauri::command]
pub fn get_monitors(app: AppHandle) -> Result<Vec<DetectedMonitor>, String> {
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Main window is not available"))?;
    let raw_available_monitors = main_window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let primary_monitor = app.primary_monitor().map_err(|error| error.to_string())?;
    let current_monitor = main_window
        .current_monitor()
        .map_err(|error| error.to_string())?;

    if monitor_debug_enabled() {
        monitor_debug_log("[get_monitors] raw available_monitors:");
        if raw_available_monitors.is_empty() {
            monitor_debug_log("  <empty>");
        } else {
            for (index, monitor) in raw_available_monitors.iter().enumerate() {
                monitor_debug_log(format_monitor_debug_line(index, monitor));
            }
        }

        monitor_debug_log("[get_monitors] primary_monitor:");
        monitor_debug_log(format_single_monitor_debug_line(primary_monitor.as_ref()));

        monitor_debug_log("[get_monitors] current_monitor:");
        monitor_debug_log(format_single_monitor_debug_line(current_monitor.as_ref()));
    }

    let mut monitors = collect_monitor_descriptors(&app)?;
    monitors.sort_by(|left, right| {
        if left.primary != right.primary {
            return right.primary.cmp(&left.primary);
        }

        left.position
            .x
            .cmp(&right.position.x)
            .then(left.position.y.cmp(&right.position.y))
    });

    let detected = monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| {
            let scale = monitor.scale_factor.max(0.0001);
            let logical_width = monitor.size.width as f64 / scale;
            let logical_height = monitor.size.height as f64 / scale;

            DetectedMonitor {
                name: monitor.name.clone(),
                composite_key: monitor_descriptor_selection_key(monitor),
                display_name: resolve_display_name(monitor.name.as_str(), index),
                width: monitor.size.width,
                height: monitor.size.height,
                scale_factor: monitor.scale_factor,
                is_primary: monitor.primary,
                position_x: monitor.position.x,
                position_y: monitor.position.y,
                logical_width,
                logical_height,
            }
        })
        .collect::<Vec<_>>();

    if monitor_debug_enabled() {
        monitor_debug_log("[get_monitors] merged result (after dedup + sort):");
        if detected.is_empty() {
            monitor_debug_log("  <empty>");
        } else {
            for (index, monitor) in detected.iter().enumerate() {
                monitor_debug_log(format!(
                    "  [{index}] name=\"{}\" physical={}x{} scale={:.4} pos={},{} logical={}x{} key=\"{}\"",
                    monitor.name,
                    monitor.width,
                    monitor.height,
                    monitor.scale_factor,
                    monitor.position_x,
                    monitor.position_y,
                    monitor.logical_width.round() as i32,
                    monitor.logical_height.round() as i32,
                    monitor.composite_key
                ));
            }
        }
    }

    Ok(detected)
}

#[tauri::command]
pub fn get_main_window_current_monitor(app: AppHandle) -> Result<Option<MonitorInfo>, String> {
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Main window is not available"))?;

    let Some(runtime_monitor) = main_window
        .current_monitor()
        .map_err(|error| error.to_string())?
    else {
        return Ok(None);
    };

    let runtime_position = *runtime_monitor.position();
    let runtime_size = *runtime_monitor.size();
    let runtime_id = monitor_key(&runtime_monitor);
    let runtime_name = monitor_label(&runtime_monitor);

    let descriptors = collect_monitor_descriptors(&app)?;
    if let Some(matched) = descriptors
        .iter()
        .find(|monitor| monitor.position == runtime_position && monitor.size == runtime_size)
    {
        return Ok(Some(monitor_info_from_descriptor(matched)));
    }

    let is_primary = app
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .is_some_and(|monitor| {
            *monitor.position() == runtime_position && *monitor.size() == runtime_size
        });

    Ok(Some(MonitorInfo {
        id: runtime_id,
        name: runtime_name,
        size: format!("{}x{}", runtime_size.width, runtime_size.height),
        origin: format!("{},{}", runtime_position.x, runtime_position.y),
        primary: is_primary,
    }))
}

#[tauri::command]
pub fn move_overlay_to_monitor(monitor_name: String, app: AppHandle) -> Result<(), String> {
    let overlay = app
        .get_webview_window(OVERLAY_WINDOW_LABEL)
        .ok_or_else(|| String::from("Overlay window is not available"))?;
    let was_visible = overlay.is_visible().map_err(|error| error.to_string())?;

    let monitors = collect_monitor_descriptors(&app)?;
    let monitor = find_monitor_by_id_or_label(&monitors, monitor_name.as_str())
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
    let (x, y) = top_center_position_for_monitor(&monitor, width, height);

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
pub fn snap_overlay_to_top_center(app: AppHandle) -> Result<SnapOverlayResult, String> {
    snap_overlay_to_center(app)
}

#[tauri::command]
pub fn snap_overlay_to_center(app: AppHandle) -> Result<SnapOverlayResult, String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("Overlay window is not available"))?;
    let Some(target_monitor) = overlay
        .current_monitor()
        .map_err(|error| error.to_string())?
    else {
        let position = overlay
            .outer_position()
            .map_err(|error| error.to_string())?;
        return Ok(SnapOverlayResult {
            x: position.x,
            y: position.y,
            monitor_name: String::new(),
        });
    };

    let _ = top_center_window_on_monitor(&overlay, &target_monitor)?;
    let settled_position = overlay
        .outer_position()
        .map_err(|error| error.to_string())?;

    Ok(SnapOverlayResult {
        x: settled_position.x,
        y: settled_position.y,
        monitor_name: monitor_key(&target_monitor),
    })
}

#[tauri::command]
pub fn move_main_to_monitor(monitor_name: String, app: AppHandle) -> Result<(), String> {
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Main window is not available"))?;

    let monitors = collect_monitor_descriptors(&app)?;
    let monitor = find_monitor_by_id_or_label(&monitors, monitor_name.as_str())
        .ok_or_else(|| String::from("Selected monitor was not found"))?;

    normalize_main_window_state(&main_window)?;
    move_main_window_to_monitor(&main_window, &monitor)?;
    set_saved_main_monitor_key(&app, Some(monitor_descriptor_selection_key(&monitor)));
    Ok(())
}

#[tauri::command]
pub fn move_window_to_monitor(monitor_key: String, app: AppHandle) -> Result<(), String> {
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Main window is not available"))?;

    if monitor_debug_enabled() {
        monitor_debug_log(format!(
            "[move_window_to_monitor] target composite_key=\"{}\"",
            monitor_key
        ));
    }

    normalize_main_window_state(&main_window)?;
    let selected_monitor =
        move_main_window_to_monitor_selection(&main_window, monitor_key.as_str())?;
    set_saved_main_monitor_key(
        &app,
        Some(monitor_descriptor_selection_key(&selected_monitor)),
    );

    Ok(())
}

pub fn check_and_notify_monitor_change(
    window: &tauri::WebviewWindow,
    app: &AppHandle,
) -> Result<(), String> {
    let Some(current_monitor) = window
        .current_monitor()
        .map_err(|error| error.to_string())?
    else {
        return Ok(());
    };

    let monitor_name = monitor_label(&current_monitor);
    let monitor_size = *current_monitor.size();
    let monitor_position = *current_monitor.position();
    let composite_key = monitor_composite_key(
        monitor_name.as_str(),
        monitor_size.width,
        monitor_size.height,
        monitor_position.x,
        monitor_position.y,
    );

    let saved_key = read_saved_main_monitor_key(app);
    if saved_key.as_deref() == Some(composite_key.as_str()) {
        return Ok(());
    }

    let monitors = collect_monitor_descriptors(app)?;
    let monitor_index = monitors
        .iter()
        .position(|monitor| {
            monitor.name == monitor_name
                && monitor.size.width == monitor_size.width
                && monitor.size.height == monitor_size.height
                && monitor.position == monitor_position
        })
        .unwrap_or(0);

    let payload = MonitorChangedPayload {
        name: monitor_name.clone(),
        display_name: resolve_display_name(monitor_name.as_str(), monitor_index),
        width: monitor_size.width,
        height: monitor_size.height,
        composite_key: composite_key.clone(),
    };

    window
        .emit("monitor_changed", payload)
        .map_err(|error| error.to_string())?;
    set_saved_main_monitor_key(app, Some(composite_key));

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

#[tauri::command]
pub fn export_diagnostics(app: AppHandle, path: String) -> Result<String, String> {
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let archive_path = std::path::PathBuf::from(&path);

    let file = fs::File::create(&archive_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);

    // In zip >= 0.6, FileOptions or SimpleFileOptions is used. Try SimpleFileOptions first.
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    if log_dir.exists() {
        for entry in fs::read_dir(log_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("glance.log") {
                        let mut f = fs::File::open(&path).map_err(|e| e.to_string())?;

                        // Append .txt so users can click and open the log natively on Mac/Win
                        let zip_name = format!("{}.txt", name);
                        zip.start_file(&zip_name, options.clone())
                            .map_err(|e| e.to_string())?;
                        std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }

    zip.finish().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("-R")
            .arg(&archive_path)
            .spawn();
    }

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .arg("/select,")
            .arg(archive_path.to_string_lossy().as_ref())
            .spawn();
    }

    Ok(archive_path.display().to_string())
}

pub fn handle_shortcut_event(app: &AppHandle, shortcut_text: &str) {
    let Some(overlay_window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) else {
        return;
    };

    let normalized = normalize_shortcut_text(shortcut_text);
    let action = app
        .state::<AppState>()
        .shortcut_actions
        .lock()
        .ok()
        .and_then(|locked| locked.get(&normalized).cloned());

    if let Some(action) = action {
        if action.action == HIDE_OVERLAY_ACTION {
            // Avoid mutating global shortcut registrations inside the plugin
            // callback stack; macOS can deadlock when unregister/register is
            // performed synchronously while dispatching a hotkey event.
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let app_for_main_thread = app_handle.clone();
                let _ = app_handle.run_on_main_thread(move || {
                    let state = app_for_main_thread.state::<AppState>();
                    let _ = toggle_glance_visibility(&app_for_main_thread, &state);
                });
            });
            return;
        }

        let is_overlay_focused = overlay_window.is_focused().unwrap_or(false);
        if !is_overlay_focused {
            return;
        }

        let _ = app.emit("shortcut-event", action);
        return;
    }
}

#[tauri::command]
pub fn quit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

fn monitor_composite_key(
    name: &str,
    width: u32,
    height: u32,
    position_x: i32,
    position_y: i32,
) -> String {
    format!("{name}|{width}x{height}|{position_x},{position_y}")
}

fn monitor_selection_key_from_parts(
    name: &str,
    size: PhysicalSize<u32>,
    position: PhysicalPosition<i32>,
) -> String {
    monitor_composite_key(name, size.width, size.height, position.x, position.y)
}

fn normalize_monitor_selection_key(value: &str) -> Option<String> {
    parse_monitor_selection_key(value).map(|selection| selection.to_key())
}

fn resolve_main_window_restore_monitor_key(
    requested_key: Option<&str>,
    tracked_key: Option<&str>,
) -> Option<String> {
    requested_key
        .and_then(normalize_monitor_selection_key)
        .or_else(|| tracked_key.and_then(normalize_monitor_selection_key))
}

fn monitor_debug_enabled() -> bool {
    if cfg!(debug_assertions) {
        return true;
    }

    std::env::var("GLANCE_MONITOR_DEBUG")
        .ok()
        .is_some_and(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
}

fn monitor_debug_log(message: impl AsRef<str>) {
    if !monitor_debug_enabled() {
        return;
    }

    println!("{}", message.as_ref());
}

fn is_windows_device_path(name: &str) -> bool {
    name.starts_with("\\\\.\\")
}

fn resolve_display_name(name: &str, monitor_index: usize) -> String {
    if cfg!(target_os = "windows") && is_windows_device_path(name) {
        return format!("Display {}", monitor_index + 1);
    }

    name.to_string()
}

fn read_saved_main_monitor_key(app: &AppHandle) -> Option<String> {
    app.state::<AppState>()
        .saved_main_monitor_key
        .lock()
        .ok()
        .and_then(|locked| locked.clone())
}

fn set_saved_main_monitor_key(app: &AppHandle, next: Option<String>) {
    if let Ok(mut locked) = app.state::<AppState>().saved_main_monitor_key.lock() {
        *locked = next;
    }
}

fn monitor_label(monitor: &Monitor) -> String {
    monitor
        .name()
        .cloned()
        .unwrap_or_else(|| String::from("Unnamed Monitor"))
}

fn format_monitor_debug_line(index: usize, monitor: &Monitor) -> String {
    let name = monitor_label(monitor);
    let position = monitor.position();
    let size = monitor.size();
    let scale = monitor.scale_factor().max(0.0001);
    let logical_width = (size.width as f64 / scale).round() as i32;
    let logical_height = (size.height as f64 / scale).round() as i32;

    format!(
        "  [{index}] name=\"{}\" physical={}x{} scale={:.4} pos={},{} logical={}x{}",
        name, size.width, size.height, scale, position.x, position.y, logical_width, logical_height
    )
}

fn format_single_monitor_debug_line(monitor: Option<&Monitor>) -> String {
    let Some(monitor) = monitor else {
        return String::from("  <none>");
    };

    let name = monitor_label(monitor);
    let size = monitor.size();
    let scale = monitor.scale_factor().max(0.0001);
    format!(
        "  name=\"{}\" physical={}x{} scale={:.4}",
        name, size.width, size.height, scale
    )
}

#[derive(Debug, Clone)]
struct MonitorDescriptor {
    id: String,
    name: String,
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    scale_factor: f64,
    primary: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MonitorSelection {
    name: String,
    width: u32,
    height: u32,
    position_x: Option<i32>,
    position_y: Option<i32>,
}

impl MonitorSelection {
    fn to_key(&self) -> String {
        match (self.position_x, self.position_y) {
            (Some(position_x), Some(position_y)) => monitor_composite_key(
                self.name.as_str(),
                self.width,
                self.height,
                position_x,
                position_y,
            ),
            _ => format!("{}|{}x{}", self.name, self.width, self.height),
        }
    }
}

fn monitor_key(monitor: &Monitor) -> String {
    let label = monitor_label(monitor);
    let position = monitor.position();
    let size = monitor.size();
    let scale = monitor.scale_factor();
    format!(
        "{}|{}:{}|{}x{}|sf:{:.4}",
        label, position.x, position.y, size.width, size.height, scale
    )
}

fn monitor_descriptor_selection_key(monitor: &MonitorDescriptor) -> String {
    monitor_composite_key(
        monitor.name.as_str(),
        monitor.size.width,
        monitor.size.height,
        monitor.position.x,
        monitor.position.y,
    )
}

fn monitor_info_from_descriptor(monitor: &MonitorDescriptor) -> MonitorInfo {
    MonitorInfo {
        id: monitor.id.clone(),
        name: monitor.name.clone(),
        size: format!("{}x{}", monitor.size.width, monitor.size.height),
        origin: format!("{},{}", monitor.position.x, monitor.position.y),
        primary: monitor.primary,
    }
}

fn monitor_geometry_key(position: PhysicalPosition<i32>, size: PhysicalSize<u32>) -> String {
    format!(
        "{}:{}|{}x{}",
        position.x, position.y, size.width, size.height
    )
}

fn collect_tauri_monitors(app: &AppHandle) -> Result<Vec<Monitor>, String> {
    let main_window = app.get_webview_window("main");
    let mut all_monitors = if let Some(main_window) = &main_window {
        main_window
            .available_monitors()
            .map_err(|error| error.to_string())?
    } else {
        app.available_monitors()
            .map_err(|error| error.to_string())?
    };

    // Work around tao macOS monitor enumeration quirks by merging multiple sources.
    // `available_monitors` can be context-sensitive; primary/current help preserve
    // stable coverage for the monitor currently hosting the window and the primary display.
    if let Some(primary) = app.primary_monitor().map_err(|error| error.to_string())? {
        all_monitors.push(primary);
    }

    if let Some(main_window) = &main_window {
        if let Some(current) = main_window
            .current_monitor()
            .map_err(|error| error.to_string())?
        {
            all_monitors.push(current);
        }
    }

    let mut deduped = HashMap::<String, Monitor>::new();
    for monitor in all_monitors {
        let key = monitor_geometry_key(*monitor.position(), *monitor.size());
        deduped.entry(key).or_insert(monitor);
    }

    let mut monitors = deduped.into_values().collect::<Vec<_>>();
    monitors.sort_by_key(|monitor| {
        let position = monitor.position();
        (position.x, position.y)
    });
    Ok(monitors)
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct CgPoint {
    x: f64,
    y: f64,
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct CgSize {
    width: f64,
    height: f64,
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct CgRect {
    origin: CgPoint,
    size: CgSize,
}

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn CGGetActiveDisplayList(
        max_displays: u32,
        active_displays: *mut u32,
        display_count: *mut u32,
    ) -> i32;
    fn CGMainDisplayID() -> u32;
    fn CGDisplayBounds(display: u32) -> CgRect;
    fn CGDisplayIsBuiltin(display: u32) -> u32;
}

fn monitor_matches_identifier(monitor: &MonitorDescriptor, target: &str) -> bool {
    if monitor.id == target || monitor.name == target {
        return true;
    }

    if let Some(selection) = parse_monitor_selection_key(target) {
        let is_size_match =
            monitor.size.width == selection.width && monitor.size.height == selection.height;
        if !is_size_match {
            return false;
        }

        if let (Some(position_x), Some(position_y)) = (selection.position_x, selection.position_y) {
            return monitor.position.x == position_x && monitor.position.y == position_y;
        }

        return monitor.name == selection.name;
    }

    let Some((x, y, width, height)) = parse_monitor_geometry_from_key(target) else {
        return false;
    };

    monitor.position.x == x
        && monitor.position.y == y
        && monitor.size.width == width
        && monitor.size.height == height
}

fn parse_monitor_geometry_from_key(value: &str) -> Option<(i32, i32, u32, u32)> {
    let mut parts = value.split('|');
    let _label = parts.next()?;
    let position_part = parts.next()?;
    let size_part = parts.next()?;
    let (x, y) = position_part.split_once(':')?;
    let (width, height) = size_part.split_once('x')?;

    Some((
        x.parse().ok()?,
        y.parse().ok()?,
        width.parse().ok()?,
        height.parse().ok()?,
    ))
}

fn collect_monitor_descriptors(app: &AppHandle) -> Result<Vec<MonitorDescriptor>, String> {
    let tauri_monitors = collect_tauri_monitors(app)?;
    let primary_key = app
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .as_ref()
        .map(monitor_key);

    #[allow(unused_mut)]
    let mut descriptors = tauri_monitors
        .into_iter()
        .map(|monitor| {
            let id = monitor_key(&monitor);
            let name = monitor_label(&monitor);
            let position = *monitor.position();
            let size = *monitor.size();
            let primary = primary_key.as_ref().is_some_and(|key| key == &id);
            MonitorDescriptor {
                id,
                name,
                position,
                size,
                scale_factor: monitor.scale_factor(),
                primary,
            }
        })
        .collect::<Vec<_>>();

    #[cfg(target_os = "macos")]
    if let Ok(fallback_monitors) = collect_macos_monitor_descriptors() {
        // CoreGraphics uses a different source than Tauri and can report display geometry in
        // a coordinate space that does not match Tauri's values exactly. Merging both sources
        // may create duplicate pseudo-monitors. Use fallback only when Tauri under-reports.
        if descriptors.len() <= 1 && fallback_monitors.len() > descriptors.len() {
            descriptors = fallback_monitors;
        }
    }

    let mut unique = HashMap::<String, MonitorDescriptor>::new();
    for monitor in descriptors {
        let key = monitor_geometry_key(monitor.position, monitor.size);
        unique
            .entry(key)
            .and_modify(|existing| {
                existing.primary = existing.primary || monitor.primary;
                if existing.name == "Unnamed Monitor"
                    || existing.name.starts_with("Monitor #")
                    || existing.name.starts_with("Display ")
                {
                    existing.name = monitor.name.clone();
                }
                if existing.id.starts_with("macos-display:")
                    && !monitor.id.starts_with("macos-display:")
                {
                    existing.id = monitor.id.clone();
                }
                if existing.scale_factor <= 0.0 {
                    existing.scale_factor = monitor.scale_factor;
                }
            })
            .or_insert(monitor);
    }

    let mut monitors = unique.into_values().collect::<Vec<_>>();
    monitors.sort_by_key(|monitor| (monitor.position.x, monitor.position.y));

    let mut fallback_index = 1_u32;
    for monitor in &mut monitors {
        if monitor.name.trim().is_empty() {
            monitor.name = format!("Display {fallback_index}");
            fallback_index += 1;
        }
    }

    Ok(monitors)
}

#[cfg(target_os = "macos")]
fn collect_macos_monitor_descriptors() -> Result<Vec<MonitorDescriptor>, String> {
    const SUCCESS: i32 = 0;
    let mut monitor_count = 0_u32;
    let count_error =
        unsafe { CGGetActiveDisplayList(0, std::ptr::null_mut(), &mut monitor_count) };
    if count_error != SUCCESS {
        return Err(format!(
            "CGGetActiveDisplayList(count) failed with code {count_error}"
        ));
    }

    if monitor_count == 0 {
        return Ok(Vec::new());
    }

    let mut display_ids = vec![0_u32; monitor_count as usize];
    let list_error = unsafe {
        CGGetActiveDisplayList(monitor_count, display_ids.as_mut_ptr(), &mut monitor_count)
    };
    if list_error != SUCCESS {
        return Err(format!(
            "CGGetActiveDisplayList(list) failed with code {list_error}"
        ));
    }
    display_ids.truncate(monitor_count as usize);

    let main_display_id = unsafe { CGMainDisplayID() };
    let monitors = display_ids
        .into_iter()
        .map(|display_id| {
            let bounds = unsafe { CGDisplayBounds(display_id) };
            let builtin = unsafe { CGDisplayIsBuiltin(display_id) != 0 };
            let x = bounds.origin.x.round() as i32;
            let y = bounds.origin.y.round() as i32;
            let width = bounds.size.width.round().max(1.0) as u32;
            let height = bounds.size.height.round().max(1.0) as u32;

            MonitorDescriptor {
                id: format!("macos-display:{display_id}"),
                name: if builtin {
                    String::from("Built-in Display")
                } else {
                    format!("Display {display_id}")
                },
                position: PhysicalPosition::new(x, y),
                size: PhysicalSize::new(width, height),
                scale_factor: 1.0,
                primary: display_id == main_display_id,
            }
        })
        .collect::<Vec<_>>();

    Ok(monitors)
}

fn find_monitor_by_id_or_label(
    monitors: &[MonitorDescriptor],
    target: &str,
) -> Option<MonitorDescriptor> {
    monitors
        .iter()
        .find(|monitor| monitor_matches_identifier(monitor, target))
        .cloned()
}

fn parse_monitor_selection_key(value: &str) -> Option<MonitorSelection> {
    fn parse_size_segment(value: &str) -> Option<(u32, u32)> {
        let (width, height) = value.split_once('x')?;
        Some((width.trim().parse().ok()?, height.trim().parse().ok()?))
    }

    fn parse_position_segment(value: &str) -> Option<(i32, i32)> {
        let (x, y) = value.split_once(',')?;
        Some((x.trim().parse().ok()?, y.trim().parse().ok()?))
    }

    fn parse_runtime_position_segment(value: &str) -> Option<(i32, i32)> {
        let (x, y) = value.split_once(':')?;
        Some((x.trim().parse().ok()?, y.trim().parse().ok()?))
    }

    if let Some((prefix, position_segment)) = value.rsplit_once('|') {
        if let Some((position_x, position_y)) = parse_position_segment(position_segment) {
            if let Some((name, size_segment)) = prefix.rsplit_once('|') {
                if !name.trim().is_empty() {
                    if let Some((width, height)) = parse_size_segment(size_segment) {
                        return Some(MonitorSelection {
                            name: name.to_string(),
                            width,
                            height,
                            position_x: Some(position_x),
                            position_y: Some(position_y),
                        });
                    }
                }
            }
        }
    }

    if let Some((name, size_segment)) = value.rsplit_once('|') {
        if !name.trim().is_empty() {
            if let Some((width, height)) = parse_size_segment(size_segment) {
                return Some(MonitorSelection {
                    name: name.to_string(),
                    width,
                    height,
                    position_x: None,
                    position_y: None,
                });
            }
        }
    }

    let parts = value.split('|').collect::<Vec<_>>();
    if parts.len() >= 4 {
        let size_index = parts.len() - 2;
        if let Some((width, height)) = parse_size_segment(parts[size_index]) {
            let runtime_position_index = size_index - 1;
            if let Some((position_x, position_y)) =
                parse_runtime_position_segment(parts[runtime_position_index])
            {
                let name = parts[..runtime_position_index].join("|");
                if !name.trim().is_empty() {
                    return Some(MonitorSelection {
                        name,
                        width,
                        height,
                        position_x: Some(position_x),
                        position_y: Some(position_y),
                    });
                }
            }
        }
    }

    None
}

#[cfg(test)]
fn monitor_contains_point(monitor: &MonitorDescriptor, x: i32, y: i32) -> bool {
    let max_x = monitor.position.x + monitor.size.width as i32;
    let max_y = monitor.position.y + monitor.size.height as i32;

    x >= monitor.position.x && x < max_x && y >= monitor.position.y && y < max_y
}

#[cfg(test)]
fn is_bounds_inside_monitor(bounds: &OverlayBounds, monitor: &MonitorDescriptor) -> bool {
    if bounds.width <= 0.0 || bounds.height <= 0.0 {
        return false;
    }

    let x = bounds.x.round() as i32;
    let y = bounds.y.round() as i32;
    let width = bounds.width.round() as i32;
    let height = bounds.height.round() as i32;
    let right = x + width;
    let bottom = y + height;
    let monitor_right = monitor.position.x + monitor.size.width as i32;
    let monitor_bottom = monitor.position.y + monitor.size.height as i32;

    x >= monitor.position.x
        && y >= monitor.position.y
        && right <= monitor_right
        && bottom <= monitor_bottom
}

fn clamp_to_monitor(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    monitor: &MonitorDescriptor,
) -> (i32, i32) {
    let max_x = monitor.position.x + (monitor.size.width as i32 - width).max(0);
    let max_y = monitor.position.y + (monitor.size.height as i32 - height).max(0);

    (
        x.clamp(monitor.position.x, max_x),
        y.clamp(monitor.position.y, max_y),
    )
}

fn top_center_position_for_monitor(
    monitor: &MonitorDescriptor,
    width: i32,
    height: i32,
) -> (i32, i32) {
    let centered_x = monitor.position.x + ((monitor.size.width as i32 - width) / 2);
    let top_y = monitor.position.y;
    clamp_to_monitor(centered_x, top_y, width, height, monitor)
}

fn top_center_logical_position_for_monitor(
    monitor: &MonitorDescriptor,
    window_width: u32,
    window_scale_factor: f64,
) -> (f64, f64) {
    let monitor_scale = monitor.scale_factor.max(0.0001);
    let window_scale = window_scale_factor.max(0.0001);
    let monitor_logical_x = monitor.position.x as f64;
    let monitor_logical_y = monitor.position.y as f64;
    let monitor_logical_width = monitor.size.width as f64 / monitor_scale;
    let window_logical_width = window_width as f64 / window_scale;
    let logical_x = monitor_logical_x + ((monitor_logical_width - window_logical_width) / 2.0);
    (logical_x, monitor_logical_y)
}

fn position_window_on_monitor(
    window: &tauri::WebviewWindow,
    monitor: &Monitor,
    pin_to_top: bool,
) -> Result<(i32, i32), String> {
    let inner_size = window.inner_size().map_err(|error| error.to_string())?;
    let window_scale = window
        .scale_factor()
        .map_err(|error| error.to_string())?
        .max(0.0001);
    let monitor_scale = monitor.scale_factor().max(0.0001);
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();

    let monitor_logical_x = monitor_position.x as f64;
    let monitor_logical_y = monitor_position.y as f64;
    let monitor_logical_width = monitor_size.width as f64 / monitor_scale;
    let monitor_logical_height = monitor_size.height as f64 / monitor_scale;
    let window_logical_width = inner_size.width as f64 / window_scale;
    let window_logical_height = inner_size.height as f64 / window_scale;

    let target_x = monitor_logical_x + (monitor_logical_width / 2.0) - (window_logical_width / 2.0);
    let target_y = if pin_to_top {
        monitor_logical_y
    } else {
        monitor_logical_y + (monitor_logical_height / 2.0) - (window_logical_height / 2.0)
    };
    let rounded_x = target_x.round();
    let rounded_y = target_y.round();

    window
        .set_position(Position::Logical(LogicalPosition::new(
            rounded_x, rounded_y,
        )))
        .map_err(|error| error.to_string())?;
    std::thread::sleep(Duration::from_millis(MAIN_WINDOW_MOVE_SETTLE_MS));
    window
        .set_size(Size::Physical(inner_size))
        .map_err(|error| error.to_string())?;
    let _ = window.set_focus();

    Ok((rounded_x as i32, rounded_y as i32))
}

fn top_center_window_on_monitor(
    window: &tauri::WebviewWindow,
    monitor: &Monitor,
) -> Result<(i32, i32), String> {
    position_window_on_monitor(window, monitor, true)
}

#[cfg(test)]
fn window_center_x(position_x: i32, window_width: u32) -> i32 {
    position_x + (window_width as i32 / 2)
}

#[cfg(test)]
fn center_x_error_from_target(position_x: i32, window_width: u32, target_x: i32) -> i32 {
    let target_center_x = window_center_x(target_x, window_width);
    let actual_center_x = window_center_x(position_x, window_width);
    target_center_x - actual_center_x
}

#[cfg(test)]
fn window_center_is_on_monitor(
    monitor: &MonitorDescriptor,
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
) -> bool {
    let center_x = window_center_x(position.x, size.width);
    let center_y = position.y + (size.height as i32 / 2);
    monitor_contains_point(monitor, center_x, center_y)
}

fn runtime_monitor_matches_descriptor(
    monitor: &MonitorDescriptor,
    runtime_monitor: &Monitor,
) -> bool {
    let position = *runtime_monitor.position();
    let size = *runtime_monitor.size();
    monitor.position == position
        && monitor.size == size
        && (monitor.id == monitor_key(runtime_monitor)
            || monitor.name == monitor_label(runtime_monitor))
}

fn main_window_is_on_monitor(
    main_window: &tauri::WebviewWindow,
    monitor: &MonitorDescriptor,
) -> bool {
    main_window
        .current_monitor()
        .ok()
        .flatten()
        .is_some_and(|runtime_monitor| {
            runtime_monitor_matches_descriptor(monitor, &runtime_monitor)
        })
}

fn set_main_window_position_and_settle(
    main_window: &tauri::WebviewWindow,
    position: Position,
) -> Result<(), String> {
    main_window
        .set_position(position)
        .map_err(|error| error.to_string())?;
    std::thread::sleep(Duration::from_millis(MAIN_WINDOW_MOVE_SETTLE_MS));
    Ok(())
}

fn resolve_main_window_monitor_selection(
    monitors: &[MonitorDescriptor],
    monitor_selection: Option<&MonitorSelection>,
    monitor_identifier: &str,
) -> Option<MonitorDescriptor> {
    if let Some(selection) = monitor_selection {
        if let (Some(position_x), Some(position_y)) = (selection.position_x, selection.position_y) {
            if let Some(found) = monitors.iter().find(|monitor| {
                monitor.name == selection.name
                    && monitor.size.width == selection.width
                    && monitor.size.height == selection.height
                    && monitor.position.x == position_x
                    && monitor.position.y == position_y
            }) {
                return Some(found.clone());
            }

            if let Some(found) = monitors.iter().find(|monitor| {
                monitor.size.width == selection.width
                    && monitor.size.height == selection.height
                    && monitor.position.x == position_x
                    && monitor.position.y == position_y
            }) {
                return Some(found.clone());
            }
        }

        if let Some(found) = monitors.iter().find(|monitor| {
            monitor.name == selection.name
                && monitor.size.width == selection.width
                && monitor.size.height == selection.height
        }) {
            return Some(found.clone());
        }

        if let Some(found) = monitors
            .iter()
            .find(|monitor| monitor.name == selection.name)
            .cloned()
        {
            return Some(found);
        }
    }

    monitors
        .iter()
        .find(|monitor| monitor_matches_identifier(monitor, monitor_identifier))
        .cloned()
        .or_else(|| monitors.iter().find(|monitor| monitor.primary).cloned())
        .or_else(|| monitors.first().cloned())
}

fn move_main_window_to_monitor_selection(
    main_window: &tauri::WebviewWindow,
    monitor_identifier: &str,
) -> Result<MonitorDescriptor, String> {
    let monitors = collect_monitor_descriptors(&main_window.app_handle())?;
    let parsed_selection = parse_monitor_selection_key(monitor_identifier);
    let target_monitor = resolve_main_window_monitor_selection(
        &monitors,
        parsed_selection.as_ref(),
        monitor_identifier,
    )
    .ok_or_else(|| String::from("No monitors available"))?;

    let current_inner_size = main_window
        .inner_size()
        .map_err(|error| error.to_string())?;
    let current_window_scale = main_window
        .scale_factor()
        .map_err(|error| error.to_string())?
        .max(0.0001);

    let monitor_scale = target_monitor.scale_factor.max(0.0001);
    let monitor_logical_width = target_monitor.size.width as f64 / monitor_scale;
    let monitor_logical_height = target_monitor.size.height as f64 / monitor_scale;
    let window_logical_width = current_inner_size.width as f64 / current_window_scale;
    let window_logical_height = current_inner_size.height as f64 / current_window_scale;

    let target_logical_x =
        target_monitor.position.x as f64 + ((monitor_logical_width - window_logical_width) / 2.0);
    let target_logical_y =
        target_monitor.position.y as f64 + ((monitor_logical_height - window_logical_height) / 2.0);
    let rounded_x = target_logical_x.round();
    let rounded_y = target_logical_y.round();

    if monitor_debug_enabled() {
        monitor_debug_log(format!(
            "[move_window_to_monitor] matched monitor: name=\"{}\" pos={},{} size={}x{} scale={:.4}",
            target_monitor.name,
            target_monitor.position.x,
            target_monitor.position.y,
            target_monitor.size.width,
            target_monitor.size.height,
            target_monitor.scale_factor
        ));
        monitor_debug_log(format!(
            "[move_window_to_monitor] window current logical size: {}x{}",
            window_logical_width.round() as i32,
            window_logical_height.round() as i32
        ));
        monitor_debug_log(format!(
            "[move_window_to_monitor] computed target LogicalPosition: x={}+({}-{})/2={}, y={}+({}-{})/2={}",
            target_monitor.position.x,
            monitor_logical_width.round() as i32,
            window_logical_width.round() as i32,
            rounded_x as i32,
            target_monitor.position.y,
            monitor_logical_height.round() as i32,
            window_logical_height.round() as i32,
            rounded_y as i32
        ));
        monitor_debug_log(format!(
            "[move_window_to_monitor] calling set_position(LogicalPosition {{ x: {}, y: {} }})",
            rounded_x as i32, rounded_y as i32
        ));
    }

    main_window
        .set_position(Position::Logical(LogicalPosition::new(
            rounded_x, rounded_y,
        )))
        .map_err(|error| error.to_string())?;
    std::thread::sleep(Duration::from_millis(MAIN_WINDOW_MOVE_SETTLE_MS));
    main_window
        .set_size(Size::Physical(current_inner_size))
        .map_err(|error| error.to_string())?;
    main_window.set_focus().map_err(|error| error.to_string())?;

    Ok(target_monitor)
}

fn move_main_window_to_monitor(
    main_window: &tauri::WebviewWindow,
    monitor: &MonitorDescriptor,
) -> Result<(), String> {
    let current_size = main_window
        .outer_size()
        .map_err(|error| error.to_string())?;
    let current_scale = main_window
        .scale_factor()
        .map_err(|error| error.to_string())?
        .max(0.0001);
    let width = current_size.width as i32;
    let height = current_size.height as i32;
    let (target_x, target_y) = top_center_position_for_monitor(monitor, width, height);
    let source_monitor_scale = main_window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .map(|current_monitor| current_monitor.scale_factor())
        .unwrap_or(current_scale)
        .max(0.0001);

    // 1) Force-enter the target monitor using logical origin coordinates.
    set_main_window_position_and_settle(
        main_window,
        Position::Logical(LogicalPosition::new(
            monitor.position.x as f64 + 8.0,
            monitor.position.y as f64,
        )),
    )?;

    // 2) If still not on target, try centered logical placement based on source scale.
    if !main_window_is_on_monitor(main_window, monitor) {
        let (logical_x, logical_y) = top_center_logical_position_for_monitor(
            monitor,
            current_size.width,
            source_monitor_scale,
        );
        set_main_window_position_and_settle(
            main_window,
            Position::Logical(LogicalPosition::new(logical_x.round(), logical_y.round())),
        )?;
    }

    // 3) Physical fallback with direct monitor geometry.
    if !main_window_is_on_monitor(main_window, monitor) {
        set_main_window_position_and_settle(
            main_window,
            Position::Physical(PhysicalPosition::new(target_x, target_y)),
        )?;
    }

    // 4) Physical fallback assuming monitor origin is reported in source-monitor points.
    if !main_window_is_on_monitor(main_window, monitor) {
        let scaled_origin_x = (monitor.position.x as f64 * source_monitor_scale).round() as i32;
        let scaled_origin_y = (monitor.position.y as f64 * source_monitor_scale).round() as i32;
        let scaled_target_x = scaled_origin_x + ((monitor.size.width as i32 - width) / 2);
        set_main_window_position_and_settle(
            main_window,
            Position::Physical(PhysicalPosition::new(scaled_target_x, scaled_origin_y)),
        )?;
    }

    if !main_window_is_on_monitor(main_window, monitor) {
        return Err(String::from(
            "Unable to move main window to selected monitor",
        ));
    }

    // Once we are on target, center with target scale to avoid mixed-DPI drift.
    let (final_logical_x, final_logical_y) =
        top_center_logical_position_for_monitor(monitor, current_size.width, monitor.scale_factor);
    set_main_window_position_and_settle(
        main_window,
        Position::Logical(LogicalPosition::new(
            final_logical_x.round(),
            final_logical_y.round(),
        )),
    )?;

    if !main_window_is_on_monitor(main_window, monitor) {
        return Err(String::from(
            "Main window moved away from selected monitor during centering",
        ));
    }

    Ok(())
}

#[cfg(test)]
fn resolve_monitor_for_point_or_primary(
    monitors: &[MonitorDescriptor],
    x: i32,
    y: i32,
) -> Option<MonitorDescriptor> {
    monitors
        .iter()
        .find(|monitor| monitor_contains_point(monitor, x, y))
        .cloned()
        .or_else(|| monitors.iter().find(|monitor| monitor.primary).cloned())
        .or_else(|| monitors.first().cloned())
}

fn normalize_main_window_state(main_window: &tauri::WebviewWindow) -> Result<(), String> {
    if main_window
        .is_fullscreen()
        .map_err(|error| error.to_string())?
    {
        main_window
            .set_fullscreen(false)
            .map_err(|error| error.to_string())?;
    }

    if main_window
        .is_maximized()
        .map_err(|error| error.to_string())?
    {
        main_window
            .unmaximize()
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn recover_overlay_focus_inner(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("Overlay window is not available"))?;

    // On macOS/Windows dragging can transiently drop focus. Try a few times
    // before giving up to make shortcut handling deterministic.
    let retry_delays_ms = [0_u64, 40, 120, 240];
    let mut last_focus_error: Option<String> = None;

    for delay in retry_delays_ms {
        if delay > 0 {
            std::thread::sleep(Duration::from_millis(delay));
        }

        match overlay.set_focus() {
            Ok(()) => {
                let bindings = state
                    .active_bindings
                    .lock()
                    .map(|locked| locked.clone())
                    .unwrap_or_default();
                if !bindings.is_empty() {
                    let _ = apply_bindings(app, &bindings, state);
                }
                return Ok(());
            }
            Err(error) => {
                last_focus_error = Some(error.to_string());
            }
        }
    }

    Err(last_focus_error.unwrap_or_else(|| String::from("Failed to recover overlay focus")))
}

fn normalize_shortcut_text(value: &str) -> String {
    value.to_lowercase().replace(' ', "")
}

fn is_os_reserved_shortcut(accelerator: &str) -> bool {
    let normalized = normalize_shortcut_text(accelerator);
    let reserved = [
        "cmdorctrl+c",
        "cmdorctrl+v",
        "cmdorctrl+x",
        "cmdorctrl+z",
        "cmdorctrl+q",
        "cmdorctrl+w",
        "cmdorctrl+tab",
        "cmd+c",
        "cmd+v",
        "cmd+x",
        "cmd+z",
        "cmd+q",
        "cmd+w",
        "cmd+tab",
        "ctrl+c",
        "ctrl+v",
        "ctrl+x",
        "ctrl+z",
        "ctrl+q",
        "ctrl+w",
        "ctrl+tab",
        "alt+tab",
        "super+tab",
    ];
    reserved
        .iter()
        .any(|&r| normalize_shortcut_text(r) == normalized)
}

fn binding_to_shortcut_action(action: &str) -> Result<ShortcutAction, String> {
    if action == HIDE_OVERLAY_ACTION || action == LEGACY_TOGGLE_OVERLAY_ACTION {
        return Ok(ShortcutAction {
            action: String::from(HIDE_OVERLAY_ACTION),
            index: None,
            delta: None,
        });
    }

    if action == "toggle-play" {
        return Ok(ShortcutAction {
            action: String::from("toggle-play"),
            index: None,
            delta: None,
        });
    }

    if action == "snap-to-center" {
        return Ok(ShortcutAction {
            action: String::from("snap-to-center"),
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

    if action == "toggle-controls" {
        return Ok(ShortcutAction {
            action: String::from("toggle-controls"),
            index: None,
            delta: None,
        });
    }

    Err(format!("Unsupported shortcut action '{}'", action))
}

fn default_shortcut_bindings() -> Vec<ShortcutBinding> {
    vec![
        ShortcutBinding {
            action: String::from(HIDE_OVERLAY_ACTION),
            accelerator: String::from(HIDE_OVERLAY_DEFAULT_ACCELERATOR),
        },
        ShortcutBinding {
            action: String::from("toggle-play"),
            accelerator: String::from("Space"),
        },
        ShortcutBinding {
            action: String::from("snap-to-center"),
            accelerator: String::from("CmdOrCtrl+Shift+L"),
        },
        ShortcutBinding {
            action: String::from("toggle-controls"),
            accelerator: String::from("CmdOrCtrl+J"),
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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_monitor(
        id: &str,
        name: &str,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
        primary: bool,
    ) -> MonitorDescriptor {
        make_monitor_with_scale(id, name, x, y, width, height, 1.0, primary)
    }

    fn make_monitor_with_scale(
        id: &str,
        name: &str,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
        scale_factor: f64,
        primary: bool,
    ) -> MonitorDescriptor {
        MonitorDescriptor {
            id: id.to_string(),
            name: name.to_string(),
            position: PhysicalPosition::new(x, y),
            size: PhysicalSize::new(width, height),
            scale_factor,
            primary,
        }
    }

    #[test]
    fn test_binding_to_shortcut_action_maps_supported_actions() {
        let toggle = binding_to_shortcut_action("toggle-play").unwrap();
        assert_eq!(toggle.action, "toggle-play");
        assert_eq!(toggle.index, None);
        assert_eq!(toggle.delta, None);

        let jump = binding_to_shortcut_action("jump-9").unwrap();
        assert_eq!(jump.action, "jump-section");
        assert_eq!(jump.index, Some(8));
        assert_eq!(jump.delta, None);

        let speed_up = binding_to_shortcut_action("speed-up").unwrap();
        assert_eq!(speed_up.action, "speed-change");
        assert_eq!(speed_up.delta, Some(1));

        let snap_to_center = binding_to_shortcut_action("snap-to-center").unwrap();
        assert_eq!(snap_to_center.action, "snap-to-center");
        assert_eq!(snap_to_center.index, None);
        assert_eq!(snap_to_center.delta, None);
    }

    #[test]
    fn test_binding_to_shortcut_action_rejects_unsupported_jump_values() {
        let jump_zero = binding_to_shortcut_action("jump-0");
        assert!(jump_zero.is_err());

        let jump_ten = binding_to_shortcut_action("jump-10");
        assert!(jump_ten.is_err());
    }

    #[test]
    fn test_reserved_shortcut_detection_is_robust() {
        assert!(is_os_reserved_shortcut("CmdOrCtrl+C"));
        assert!(is_os_reserved_shortcut(" cmd + tab "));
        assert!(is_os_reserved_shortcut("CTRL+W"));
        assert!(!is_os_reserved_shortcut("CmdOrCtrl+1"));
    }

    #[test]
    fn test_shortcut_text_normalization() {
        assert_eq!(normalize_shortcut_text(" Cmd + Shift + S "), "cmd+shift+s");
        assert_eq!(normalize_shortcut_text("Ctrl+Tab"), "ctrl+tab");
    }

    #[test]
    fn test_parse_monitor_geometry_from_key() {
        assert_eq!(
            parse_monitor_geometry_from_key("Display A|10:20|1920x1080|sf:2.0000"),
            Some((10, 20, 1920, 1080))
        );
        assert_eq!(parse_monitor_geometry_from_key("bad-key"), None);
        assert_eq!(
            parse_monitor_geometry_from_key("Display A|x:y|1920x1080|sf:1.0000"),
            None
        );
    }

    #[test]
    fn test_parse_monitor_selection_key_supports_new_legacy_and_runtime_formats() {
        assert_eq!(
            parse_monitor_selection_key("Display A|3024x1964|0,0"),
            Some(MonitorSelection {
                name: String::from("Display A"),
                width: 3024,
                height: 1964,
                position_x: Some(0),
                position_y: Some(0),
            })
        );

        assert_eq!(
            parse_monitor_selection_key("Display B|1920x1080"),
            Some(MonitorSelection {
                name: String::from("Display B"),
                width: 1920,
                height: 1080,
                position_x: None,
                position_y: None,
            })
        );

        assert_eq!(
            parse_monitor_selection_key("Display C|3840:0|1920x1080|sf:1.0000"),
            Some(MonitorSelection {
                name: String::from("Display C"),
                width: 1920,
                height: 1080,
                position_x: Some(3840),
                position_y: Some(0),
            })
        );
    }

    #[test]
    fn test_resolve_main_window_restore_monitor_key_prefers_explicit_when_valid() {
        let resolved = resolve_main_window_restore_monitor_key(
            Some("Display A|3024x1964|0,0"),
            Some("Display B|1920x1080|1920,0"),
        );

        assert_eq!(resolved, Some(String::from("Display A|3024x1964|0,0")));
    }

    #[test]
    fn test_resolve_main_window_restore_monitor_key_uses_tracked_when_explicit_missing() {
        let resolved =
            resolve_main_window_restore_monitor_key(None, Some("Display B|1920x1080|1920,0"));

        assert_eq!(resolved, Some(String::from("Display B|1920x1080|1920,0")));
    }

    #[test]
    fn test_resolve_main_window_restore_monitor_key_uses_tracked_when_explicit_invalid() {
        let resolved = resolve_main_window_restore_monitor_key(
            Some("invalid-key"),
            Some("Display B|1920x1080|1920,0"),
        );

        assert_eq!(resolved, Some(String::from("Display B|1920x1080|1920,0")));
    }

    #[test]
    fn test_resolve_main_window_restore_monitor_key_returns_none_when_both_invalid() {
        let resolved = resolve_main_window_restore_monitor_key(
            Some("invalid-explicit"),
            Some("invalid-tracked"),
        );

        assert_eq!(resolved, None);
    }

    #[test]
    fn test_monitor_selection_key_from_parts_matches_expected_format() {
        let key = monitor_selection_key_from_parts(
            "Built-in Retina Display",
            PhysicalSize::new(3024, 1964),
            PhysicalPosition::new(0, 0),
        );

        assert_eq!(key, "Built-in Retina Display|3024x1964|0,0");
    }

    #[test]
    fn test_monitor_matches_identifier_by_id_name_and_geometry() {
        let monitor = make_monitor(
            "Display A|0:0|1920x1080|sf:2.0000",
            "Display A",
            0,
            0,
            1920,
            1080,
            true,
        );

        assert!(monitor_matches_identifier(
            &monitor,
            "Display A|0:0|1920x1080|sf:2.0000"
        ));
        assert!(monitor_matches_identifier(&monitor, "Display A"));
        assert!(monitor_matches_identifier(
            &monitor,
            "Legacy Label|0:0|1920x1080|sf:1.0000"
        ));
        assert!(!monitor_matches_identifier(
            &monitor,
            "Display A|10:10|1920x1080|sf:2.0000"
        ));
    }

    #[test]
    fn test_find_monitor_by_id_or_label_happy_and_fallback_cases() {
        let monitors = vec![
            make_monitor("id-a", "Display A", 0, 0, 1920, 1080, true),
            make_monitor("id-b", "Display B", 1920, 0, 1920, 1080, false),
        ];

        let by_name = find_monitor_by_id_or_label(&monitors, "Display B").unwrap();
        assert_eq!(by_name.id, "id-b");

        let by_geometry =
            find_monitor_by_id_or_label(&monitors, "Anything|1920:0|1920x1080|sf:1.0000").unwrap();
        assert_eq!(by_geometry.id, "id-b");

        assert!(find_monitor_by_id_or_label(&monitors, "Missing").is_none());
    }

    #[test]
    fn test_resolve_main_window_monitor_selection_prefers_position_when_available() {
        let monitors = vec![
            make_monitor("id-a", "Display A", 0, 0, 1920, 1080, true),
            make_monitor("id-b", "Display B", 1920, 0, 1920, 1080, false),
            make_monitor("id-c", "Display B", 3840, 0, 1920, 1080, false),
        ];

        let parsed = MonitorSelection {
            name: String::from("Display B"),
            width: 1920,
            height: 1080,
            position_x: Some(3840),
            position_y: Some(0),
        };

        let selected = resolve_main_window_monitor_selection(
            &monitors,
            Some(&parsed),
            parsed.to_key().as_str(),
        )
        .unwrap();
        assert_eq!(selected.id, "id-c");
    }

    #[test]
    fn test_monitor_contains_point_boundary_behavior() {
        let monitor = make_monitor("id-a", "Display A", 100, 200, 300, 400, true);

        assert!(monitor_contains_point(&monitor, 100, 200));
        assert!(monitor_contains_point(&monitor, 399, 599));
        assert!(!monitor_contains_point(&monitor, 400, 599));
        assert!(!monitor_contains_point(&monitor, 399, 600));
    }

    #[test]
    fn test_is_bounds_inside_monitor_checks_edges_and_non_positive_sizes() {
        let monitor = make_monitor("id-a", "Display A", 0, 0, 1000, 800, true);
        let inside = OverlayBounds {
            x: 10.0,
            y: 20.0,
            width: 400.0,
            height: 300.0,
        };
        let outside = OverlayBounds {
            x: 700.0,
            y: 550.0,
            width: 400.0,
            height: 300.0,
        };
        let invalid = OverlayBounds {
            x: 10.0,
            y: 10.0,
            width: 0.0,
            height: 300.0,
        };

        assert!(is_bounds_inside_monitor(&inside, &monitor));
        assert!(!is_bounds_inside_monitor(&outside, &monitor));
        assert!(!is_bounds_inside_monitor(&invalid, &monitor));
    }

    #[test]
    fn test_clamp_to_monitor_limits_coordinates_to_visible_area() {
        let monitor = make_monitor("id-a", "Display A", 0, 0, 1920, 1080, true);
        assert_eq!(clamp_to_monitor(-100, -200, 1200, 600, &monitor), (0, 0));
        assert_eq!(clamp_to_monitor(2000, 900, 1200, 600, &monitor), (720, 480));
    }

    #[test]
    fn test_top_center_position_helper_computes_expected_coordinates() {
        let monitor = make_monitor("id-a", "Display A", 100, 200, 1920, 1080, true);
        assert_eq!(
            top_center_position_for_monitor(&monitor, 1000, 400),
            (560, 200)
        );
    }

    #[test]
    fn test_top_center_logical_position_helper_handles_mixed_scale() {
        let monitor = make_monitor_with_scale("id-a", "Display A", 1470, 0, 2940, 1912, 2.0, true);
        let (logical_x, logical_y) = top_center_logical_position_for_monitor(&monitor, 1120, 2.0);

        assert_eq!(logical_x.round() as i32, 1925);
        assert_eq!(logical_y.round() as i32, 0);
    }

    #[test]
    fn test_top_center_logical_position_uses_current_window_scale_factor() {
        let external_monitor =
            make_monitor_with_scale("id-b", "Display B", 1470, 0, 1920, 1080, 1.0, false);
        let (logical_x, logical_y) =
            top_center_logical_position_for_monitor(&external_monitor, 2400, 2.0);

        assert_eq!(logical_x.round() as i32, 1830);
        assert_eq!(logical_y.round() as i32, 0);
    }

    #[test]
    fn test_center_x_error_detects_drift_for_correction_pass() {
        let target_x = 735;
        let window_width = 1120;
        let drifted_x = 760;
        assert_eq!(
            center_x_error_from_target(drifted_x, window_width, target_x),
            -25
        );
    }

    #[test]
    fn test_window_center_is_on_monitor_detects_monitor_mismatch_for_fallback() {
        let target_monitor = make_monitor("id-a", "Display A", 0, 0, 1920, 1080, true);
        let other_monitor_position = PhysicalPosition::new(2200, 120);
        let window_size = PhysicalSize::new(1200, 800);

        assert!(!window_center_is_on_monitor(
            &target_monitor,
            other_monitor_position,
            window_size
        ));
        assert!(window_center_is_on_monitor(
            &target_monitor,
            PhysicalPosition::new(100, 80),
            window_size
        ));
    }

    #[test]
    fn test_resolve_monitor_for_point_or_primary_branches() {
        let monitors = vec![
            make_monitor("id-a", "Display A", 0, 0, 1920, 1080, false),
            make_monitor("id-b", "Display B", 1920, 0, 1920, 1080, true),
        ];

        let by_point = resolve_monitor_for_point_or_primary(&monitors, 10, 10).unwrap();
        assert_eq!(by_point.id, "id-a");

        let by_primary = resolve_monitor_for_point_or_primary(&monitors, 5000, 5000).unwrap();
        assert_eq!(by_primary.id, "id-b");

        let fallback_first = resolve_monitor_for_point_or_primary(
            &[make_monitor("id-only", "Only", 0, 0, 800, 600, false)],
            9999,
            9999,
        )
        .unwrap();
        assert_eq!(fallback_first.id, "id-only");
    }

    #[test]
    fn test_resolve_glance_visibility_action_prefers_hide_then_restore() {
        assert_eq!(
            resolve_glance_visibility_action(true, true),
            GlanceVisibilityAction::HideAll
        );
        assert_eq!(
            resolve_glance_visibility_action(false, false),
            GlanceVisibilityAction::RestoreOverlay
        );
        assert_eq!(
            resolve_glance_visibility_action(false, true),
            GlanceVisibilityAction::Noop
        );
    }
}
