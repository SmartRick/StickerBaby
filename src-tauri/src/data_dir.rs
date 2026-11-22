//! 数据存储（绿色便携）。
//!
//! 优先 exe 同级的 `data\`：自创贴纸、AI 模型、WebView 配置（设置与贴纸摆放的
//! localStorage）全部跟着软件走，卸载重装不丢、不占系统盘；目录写不进去
//! （例如装在 Program Files）时自动退回系统的 AppData\Local。
//!
//! 注意：三个窗口的 WebView 数据目录必须一致，否则 localStorage /
//! BroadcastChannel 的共享状态同步会断（各窗口看不到彼此的贴纸与设置）。
//! 从旧版升级时，AppData 里已有的贴纸与模型会自动搬到这里。

use std::{fs, path::{Path, PathBuf}, sync::OnceLock};
use tauri::{AppHandle, Manager};

static PORTABLE: OnceLock<Option<PathBuf>> = OnceLock::new();

fn current_exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
}

fn app_local_data(app: &AppHandle) -> PathBuf {
    app.path()
        .app_local_data_dir()
        .unwrap_or_else(|_| current_exe_dir())
}

/// 便携根目录；不可写返回 None
fn portable_root() -> Option<&'static PathBuf> {
    PORTABLE
        .get_or_init(|| {
            let root = current_exe_dir().join("data");
            let writable = fs::create_dir_all(root.join("stickers")).is_ok()
                && fs::create_dir_all(root.join("models")).is_ok()
                && fs::write(root.join(".probe"), b"ok").is_ok();
            if writable {
                let _ = fs::remove_file(root.join(".probe"));
                Some(root)
            } else {
                None
            }
        })
        .as_ref()
}

/// 贴纸 / AI 模型的根目录：便携 data\（含旧数据搬迁）或系统 AppData
pub fn app_data_root(app: &AppHandle) -> PathBuf {
    match portable_root() {
        Some(root) => {
            migrate_legacy(app, root);
            root.clone()
        }
        None => app_local_data(app),
    }
}

/// 三个窗口共用的 WebView 数据目录；便携不可用时返回 None（走系统默认位置）
pub fn webview_dir() -> Option<PathBuf> {
    portable_root().map(|root| root.join("webview"))
}

/// 旧版数据在 AppData\Local\com.deskpet.app 下：贴纸复制过去（保留原件），
/// 模型搬过去（文件大，搬完删原件，失败则下次重新下载）；目标已存在时跳过
fn migrate_legacy(app: &AppHandle, target: &PathBuf) {
    let legacy = app_local_data(app);
    if legacy == *target {
        return;
    }
    copy_tree(&legacy.join("stickers"), &target.join("stickers"), false);
    copy_tree(&legacy.join("models"), &target.join("models"), true);
}

fn copy_tree(from: &PathBuf, to: &PathBuf, remove_source: bool) {
    let Ok(entries) = fs::read_dir(from) else { return };
    let _ = fs::create_dir_all(to);
    for entry in entries.flatten() {
        let to = to.join(entry.file_name());
        if to.exists() {
            continue;
        }
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_dir() {
            copy_tree(&entry.path(), &to, remove_source);
        } else if fs::copy(entry.path(), &to).is_ok() && remove_source {
            let _ = fs::remove_file(entry.path());
        }
    }
    // 目录搬空（或本来就空）时顺手清掉；非空说明还有文件，保留现场
    if remove_source && fs::read_dir(from).map(|mut it| it.next().is_none()).unwrap_or(false) {
        let _ = fs::remove_dir(from);
    }
}
