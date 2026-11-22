//! 桌面相关能力：判断当前前台是否为桌面、隐藏 / 恢复系统桌面图标（熊猫烧香用）。
//!
//! 隐藏图标属于系统级显示改动：记录状态，在恶作剧结束、一键清场、退出程序时都会恢复。

use std::sync::atomic::{AtomicBool, Ordering};

static ICONS_HIDDEN: AtomicBool = AtomicBool::new(false);

/// 前台窗口是否为桌面（Progman / WorkerW），即用户正看着桌面
#[tauri::command]
pub fn desktop_foreground() -> bool {
    #[cfg(windows)]
    {
        win::foreground_is_desktop()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// 显示 / 隐藏系统桌面图标，返回是否找到了图标列表窗口
#[tauri::command]
pub fn desktop_icons(visible: bool) -> bool {
    #[cfg(windows)]
    {
        let ok = win::set_icons_visible(visible);
        if ok {
            ICONS_HIDDEN.store(!visible, Ordering::SeqCst);
        }
        ok
    }
    #[cfg(not(windows))]
    {
        let _ = visible;
        false
    }
}

/// 若之前隐藏了桌面图标则恢复
pub fn restore() {
    if ICONS_HIDDEN.swap(false, Ordering::SeqCst) {
        #[cfg(windows)]
        win::set_icons_visible(true);
    }
}

#[cfg(windows)]
mod win {
    use windows::core::{w, BOOL, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::*;

    fn class_of(h: HWND) -> String {
        let mut buf = [0u16; 64];
        let n = unsafe { GetClassNameW(h, &mut buf) } as usize;
        String::from_utf16_lossy(&buf[..n])
    }

    pub fn foreground_is_desktop() -> bool {
        let fg = unsafe { GetForegroundWindow() };
        if fg.is_invalid() {
            return false;
        }
        matches!(class_of(fg).as_str(), "Progman" | "WorkerW")
    }

    unsafe extern "system" fn find_defview(h: HWND, lp: LPARAM) -> BOOL {
        let out = &mut *(lp.0 as *mut Option<HWND>);
        if let Ok(dv) = FindWindowExW(Some(h), None, w!("SHELLDLL_DefView"), PCWSTR::null()) {
            *out = Some(dv);
            return BOOL(0);
        }
        BOOL(1)
    }

    /// 桌面图标是 SHELLDLL_DefView 下的 SysListView32；DefView 通常挂在 Progman 下，
    /// 切换过壁纸后可能挂到某个 WorkerW 下
    fn icon_list() -> Option<HWND> {
        unsafe {
            let mut defview = FindWindowW(w!("Progman"), PCWSTR::null())
                .ok()
                .and_then(|p| FindWindowExW(Some(p), None, w!("SHELLDLL_DefView"), PCWSTR::null()).ok());
            if defview.is_none() {
                let mut found: Option<HWND> = None;
                let _ = EnumWindows(Some(find_defview), LPARAM(&mut found as *mut _ as isize));
                defview = found;
            }
            FindWindowExW(Some(defview?), None, w!("SysListView32"), PCWSTR::null()).ok()
        }
    }

    pub fn set_icons_visible(visible: bool) -> bool {
        let Some(list) = icon_list() else { return false };
        unsafe {
            let _ = ShowWindow(list, if visible { SW_SHOW } else { SW_HIDE });
        }
        true
    }
}
