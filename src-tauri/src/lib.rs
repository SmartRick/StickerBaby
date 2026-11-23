//! 贴纸宝宝
//!
//! 窗口结构：
//! - `main`        主界面（贴纸库、创建、桌面、玩法、设置）
//! - `pet`         置顶悬浮层：置顶贴纸 + 全屏特效 / 恶作剧 / 屏幕扰动
//! - `pet-desktop` 桌面层：取消置顶的贴纸
//!
//! 主界面通过 `sb://cmd` 事件向悬浮层发送玩法指令（见 `src/shared/protocol.ts`），
//! 贴纸摆放与设置通过前端共享状态同步。

mod capture;
mod data_dir;
mod desktop;
mod overlay;
mod platform;
mod sticker_creation;
mod tray;
mod window_fx;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

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
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// 一键清场：停止所有特效 / 恶作剧 / 扰动，还原被移动的窗口和桌面图标
pub fn panic_clear(app: &AppHandle) {
    window_fx::cancel_all();
    desktop::restore();
    let _ = app.emit("sb://panic", ());
}

#[tauri::command]
fn clear_all(app: AppHandle) {
    panic_clear(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Windows：Ctrl+Alt；macOS：⌘⌥（与前端 src/lib/shortcuts.ts 保持一致）
    let mods = if cfg!(target_os = "macos") {
        Modifiers::SUPER | Modifiers::ALT
    } else {
        Modifiers::CONTROL | Modifiers::ALT
    };
    let lock_key = Shortcut::new(Some(mods), Code::KeyP);
    let panic_key = Shortcut::new(Some(mods), Code::KeyQ);
    let toggle_key = Shortcut::new(Some(mods), Code::F12);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &lock_key {
                        let _ = app.emit("shortcut:toggle-passthrough", ());
                    } else if shortcut == &panic_key {
                        panic_clear(app);
                    } else if shortcut == &toggle_key {
                        overlay::toggle_visible(app);
                    }
                })
                .build(),
        )
        .manage(overlay::OverlayState::default())
        .setup(move |app| {
            // 快捷键可能被其他程序占用：逐个注册，失败只记录、不中断启动
            for key in [lock_key, panic_key, toggle_key] {
                if let Err(error) = app.global_shortcut().register(key) {
                    eprintln!("[sticker-baby] 快捷键 {key:?} 注册失败: {error}");
                }
            }
            let handle = app.handle().clone();

            // 主窗口：创建前置一次数据目录（触发旧数据搬迁），WebView 配置跟随软件
            let mut main = tauri::WebviewWindowBuilder::new(
                &handle,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("贴纸宝宝")
            .inner_size(1180.0, 800.0)
            .min_inner_size(1040.0, 700.0)
            .center()
            .resizable(true)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .visible(false);
            // drag_and_drop 只有 Windows 版 tauri 提供
            #[cfg(windows)]
            {
                main = main.drag_and_drop(false);
            }
            if let Some(dir) = data_dir::webview_dir() {
                main = main.data_directory(dir);
            }
            let main = main.build()?;

            let window = main.clone();
            main.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // 关闭主界面只收进托盘，贴纸继续留在桌面上
                    api.prevent_close();
                    let _ = window.hide();
                }
            });

            overlay::create(&handle)?;
            overlay::spawn_cursor_tracker(handle.clone());

            tray::create(&handle)?;

            // 兜底：主界面没有上报就绪时也要显示出来，避免应用“隐形”运行
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
            quit_app,
            clear_all,
            tray::sync_tray_state,
            overlay::overlay_set_interactive,
            overlay::overlay_set_monitor,
            overlay::overlay_info,
            overlay::list_monitors,
            capture::capture_screen,
            window_fx::window_fx,
            window_fx::window_fx_cancel,
            desktop::desktop_foreground,
            desktop::desktop_icons,
            sticker_creation::save_created_sticker,
            sticker_creation::save_created_video,
            sticker_creation::list_created_stickers,
            sticker_creation::delete_created_sticker,
            sticker_creation::prepare_cutout_model,
            sticker_creation::cutout_cpu,
        ])
        .build(tauri::generate_context!())
        .expect("error while building 贴纸宝宝");

    app.run(|app, event| match event {
        RunEvent::Exit => {
            // 退出时还原一切系统级改动
            window_fx::cancel_all();
            desktop::restore();
        }
        // macOS：点击 Dock 图标时找回被收起的主界面
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show_main_window(app.clone()),
        _ => {}
    });
}
