//! 桌面悬浮层。
//!
//! 两个全屏透明窗口，运行同一套前端引擎（`overlay.html`）：
//! - `pet`         置顶层：置顶贴纸 + 全屏特效 / 恶作剧 / 屏幕扰动
//! - `pet-desktop` 桌面层：取消置顶的贴纸，位于所有应用窗口之下
//!
//! 两层默认都点击穿透。Rust 轮询全局光标并推送给两层，前端对贴纸做按 alpha 的像素级命中测试、
//! 对移动中的虫子做实时命中测试，只在命中时通过 `overlay_set_interactive` 关闭本窗口的穿透。

use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::platform::click_through;

pub const PET_LABEL: &str = "pet";
pub const DESKTOP_LABEL: &str = "pet-desktop";
pub const LABELS: [&str; 2] = [PET_LABEL, DESKTOP_LABEL];

#[derive(Clone, Copy, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayInfo {
    /// 物理像素下的屏幕区域
    pub rect: Rect,
    pub scale: f64,
    pub monitor_index: usize,
}

impl Default for OverlayInfo {
    fn default() -> Self {
        Self { rect: Rect::default(), scale: 1.0, monitor_index: 0 }
    }
}

#[derive(Default)]
pub struct OverlayState {
    pub info: Mutex<OverlayInfo>,
    interactive: Mutex<HashMap<String, bool>>,
    hidden: AtomicBool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonitorDesc {
    pub index: usize,
    pub name: String,
    pub rect: Rect,
    pub scale: f64,
    pub primary: bool,
}

fn build_layer(app: &AppHandle, label: &'static str) -> tauri::Result<WebviewWindow> {
    let desktop = label == DESKTOP_LABEL;
    let url = format!("overlay.html?layer={}", if desktop { "desktop" } else { "floating" });
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(if desktop { "贴纸宝宝 Desktop" } else { "贴纸宝宝 Overlay" })
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .focused(false)
        // 鼠标激活会打乱底层窗口的合成；桌面层仍能收到点击和拖拽
        .focusable(!desktop || !cfg!(windows))
        .accept_first_mouse(true)
        .disable_drag_drop_handler()
        .visible(false);
    // 三个窗口必须共用同一个 WebView 数据目录，localStorage / 事件同步才不断
    if let Some(dir) = crate::data_dir::webview_dir() {
        builder = builder.data_directory(dir);
    }
    let win = builder.build()?;
    // 只设置各自需要的那一个：在 tao 里 always_on_bottom(false) 会顺带取消置顶
    if desktop {
        win.set_always_on_bottom(true)?;
    } else {
        win.set_always_on_top(true)?;
    }
    click_through::disable_default_context_menu(&win);
    #[cfg(target_os = "macos")]
    if let Ok(ns) = win.ns_window() {
        let id = crate::platform::macos::configure_overlay(ns, !desktop);
        let slot = if desktop { &win::DESKTOP_ID } else { &win::FLOATING_ID };
        slot.store(id, Ordering::SeqCst);
    }
    Ok(win)
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let monitors = app.available_monitors()?;
    let primary = app.primary_monitor()?;
    let index = monitors
        .iter()
        .position(|m| primary.as_ref().map(|p| p.position() == m.position()).unwrap_or(false))
        .unwrap_or(0);
    for label in LABELS {
        let win = build_layer(app, label)?;
        place(app, &win, index)?;
        click_through::set(&win, true);
        win.show()?;
        // show 会重建扩展样式，重新确保穿透 / 不抢焦点
        click_through::set(&win, true);
    }
    Ok(())
}

fn place(app: &AppHandle, win: &WebviewWindow, index: usize) -> tauri::Result<()> {
    let monitors = app.available_monitors()?;
    let Some((index, m)) = monitors
        .get(index)
        .map(|m| (index, m))
        .or_else(|| monitors.first().map(|m| (0, m)))
    else {
        return Ok(());
    };
    let pos = *m.position();
    let size = *m.size();
    // 必须先改尺寸再定位：macOS 上 set_size 保持窗口左下角不动，
    // 先定位再改尺寸会把窗口顶边推出屏幕（桌面层曾因此整体上移）
    #[cfg(target_os = "macos")]
    {
        // 按目标屏自己的 scale 换算成点，跨不同缩放的显示器也不会算错
        let s = m.scale_factor();
        win.set_size(tauri::LogicalSize::new(size.width as f64 / s, size.height as f64 / s))?;
        win.set_position(tauri::LogicalPosition::new(pos.x as f64 / s, pos.y as f64 / s))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        win.set_size(tauri::PhysicalSize::new(size.width, size.height))?;
        win.set_position(tauri::PhysicalPosition::new(pos.x, pos.y))?;
    }
    let info = OverlayInfo {
        rect: Rect { x: pos.x, y: pos.y, width: size.width, height: size.height },
        scale: m.scale_factor(),
        monitor_index: index,
    };
    *app.state::<OverlayState>().info.lock().unwrap() = info;
    let _ = app.emit_to(win.label(), "sb://overlay-info", info);
    Ok(())
}

/// Ctrl+Alt+F12：整体隐藏 / 显示两层悬浮层（含特效）
pub fn toggle_visible(app: &AppHandle) {
    let state = app.state::<OverlayState>();
    let hide = !state.hidden.load(Ordering::SeqCst);
    state.hidden.store(hide, Ordering::SeqCst);
    for label in LABELS {
        let Some(w) = app.get_webview_window(label) else { continue };
        if hide {
            let _ = w.hide();
        } else {
            let _ = click_through::show_no_activate(&w);
            click_through::set(&w, true);
        }
    }
    let _ = app.emit("sb://overlay-hidden", hide);
}

impl OverlayState {
    /// 任一悬浮层当前处于可点击状态（光标在贴纸 / 可交互对象上）
    pub fn any_interactive(&self) -> bool {
        self.interactive.lock().unwrap().values().any(|v| *v)
    }
}

#[tauri::command]
pub fn overlay_set_interactive(window: WebviewWindow, state: State<OverlayState>, interactive: bool) {
    let label = window.label().to_string();
    if state.interactive.lock().unwrap().insert(label, interactive) == Some(interactive) {
        return;
    }
    click_through::set(&window, !interactive);
}

#[tauri::command]
pub fn overlay_set_monitor(app: AppHandle, index: usize) -> Result<OverlayInfo, String> {
    for label in LABELS {
        if let Some(w) = app.get_webview_window(label) {
            place(&app, &w, index).map_err(|e| e.to_string())?;
        }
    }
    Ok(*app.state::<OverlayState>().info.lock().unwrap())
}

#[tauri::command]
pub fn overlay_info(state: State<OverlayState>) -> OverlayInfo {
    *state.info.lock().unwrap()
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Result<Vec<MonitorDesc>, String> {
    let primary = app.primary_monitor().ok().flatten();
    let list = app.available_monitors().map_err(|e| e.to_string())?;
    Ok(list
        .iter()
        .enumerate()
        .map(|(i, m)| MonitorDesc {
            index: i,
            name: m.name().cloned().unwrap_or_else(|| format!("Display {}", i + 1)),
            rect: Rect {
                x: m.position().x,
                y: m.position().y,
                width: m.size().width,
                height: m.size().height,
            },
            scale: m.scale_factor(),
            primary: primary.as_ref().map(|p| p.position() == m.position()).unwrap_or(false),
        })
        .collect())
}

#[derive(Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
struct CursorEvent {
    /// 悬浮层 CSS 像素坐标
    x: f64,
    y: f64,
    /// 左 / 右 / 中键任一按下
    down: bool,
    inside: bool,
}

/// 全局光标轮询（~120Hz，变化时才推送）。即便悬浮层处于点击穿透状态，
/// 前端也能拿到光标位置，用于命中测试、抚摸、虫子躲避鼠标、眼睛跟随等效果。
///
/// 桌面层在所有窗口之下：光标所在处被其他应用窗口盖住时视为不在桌面层内，
/// 避免隔着窗口触发抚摸、或在别的应用里点击时误判。
pub fn spawn_cursor_tracker(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: [Option<CursorEvent>; 2] = [None, None];
        let mut focus = win::FocusGuard::default();
        loop {
            std::thread::sleep(Duration::from_millis(8));
            let info = *app.state::<OverlayState>().info.lock().unwrap();
            let Some((cx, cy, down)) = win::read_cursor(info.scale) else { continue };
            focus.tick(&app, down);
            let r = info.rect;
            let on_screen =
                cx >= r.x && cy >= r.y && cx < r.x + r.width as i32 && cy < r.y + r.height as i32;
            // 桌面层可见性每轮只算一次（macOS 上要枚举窗口列表，内部有节流）
            let desktop_visible = on_screen && win::desktop_visible_at(&app, cx, cy, info.scale);
            for (i, label) in LABELS.iter().enumerate() {
                let inside = on_screen && (i == 0 || desktop_visible);
                let ev = CursorEvent {
                    x: (cx - r.x) as f64 / info.scale,
                    y: (cy - r.y) as f64 / info.scale,
                    down,
                    inside,
                };
                if last[i].as_ref() != Some(&ev) {
                    let _ = app.emit_to(*label, "sb://cursor", ev.clone());
                    last[i] = Some(ev);
                }
            }
        }
    });
}

#[cfg(windows)]
mod win {
    use super::{DESKTOP_LABEL, PET_LABEL};
    use tauri::{AppHandle, Manager};
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetAncestor, GetClassNameW, GetCursorPos, WindowFromPoint, GA_ROOT,
    };

    /// Windows 的 GetCursorPos 本身就是物理像素（进程 DPI aware），不需要 scale
    pub fn read_cursor(_scale: f64) -> Option<(i32, i32, bool)> {
        let mut p = POINT::default();
        unsafe {
            GetCursorPos(&mut p).ok()?;
            let down = [VK_LBUTTON, VK_RBUTTON, VK_MBUTTON]
                .iter()
                .any(|k| (GetAsyncKeyState(k.0 as i32) as u16 & 0x8000) != 0);
            Some((p.x, p.y, down))
        }
    }

    fn hwnd_of(app: &AppHandle, label: &str) -> Option<isize> {
        app.get_webview_window(label)?.hwnd().ok().map(|h| h.0 as isize)
    }

    /// Windows 上悬浮层本就不抢焦点（WS_EX_NOACTIVATE），无需归还
    #[derive(Default)]
    pub struct FocusGuard;
    impl FocusGuard {
        pub fn tick(&mut self, _: &AppHandle, _: bool) {}
    }

    /// 光标处最上层的顶层窗口是桌面本身、桌面层或置顶层时，桌面层可见
    pub fn desktop_visible_at(app: &AppHandle, x: i32, y: i32, _scale: f64) -> bool {
        unsafe {
            let h = WindowFromPoint(POINT { x, y });
            if h.is_invalid() {
                return true;
            }
            let root = GetAncestor(h, GA_ROOT);
            let root = if root.is_invalid() { h } else { root };
            let id = root.0 as isize;
            if Some(id) == hwnd_of(app, DESKTOP_LABEL) || Some(id) == hwnd_of(app, PET_LABEL) {
                return true;
            }
            let mut buf = [0u16; 64];
            let n = GetClassNameW(root, &mut buf) as usize;
            matches!(String::from_utf16_lossy(&buf[..n]).as_str(), "Progman" | "WorkerW")
        }
    }

}

/// macOS：光标坐标是“点”（左上角原点的全局坐标，与 CGDisplayBounds 同一坐标系）；
/// tao 的显示器 position/size 是“点 × 该屏 scale”，乘上悬浮层所在屏的 scale 即可与 OverlayInfo.rect 对齐。
#[cfg(target_os = "macos")]
mod win {
    use crate::platform::macos;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use tauri::{AppHandle, Manager};

    /// 两层悬浮层的 CGWindowID（build_layer 时记录）
    pub static FLOATING_ID: AtomicU32 = AtomicU32::new(0);
    pub static DESKTOP_ID: AtomicU32 = AtomicU32::new(0);

    pub fn read_cursor(scale: f64) -> Option<(i32, i32, bool)> {
        let (x, y, down) = macos::cursor()?;
        Some(((x * scale).round() as i32, (y * scale).round() as i32, down))
    }

    /// 枚举窗口列表约 0.5–2ms，不能每 8ms 做一次：同一位置 100ms 内、移动中 33ms 内复用结果
    pub fn desktop_visible_at(_: &AppHandle, x: i32, y: i32, scale: f64) -> bool {
        static CACHE: Mutex<Option<(Instant, i32, i32, bool)>> = Mutex::new(None);
        let mut cache = CACHE.lock().unwrap();
        if let Some((at, cx, cy, v)) = *cache {
            let ttl = if (cx, cy) == (x, y) { 100 } else { 33 };
            if at.elapsed() < Duration::from_millis(ttl) {
                return v;
            }
        }
        let v = macos::desktop_visible_at(
            x as f64 / scale,
            y as f64 / scale,
            DESKTOP_ID.load(Ordering::SeqCst),
            FLOATING_ID.load(Ordering::SeqCst),
        );
        *cache = Some((Instant::now(), x, y, v));
        v
    }

    /// 点击贴纸会激活整个应用、抢走用户正在用的程序的键盘焦点（macOS 没有 WS_EX_NOACTIVATE）。
    /// 记录点击前的前台应用：在悬浮层上按下、松开后若焦点被我们拿走、且用户没有转去主界面，就还回去。
    #[derive(Default)]
    pub struct FocusGuard {
        /// 最近一次观察到的、不是自己的前台应用
        other: Option<i32>,
        last_poll: Option<Instant>,
        was_down: bool,
        /// 本次按下发生在悬浮层上，且按下前前台不是自己
        restore: Option<i32>,
    }

    impl FocusGuard {
        pub fn tick(&mut self, app: &AppHandle, down: bool) {
            let own = std::process::id() as i32;
            if !down && self.last_poll.map_or(true, |t| t.elapsed() >= Duration::from_millis(100)) {
                self.last_poll = Some(Instant::now());
                self.other = macos::frontmost_pid().filter(|pid| *pid != own);
            }
            if down && !self.was_down {
                let on_overlay = app.state::<super::OverlayState>().any_interactive();
                self.restore = if on_overlay { self.other } else { None };
            }
            if !down && self.was_down {
                if let Some(pid) = self.restore.take() {
                    schedule_restore(app.clone(), pid);
                }
            }
            self.was_down = down;
        }
    }

    fn schedule_restore(app: AppHandle, pid: i32) {
        std::thread::spawn(move || {
            // 等点击触发的动作（例如右键菜单里“打开主界面”）先落地
            std::thread::sleep(Duration::from_millis(150));
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                let main_focused = handle
                    .get_webview_window("main")
                    .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
                    .unwrap_or(false);
                if macos::self_is_active() && !main_focused {
                    macos::activate_pid(pid);
                }
            });
        });
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod win {
    use tauri::AppHandle;
    pub fn read_cursor(_scale: f64) -> Option<(i32, i32, bool)> {
        None
    }
    pub fn desktop_visible_at(_: &AppHandle, _: i32, _: i32, _: f64) -> bool {
        true
    }
    #[derive(Default)]
    pub struct FocusGuard;
    impl FocusGuard {
        pub fn tick(&mut self, _: &AppHandle, _: bool) {}
    }
}
