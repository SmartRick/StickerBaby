//! 悬浮层窗口样式：点击穿透、不抢焦点、关闭 WebView2 默认菜单。

/// 切换鼠标穿透（WS_EX_TRANSPARENT），同时确保悬浮层“不打扰”其他程序：
///
/// - 始终保留 WS_EX_LAYERED，并设置 LWA_ALPHA = 254。不带 layered 的全屏窗口会被
///   Chromium 系浏览器（Chrome / Edge / Electron）的遮挡检测判定为不透明，页面进入 hidden，
///   正在播放的视频被暂停；Chromium 把 alpha < 255 的 layered 窗口视为半透明，不计入遮挡
///   （254 肉眼无差异）。
/// - 每次都重新加上 WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW 并去掉 WS_EX_APPWINDOW：
///   tao 在 show / skip_taskbar 等操作时会重置扩展样式，导致点击贴纸时抢走前台焦点。
#[cfg(windows)]
pub fn set(window: &tauri::WebviewWindow, through: bool) {
    use windows::Win32::Foundation::{COLORREF, HWND};
    use windows::Win32::UI::WindowsAndMessaging::*;
    let Ok(h) = window.hwnd() else { return };
    let hwnd = HWND(h.0 as _);
    unsafe {
        let mut ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        ex |= (WS_EX_LAYERED.0 | WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize;
        ex &= !(WS_EX_APPWINDOW.0 as isize);
        if through {
            ex |= WS_EX_TRANSPARENT.0 as isize;
        } else {
            ex &= !(WS_EX_TRANSPARENT.0 as isize);
        }
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex);
        let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 254, LWA_ALPHA);
    }
}

#[cfg(not(windows))]
pub fn set(window: &tauri::WebviewWindow, through: bool) {
    let _ = window.set_ignore_cursor_events(through);
}

/// 关闭 WebView2 自带的浏览器菜单（后退 / 刷新 / 另存为 / 打印）
#[cfg(windows)]
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

#[cfg(not(windows))]
pub fn disable_default_context_menu(_window: &tauri::WebviewWindow) {}

/// 显示悬浮层但不抢走前台应用的键盘焦点
#[cfg(windows)]
pub fn show_no_activate(window: &tauri::WebviewWindow) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
    let handle = window.hwnd().map_err(|error| error.to_string())?;
    unsafe {
        let _ = ShowWindow(HWND(handle.0 as _), SW_SHOWNOACTIVATE);
    }
    Ok(())
}

/// macOS：orderFrontRegardless 显示但不激活应用（必须在主线程）
#[cfg(target_os = "macos")]
pub fn show_no_activate(window: &tauri::WebviewWindow) -> Result<(), String> {
    let ns = window.ns_window().map_err(|error| error.to_string())?;
    let ns = ns as usize;
    window
        .run_on_main_thread(move || crate::platform::macos::order_front_no_activate(ns as _))
        .map_err(|error| error.to_string())
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn show_no_activate(window: &tauri::WebviewWindow) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())
}
