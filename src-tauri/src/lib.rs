mod overlay;
mod platform;
mod tray;
mod sticker_creation;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, ShortcutState};

static MAIN_SHOWN: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn main_ready(app: AppHandle) {
    MAIN_SHOWN.store(true, Ordering::SeqCst);
    show_main_window(app);
}

#[tauri::command]
fn show_main_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn overlay_ready(app: AppHandle) {
    overlay::ready(&app);
}

#[tauri::command]
fn set_overlay_rects(
    window: tauri::WebviewWindow,
    rects: Vec<overlay::RegionRect>,
    scale: f64,
    menu_open: Option<bool>,
) {
    overlay::set_rects(&window, rects, scale, menu_open.unwrap_or(false));
}

#[tauri::command]
fn set_overlay_dragging(window: tauri::WebviewWindow, dragging: bool) {
    overlay::set_dragging(&window, dragging);
}

#[tauri::command]
fn set_overlay_passthrough(app: AppHandle, enabled: bool) {
    overlay::set_passthrough(&app, enabled);
}

#[tauri::command]
fn set_overlay_visible(app: AppHandle, visible: bool) {
    overlay::set_visible(&app, visible);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn overlay_cursor(app: AppHandle) -> crate::platform::hit_test::CursorInfo {
    crate::platform::hit_test::cursor_info(&app)
}

#[tauri::command]
fn overlay_debug(app: AppHandle) -> Result<serde_json::Value, String> {
    let window = app
        .get_webview_window(overlay::PET_LABEL)
        .ok_or_else(|| "pet layer not created".to_string())?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let origin = window.outer_position().map_err(|error| error.to_string())?;
    let outer = window.outer_size().map_err(|error| error.to_string())?;
    let inner = window.inner_size().map_err(|error| error.to_string())?;
    let cursor = window.cursor_position().ok();
    let (visible, passthrough, dragging) = overlay::debug_flags();
    Ok(serde_json::json!({
        "scale": scale,
        "origin": [origin.x, origin.y],
        "outerSize": [outer.width, outer.height],
        "innerSize": [inner.width, inner.height],
        "cursor": cursor.map(|point| [point.x, point.y]),
        "visible": visible,
        "passthrough": passthrough,
        "dragging": dragging,
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed
                        && shortcut.matches(Modifiers::CONTROL | Modifiers::ALT, Code::KeyP)
                    {
                        let _ = app.emit("shortcut:toggle-passthrough", ());
                    }
                })
                .build(),
        )
        .setup(|app| {
            // A second instance or another app may already own the shortcut.
            // Failing to grab it must not prevent the pet from starting.
            if let Err(error) = app.global_shortcut().register("ctrl+alt+p") {
                eprintln!("[deskpet] global shortcut unavailable: {error}");
            }
            let handle = app.handle().clone();
            overlay::create(&handle)?;
            overlay::start_hit_test(handle.clone());

            if let Some(main) = app.get_webview_window("main") {
                let window = main.clone();
                main.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Closing the workspace keeps the pets alive on the desktop.
                        api.prevent_close();
                        let _ = window.hide();
                    }
                });
            }

            tray::create(&handle)?;

            // Safety net: never leave the app running with an invisible workspace
            // if the webview failed to report readiness.
            let fallback = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                if !MAIN_SHOWN.load(Ordering::SeqCst) {
                    show_main_window(fallback);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            main_ready,
            show_main_window,
            overlay_ready,
            set_overlay_rects,
            set_overlay_dragging,
            set_overlay_passthrough,
            set_overlay_visible,
            quit_app,
            tray::sync_tray_state,
            overlay_cursor,
            sticker_creation::save_created_sticker,
            sticker_creation::list_created_stickers,
            sticker_creation::delete_created_sticker,
            sticker_creation::prepare_cutout_model,
            sticker_creation::cutout_cpu,
            overlay_debug
        ])
        .run(tauri::generate_context!())
        .expect("error while running DeskPet");
}
