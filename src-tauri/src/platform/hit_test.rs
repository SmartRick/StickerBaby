//! Cursor hit testing for the sticker layers.
//!
//! Each full-screen transparent window always paints its stickers and is
//! click-through by default. A background thread polls the cursor and flips
//! `WS_EX_TRANSPARENT` off only while the cursor is inside an interactive
//! sticker (or the unlock button) of that window.
//!
//! No window region is used: a region moves with the stickers and would tear
//! their edges when it lags behind the rendered frame.

use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
#[cfg(any(target_os = "windows", target_os = "macos"))]
use std::thread;
#[cfg(any(target_os = "windows", target_os = "macos"))]
use std::time::Duration;
#[cfg(target_os = "windows")]
use tauri::Emitter;
use tauri::Manager;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    #[serde(default)]
    pub pad: f64,
}

struct HitState {
    visible: bool,
    passthrough: bool,
    pinned: bool,
    menu_open: bool,
    origin_x: i32,
    origin_y: i32,
    scale: f64,
    rects: Vec<HitRect>,
}

fn states() -> &'static Mutex<HashMap<String, HitState>> {
    static STATE: OnceLock<Mutex<HashMap<String, HitState>>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn lock() -> std::sync::MutexGuard<'static, HashMap<String, HitState>> {
    states().lock().unwrap_or_else(|poison| poison.into_inner())
}

const POLL_MS: u64 = 12;

pub fn register(label: &str, window: &tauri::WebviewWindow) -> Result<(), String> {
    let origin = window.outer_position().map_err(|error| error.to_string())?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    lock().insert(
        label.to_string(),
        HitState {
            visible: false,
            passthrough: false,
            pinned: false,
            menu_open: false,
            origin_x: origin.x,
            origin_y: origin.y,
            scale: scale.max(0.1),
            rects: Vec::new(),
        },
    );
    Ok(())
}

pub fn set_rects(label: &str, rects: Vec<HitRect>, menu_open: bool) {
    let mut guard = lock();
    let Some(state) = guard.get_mut(label) else {
        return;
    };
    state.menu_open = menu_open;
    state.rects = rects
        .into_iter()
        .filter(|rect| {
            [rect.x, rect.y, rect.w, rect.h]
                .iter()
                .all(|value| value.is_finite())
                && rect.w > 0.0
                && rect.h > 0.0
        })
        .collect();
}

pub fn set_scale(label: &str, scale: f64) {
    let next = scale.max(0.1);
    let mut guard = lock();
    if let Some(state) = guard.get_mut(label) {
        if (state.scale - next).abs() > f64::EPSILON {
            state.scale = next;
        }
    }
}

pub fn set_visible(label: &str, visible: bool) {
    let mut guard = lock();
    if let Some(state) = guard.get_mut(label) {
        state.visible = visible;
        if !visible {
            state.pinned = false;
            state.menu_open = false;
        }
    }
}

pub fn set_passthrough_all(passthrough: bool) {
    for state in lock().values_mut() {
        state.passthrough = passthrough;
    }
}

pub fn set_pinned(label: &str, pinned: bool) {
    let mut guard = lock();
    if let Some(state) = guard.get_mut(label) {
        state.pinned = pinned;
    }
}

#[derive(serde::Serialize)]
pub struct CursorInfo {
    cursor: Option<[i32; 2]>,
    origin: [i32; 2],
    scale: f64,
}

pub fn cursor_info(app: &tauri::AppHandle) -> CursorInfo {
    let cursor = cursor_position(app);
    let guard = lock();
    let state = guard.get("pet").or_else(|| guard.values().next());
    match (cursor, state) {
        (Some((x, y)), Some(state)) => CursorInfo {
            cursor: Some([x, y]),
            origin: [state.origin_x, state.origin_y],
            scale: state.scale,
        },
        _ => CursorInfo {
            cursor: None,
            origin: [0, 0],
            scale: 1.0,
        },
    }
}

fn contains(state: &HitState, cursor_x: i32, cursor_y: i32) -> bool {
    if !state.visible || state.passthrough {
        return false;
    }
    if state.pinned {
        return true;
    }
    let x = (cursor_x - state.origin_x) as f64 / state.scale;
    let y = (cursor_y - state.origin_y) as f64 / state.scale;
    state.rects.iter().any(|rect| {
        let pad = if rect.pad > 0.0 { rect.pad } else { 0.0 };
        x >= rect.x - pad
            && x <= rect.x + rect.w + pad
            && y >= rect.y - pad
            && y <= rect.y + rect.h + pad
    })
}

pub fn start(app: tauri::AppHandle) {
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    thread::spawn(move || {
        #[cfg(target_os = "windows")]
        let mut previous_buttons = 0;
        loop {
            #[cfg(target_os = "windows")]
            let button_down = {
                let buttons = mouse_buttons();
                let pressed = buttons & !previous_buttons != 0;
                previous_buttons = buttons;
                pressed
            };
            let cursor = cursor_position(&app);
            if let Some((x, y)) = cursor {
                // Never call into Tauri while holding the state lock: window
                // lookup / style repair can wait on the event loop, and an IPC
                // command waiting for the same lock would deadlock.
                let actions: Vec<_> = {
                    let guard = lock();
                    guard
                        .iter()
                        .filter(|(_, state)| state.visible)
                        .map(|(label, state)| (label.clone(), !contains(state, x, y), state.menu_open))
                        .collect()
                };
                for (label, through, menu_open) in actions {
                    // The desktop layer stays inactive, so clicking its
                    // click-through area does not send a native focus event.
                    #[cfg(target_os = "windows")]
                    if button_down && through && menu_open && label == crate::overlay::DESKTOP_LABEL {
                        let _ = app.emit_to(label.as_str(), "overlay:blur", ());
                    }
                    #[cfg(not(target_os = "windows"))]
                    let _ = menu_open;
                    if let Some(window) = app.get_webview_window(&label) {
                        if crate::platform::click_through::needs_repair(&window, through) {
                            let _ = crate::platform::click_through::set(&window, through);
                        }
                    }
                }
            }
            thread::sleep(Duration::from_millis(POLL_MS));
        }
    });

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = app;
    }
}

#[cfg(target_os = "windows")]
fn mouse_buttons() -> u8 {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
    unsafe {
        u8::from(GetAsyncKeyState(i32::from(VK_LBUTTON)) < 0)
            | (u8::from(GetAsyncKeyState(i32::from(VK_RBUTTON)) < 0) << 1)
    }
}

#[cfg(target_os = "windows")]
fn cursor_position(_app: &tauri::AppHandle) -> Option<(i32, i32)> {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut point = POINT { x: 0, y: 0 };
    let ok = unsafe { GetCursorPos(&mut point) };
    if ok != 0 {
        Some((point.x, point.y))
    } else {
        None
    }
}

#[cfg(not(target_os = "windows"))]
fn cursor_position(app: &tauri::AppHandle) -> Option<(i32, i32)> {
    app.get_webview_window("pet")
        .and_then(|window| window.cursor_position().ok())
        .map(|point| (point.x.round() as i32, point.y.round() as i32))
}
