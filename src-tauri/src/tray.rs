use serde::Deserialize;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::{panic_clear, show_main_window};

struct TrayControls {
    visible: CheckMenuItem<Wry>,
    locked: CheckMenuItem<Wry>,
    modes: [(&'static str, CheckMenuItem<Wry>); 4],
}

impl TrayControls {
    fn set_mode(&self, mode: &str) -> tauri::Result<()> {
        for (key, item) in &self.modes {
            item.set_checked(*key == mode)?;
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraySettings {
    overlay_visible: bool,
    passthrough: bool,
    sticker_mode: String,
}

#[tauri::command]
pub fn sync_tray_state(app: AppHandle, settings: TraySettings) -> Result<(), String> {
    let update = || -> tauri::Result<()> {
        if let Some(controls) = app.try_state::<TrayControls>() {
            controls.visible.set_checked(settings.overlay_visible)?;
            controls.locked.set_checked(settings.passthrough)?;
            controls.set_mode(&settings.sticker_mode)?;
        }
        Ok(())
    };
    update().map_err(|error| error.to_string())
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "打开主界面", true, None::<&str>)?;
    let library = MenuItem::with_id(app, "library", "贴纸库", true, None::<&str>)?;
    let effects = MenuItem::with_id(app, "effects", "全屏特效", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "偏好设置", true, None::<&str>)?;
    let clear = MenuItem::with_id(app, "clear", "一键清场（Ctrl+Alt+Q）", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出贴纸宝宝", true, None::<&str>)?;
    let workspace_separator = PredefinedMenuItem::separator(app)?;
    let quit_separator = PredefinedMenuItem::separator(app)?;
    let controls = TrayControls {
        visible: CheckMenuItem::with_id(app, "toggle", "显示桌面贴纸", true, true, None::<&str>)?,
        locked: CheckMenuItem::with_id(
            app,
            "passthrough",
            "全局锁定（Ctrl+Alt+P）",
            true,
            false,
            None::<&str>,
        )?,
        modes: [
            (
                "float",
                CheckMenuItem::with_id(app, "mode-float", "悬浮", true, false, None::<&str>)?,
            ),
            (
                "desk",
                CheckMenuItem::with_id(app, "mode-desk", "滑冰", true, true, None::<&str>)?,
            ),
            (
                "gravity",
                CheckMenuItem::with_id(app, "mode-gravity", "重力", true, false, None::<&str>)?,
            ),
            (
                "space",
                CheckMenuItem::with_id(app, "mode-space", "太空", true, false, None::<&str>)?,
            ),
        ],
    };
    let modes = Submenu::with_items(
        app,
        "运动模式",
        true,
        &[
            &controls.modes[0].1,
            &controls.modes[1].1,
            &controls.modes[2].1,
            &controls.modes[3].1,
        ],
    )?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &library,
            &effects,
            &settings,
            &workspace_separator,
            &controls.visible,
            &controls.locked,
            &modes,
            &clear,
            &quit_separator,
            &quit,
        ],
    )?;
    app.manage(controls);

    let mut builder = TrayIconBuilder::with_id("deskpet-tray")
        .tooltip("贴纸宝宝")
        .menu(&menu)
        .show_menu_on_left_click(false);
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app.clone()),
            page @ ("library" | "effects" | "settings") => {
                let _ = app.emit_to("main", "tray:navigate", page);
                show_main_window(app.clone());
            }
            "toggle" => {
                let _ = app.emit_to("main", "tray:toggle-overlay", ());
            }
            "clear" => panic_clear(app),
            "passthrough" => {
                let _ = app.emit_to("main", "shortcut:toggle-passthrough", ());
            }
            mode @ ("mode-float" | "mode-desk" | "mode-gravity" | "mode-space") => {
                let mode = &mode["mode-".len()..];
                let _ = app.state::<TrayControls>().set_mode(mode);
                let _ = app.emit_to("main", "tray:sticker-mode", mode);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
