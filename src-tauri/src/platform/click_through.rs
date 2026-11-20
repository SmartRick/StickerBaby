//! Click-through flag for the sticker overlay.
//!
//! On Windows `WS_EX_TRANSPARENT` alone does not let clicks through a top-level
//! window; the combination `WS_EX_TRANSPARENT | WS_EX_LAYERED` does.
//! `WS_EX_LAYERED` is applied once and never removed; only `WS_EX_TRANSPARENT`
//! is toggled as the cursor enters/leaves an interactive sticker.
//!
//! The window is never clipped by a region. A moving window region lags behind
//! the rendered stickers and tears their edges, so the canvas always paints
//! whole and only the click-through flag flips.

#[cfg(target_os = "windows")]
pub fn set(window: &tauri::WebviewWindow, through: bool) -> Result<(), String> {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, GWL_EXSTYLE, LWA_ALPHA,
        WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
    };

    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as HWND;
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        // Chromium excludes tool windows from native occlusion calculations.
        // Keep the layered/tool-window role while interactive, otherwise a
        // transparent fullscreen canvas looks opaque and freezes the app below.
        let mut next =
            (style | (WS_EX_LAYERED | WS_EX_TOOLWINDOW) as isize) & !(WS_EX_APPWINDOW as isize);
        if through {
            next |= WS_EX_TRANSPARENT as isize;
        } else {
            next &= !(WS_EX_TRANSPARENT as isize);
        }
        if next != style {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
            // A layered window without explicit attributes is in an undefined
            // composition state; declare full alpha so DWM always composites.
            let _ = SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn set(window: &tauri::WebviewWindow, through: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(through)
        .map_err(|error| error.to_string())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn set(window: &tauri::WebviewWindow, through: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(through)
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
pub fn is_through(window: &tauri::WebviewWindow) -> bool {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TRANSPARENT,
    };
    let Ok(handle) = window.hwnd() else {
        return false;
    };
    let style = unsafe { GetWindowLongPtrW(handle.0 as HWND, GWL_EXSTYLE) };
    style & (WS_EX_TRANSPARENT as isize) != 0
}

#[cfg(not(target_os = "windows"))]
pub fn is_through(_window: &tauri::WebviewWindow) -> bool {
    false
}

#[cfg(target_os = "windows")]
pub fn needs_repair(window: &tauri::WebviewWindow, through: bool) -> bool {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, GWL_EXSTYLE, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_TOOLWINDOW,
    };
    let Ok(handle) = window.hwnd() else {
        return false;
    };
    let style = unsafe { GetWindowLongPtrW(handle.0 as HWND, GWL_EXSTYLE) };
    let required = (WS_EX_LAYERED | WS_EX_TOOLWINDOW) as isize;
    style & required != required
        || style & WS_EX_APPWINDOW as isize != 0
        || is_through(window) != through
}

#[cfg(not(target_os = "windows"))]
pub fn needs_repair(_window: &tauri::WebviewWindow, _through: bool) -> bool {
    false
}

/// Disable WebView2's built-in browser menu (back / reload / save as / print).
#[cfg(target_os = "windows")]
pub fn disable_default_context_menu(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|webview| unsafe {
        let controller = webview.controller();
        if let Ok(core) = controller.CoreWebView2() {
            if let Ok(settings) = core.Settings() {
                let _ = settings.SetAreDefaultContextMenusEnabled(false);
            }
        }
    });
}

#[cfg(not(target_os = "windows"))]
pub fn disable_default_context_menu(_window: &tauri::WebviewWindow) {}

/// Force a repaint after z-order or style changes.
#[cfg(target_os = "windows")]
pub fn redraw(window: &tauri::WebviewWindow) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Gdi::{
        RedrawWindow, RDW_ALLCHILDREN, RDW_FRAME, RDW_INVALIDATE, RDW_UPDATENOW,
    };
    let Ok(handle) = window.hwnd() else {
        return;
    };
    unsafe {
        RedrawWindow(
            handle.0 as HWND,
            std::ptr::null(),
            std::ptr::null_mut(),
            RDW_INVALIDATE | RDW_ALLCHILDREN | RDW_UPDATENOW | RDW_FRAME,
        );
    }
}

#[cfg(not(target_os = "windows"))]
pub fn redraw(_window: &tauri::WebviewWindow) {}

/// Show the overlay without stealing keyboard focus from the foreground app.
#[cfg(target_os = "windows")]
pub fn show_no_activate(window: &tauri::WebviewWindow) -> Result<(), String> {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
    let handle = window.hwnd().map_err(|error| error.to_string())?;
    unsafe {
        ShowWindow(handle.0 as HWND, SW_SHOWNOACTIVATE);
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn show_no_activate(window: &tauri::WebviewWindow) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())
}
