//! The desktop sticker layers.
//!
//! Two transparent full-screen windows share the same store:
//! - `pet`: floating stickers, always on top of app windows.
//! - `pet-desktop`: stickers placed on the desktop/wallpaper layer.
//!
//! Both windows always paint all of their stickers and are click-through by
//! default. `hit_test` polls the cursor per window and flips
//! `WS_EX_TRANSPARENT` only while the cursor is over one of that layer's
//! stickers. No window region is used, so moving stickers never tear.

use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::platform::{click_through, hit_test};

pub const PET_LABEL: &str = "pet";
pub const DESKTOP_LABEL: &str = "pet-desktop";

#[derive(Clone, Copy, Debug, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    #[serde(default)]
    pub pad: f64,
}

struct OverlayState {
    visible: bool,
    passthrough: bool,
    dragging: bool,
}

static STATE: Mutex<OverlayState> = Mutex::new(OverlayState {
    visible: true,
    passthrough: false,
    dragging: false,
});

static SHOWN_FLOATING: AtomicBool = AtomicBool::new(false);
static SHOWN_DESKTOP: AtomicBool = AtomicBool::new(false);

fn lock() -> std::sync::MutexGuard<'static, OverlayState> {
    STATE.lock().unwrap_or_else(|poison| poison.into_inner())
}

fn monitor_geometry(
    app: &AppHandle,
) -> Result<(PhysicalPosition<i32>, PhysicalSize<u32>, f64, f64, f64), String> {
    let monitor = match app.primary_monitor() {
        Ok(Some(monitor)) => monitor,
        Ok(None) => app
            .available_monitors()
            .map_err(|error| error.to_string())?
            .into_iter()
            .next()
            .ok_or_else(|| "no display found".to_string())?,
        Err(error) => return Err(error.to_string()),
    };
    let scale = monitor.scale_factor().max(0.1);
    let position = *monitor.position();
    let size = *monitor.size();
    let logical_width = size.width as f64 / scale;
    let logical_height = size.height as f64 / scale;
    Ok((position, size, scale, logical_width, logical_height))
}

fn bind_window_events(window: &WebviewWindow, label: &'static str) {
    let current = window.clone();
    window.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::Focused(false) => {
                hit_test::set_pinned(label, false);
                let _ = current.app_handle().emit_to(label, "overlay:blur", ());
            }
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = current.hide();
                hit_test::set_visible(label, false);
                let _ = click_through::set(&current, true);
            }
            _ => {}
        }
    });
}

fn build_layer(
    app: &AppHandle,
    label: &'static str,
    layer: &'static str,
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    scale: f64,
    logical_width: f64,
    logical_height: f64,
) -> Result<WebviewWindow, String> {
    let url = format!("index.html?pet=1&layer={layer}");
    let title = if layer == "desktop" {
        "贴纸宝宝 Desktop"
    } else {
        "贴纸宝宝 Layer"
    };
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(logical_width, logical_height)
        .position(position.x as f64 / scale, position.y as f64 / scale)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .focused(false)
        .visible(false)
        .accept_first_mouse(true)
        .disable_drag_drop_handler()
        .build()
        .map_err(|error| error.to_string())?;

    // Exact physical placement: the builder only sees logical points, which can
    // be scaled incorrectly on mixed-DPI desktops.
    window
        .set_position(PhysicalPosition::new(position.x, position.y))
        .map_err(|error| error.to_string())?;
    window
        .set_size(PhysicalSize::new(size.width, size.height))
        .map_err(|error| error.to_string())?;
    if layer == "desktop" {
        window
            .set_always_on_top(false)
            .map_err(|error| error.to_string())?;
        window
            .set_always_on_bottom(true)
            .map_err(|error| error.to_string())?;
    } else {
        let _ = window.set_always_on_bottom(false);
        window
            .set_always_on_top(true)
            .map_err(|error| error.to_string())?;
    }

    // Start click-through. A full-screen top-most window that Windows believes
    // is opaque freezes the apps underneath it.
    click_through::set(&window, true)?;
    click_through::disable_default_context_menu(&window);
    hit_test::register(label, &window)?;
    bind_window_events(&window, label);
    Ok(window)
}

pub fn create(app: &AppHandle) -> Result<WebviewWindow, String> {
    let (position, size, scale, logical_width, logical_height) = monitor_geometry(app)?;

    if app.get_webview_window(PET_LABEL).is_none() {
        build_layer(
            app,
            PET_LABEL,
            "floating",
            position,
            size,
            scale,
            logical_width,
            logical_height,
        )?;
    }
    if app.get_webview_window(DESKTOP_LABEL).is_none() {
        build_layer(
            app,
            DESKTOP_LABEL,
            "desktop",
            position,
            size,
            scale,
            logical_width,
            logical_height,
        )?;
    }
    app.get_webview_window(PET_LABEL)
        .ok_or_else(|| "pet layer not created".to_string())
}

pub fn start_hit_test(app: AppHandle) {
    hit_test::start(app);
}

pub fn set_rects(window: &WebviewWindow, rects: Vec<RegionRect>, scale: f64) {
    let label = window.label().to_string();
    let scale = if scale.is_finite() && scale > 0.1 {
        scale
    } else {
        window.scale_factor().unwrap_or(1.0)
    };
    hit_test::set_scale(&label, scale);
    hit_test::set_rects(
        &label,
        rects
            .into_iter()
            .filter(|rect| {
                [rect.x, rect.y, rect.w, rect.h]
                    .iter()
                    .all(|value| value.is_finite())
                    && rect.w > 0.0
                    && rect.h > 0.0
            })
            .map(|rect| hit_test::HitRect {
                x: rect.x,
                y: rect.y,
                w: rect.w,
                h: rect.h,
                pad: rect.pad,
            })
            .collect(),
    );
}

pub fn set_dragging(window: &WebviewWindow, dragging: bool) {
    lock().dragging = dragging;
    hit_test::set_pinned(window.label(), dragging);
}

pub fn set_passthrough(app: &AppHandle, enabled: bool) {
    lock().passthrough = enabled;
    hit_test::set_passthrough_all(enabled);
    #[cfg(target_os = "windows")]
    let _ = app;
}

pub fn set_visible(app: &AppHandle, visible: bool) {
    lock().visible = visible;
    for label in [PET_LABEL, DESKTOP_LABEL] {
        hit_test::set_visible(label, visible);
        let Some(window) = app.get_webview_window(label) else {
            continue;
        };
        if visible {
            let _ = click_through::set(&window, true);
            let shown = if label == PET_LABEL {
                &SHOWN_FLOATING
            } else {
                &SHOWN_DESKTOP
            };
            if !shown.swap(true, Ordering::SeqCst) {
                let _ = window.show();
            } else {
                let _ = click_through::show_no_activate(&window);
            }
            if label == DESKTOP_LABEL {
                let _ = window.set_always_on_top(false);
                let _ = window.set_always_on_bottom(true);
            } else {
                let _ = window.set_always_on_bottom(false);
                let _ = window.set_always_on_top(true);
            }
            // `show` rebuilds window styles, so re-apply the flag.
            let _ = click_through::set(&window, true);
            click_through::redraw(&window);
        } else {
            let _ = window.hide();
            let _ = click_through::set(&window, true);
        }
    }
}

pub fn toggle_visible(app: &AppHandle) -> bool {
    let next = !lock().visible;
    set_visible(app, next);
    next
}

pub fn is_visible() -> bool {
    lock().visible
}

pub fn debug_flags() -> (bool, bool, bool) {
    let state = lock();
    (state.visible, state.passthrough, state.dragging)
}

pub fn ready(app: &AppHandle) {
    if is_visible() {
        set_visible(app, true);
    }
}
