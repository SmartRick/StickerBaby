//! 窗口扰动：真实移动其他应用的顶层窗口（抖动 / 弹跳 / 错位 / 震荡），结束后精确还原。
//!
//! 安全设计：
//! - 所有被扰动窗口的原始位置登记在全局表中，同一窗口重复触发时沿用最初位置；
//! - 动画结束、取消、一键清场（Ctrl+Alt+Q）、程序退出时都会还原；
//! - 只移动位置（SWP_NOSIZE | SWP_NOACTIVATE），不改变大小、层级和焦点；
//! - 跳过自身窗口、最小化 / 隐藏 / cloaked（其他虚拟桌面、UWP 挂起）窗口、桌面和任务栏；
//! - 管理员权限窗口受 UIPI 限制无法移动，调用失败时静默忽略。
//! - macOS 通过辅助功能（AX）API 移动窗口，需要用户在“辅助功能”里授权；坐标单位是点。

use serde::Deserialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub enum FxKind {
    /// 随机抖动，强度随时间衰减
    Shake,
    /// 像球一样从高处落下弹跳
    Bounce,
    /// 短暂错位：跳到几个随机偏移位置停顿后归位
    Offset,
    /// 左右正弦震荡
    Wobble,
}

#[derive(Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub enum FxTarget {
    Foreground,
    All,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FxRequest {
    pub kind: FxKind,
    pub target: FxTarget,
    #[serde(default = "default_duration")]
    pub duration_ms: u64,
    /// 0..1，映射到最大位移
    #[serde(default = "default_intensity")]
    pub intensity: f64,
}

fn default_duration() -> u64 {
    900
}
fn default_intensity() -> f64 {
    0.6
}

/// hwnd -> (原始 x, y, 持有者 run id)
fn registry() -> &'static Mutex<HashMap<isize, (i32, i32, u64)>> {
    static R: OnceLock<Mutex<HashMap<isize, (i32, i32, u64)>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashMap::new()))
}

static RUN_ID: AtomicU64 = AtomicU64::new(0);
static CANCEL_GEN: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
pub fn window_fx(req: FxRequest) -> Result<usize, String> {
    #[cfg(any(windows, target_os = "macos"))]
    {
        #[cfg(target_os = "macos")]
        if !crate::platform::macos::accessibility_trusted(true) {
            return Err("需要辅助功能权限：系统设置 › 隐私与安全性 › 辅助功能，允许贴纸宝宝".into());
        }
        let targets = win::collect_targets(req.target);
        let count = targets.len();
        if count == 0 {
            return Ok(0);
        }
        let run = RUN_ID.fetch_add(1, Ordering::SeqCst) + 1;
        let gen = CANCEL_GEN.load(Ordering::SeqCst);
        let mut items = Vec::new();
        {
            let mut reg = registry().lock().unwrap();
            for h in targets {
                let Some((x, y)) = win::window_pos(h) else { continue };
                let entry = reg.entry(h).or_insert((x, y, run));
                entry.2 = run; // 接管：新的动画以最初登记的位置为基准
                items.push((h, entry.0, entry.1));
            }
        }
        std::thread::spawn(move || animate(req, run, gen, items));
        Ok(count)
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = req;
        Err("window fx not supported on this platform yet".into())
    }
}

#[tauri::command]
pub fn window_fx_cancel() {
    cancel_all();
}

/// 取消所有进行中的扰动并把窗口还原到原始位置
pub fn cancel_all() {
    CANCEL_GEN.fetch_add(1, Ordering::SeqCst);
    let mut reg = registry().lock().unwrap();
    #[cfg(any(windows, target_os = "macos"))]
    for (h, (x, y, _)) in reg.iter() {
        win::move_to(*h, *x, *y);
    }
    reg.clear();
    #[cfg(target_os = "macos")]
    crate::platform::macos::ax_release_all();
}

#[cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))]
fn animate(req: FxRequest, run: u64, gen: u64, items: Vec<(isize, i32, i32)>) {
    let dur = Duration::from_millis(req.duration_ms.clamp(100, 10_000));
    let amp = 6.0 + 60.0 * req.intensity.clamp(0.0, 1.0);
    let start = Instant::now();
    let mut rng = Rng(run.wrapping_mul(0x9E3779B97F4A7C15) | 1);
    // 错位效果的关键帧：(开始时刻比例, dx, dy)
    let offset_keys: Vec<(f64, f64, f64)> = (0..4)
        .map(|i| (i as f64 / 4.0, rng.signed() * amp * 1.4, rng.signed() * amp * 0.6))
        .collect();

    loop {
        if CANCEL_GEN.load(Ordering::SeqCst) != gen {
            return; // cancel_all 已负责还原
        }
        let t = start.elapsed().as_secs_f64() / dur.as_secs_f64();
        if t >= 1.0 {
            break;
        }
        let decay = 1.0 - t;
        let (dx, dy) = match req.kind {
            FxKind::Shake => (rng.signed() * amp * decay, rng.signed() * amp * decay),
            FxKind::Wobble => ((t * std::f64::consts::TAU * 6.0).sin() * amp * decay, 0.0),
            FxKind::Bounce => {
                // 阻尼弹跳：|cos| 曲线，每次反弹高度衰减
                let bounces = 4.0;
                let phase = t * bounces;
                let k = phase.floor();
                let local = phase - k;
                let height = amp * 2.2 * 0.55f64.powf(k);
                (0.0, -height * (std::f64::consts::PI * local).sin())
            }
            FxKind::Offset => {
                // 前 70% 时间在关键帧间跳变（无插值，模拟“卡顿错位”），之后归位
                if t < 0.7 {
                    let seg = ((t / 0.7) * offset_keys.len() as f64) as usize;
                    let (_, ox, oy) = offset_keys[seg.min(offset_keys.len() - 1)];
                    (ox, oy)
                } else {
                    (0.0, 0.0)
                }
            }
        };
        for &(h, x, y) in &items {
            if owned_by(h, run) {
                #[cfg(any(windows, target_os = "macos"))]
                win::move_to(h, x + dx.round() as i32, y + dy.round() as i32);
            }
        }
        std::thread::sleep(Duration::from_millis(8));
    }

    let mut reg = registry().lock().unwrap();
    for &(h, x, y) in &items {
        if reg.get(&h).map(|e| e.2) == Some(run) {
            #[cfg(any(windows, target_os = "macos"))]
            win::move_to(h, x, y);
            reg.remove(&h);
            #[cfg(target_os = "macos")]
            crate::platform::macos::ax_release(h as u32);
        }
    }
}

fn owned_by(h: isize, run: u64) -> bool {
    registry().lock().unwrap().get(&h).map(|e| e.2) == Some(run)
}

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }
    fn signed(&mut self) -> f64 {
        self.next() * 2.0 - 1.0
    }
}

#[cfg(windows)]
mod win {
    use super::FxTarget;
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::UI::WindowsAndMessaging::*;

    const MAX_WINDOWS: usize = 12;

    fn hwnd(h: isize) -> HWND {
        HWND(h as _)
    }

    pub fn window_pos(h: isize) -> Option<(i32, i32)> {
        let mut r = RECT::default();
        unsafe { GetWindowRect(hwnd(h), &mut r).ok()? };
        Some((r.left, r.top))
    }

    pub fn move_to(h: isize, x: i32, y: i32) {
        unsafe {
            let _ = SetWindowPos(
                hwnd(h),
                None,
                x,
                y,
                0,
                0,
                SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS,
            );
        }
    }

    fn is_candidate(h: HWND) -> bool {
        unsafe {
            if !IsWindowVisible(h).as_bool() || IsIconic(h).as_bool() {
                return false;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(h, Some(&mut pid));
            if pid == std::process::id() {
                return false;
            }
            let ex = GetWindowLongPtrW(h, GWL_EXSTYLE) as u32;
            if ex & WS_EX_TOOLWINDOW.0 != 0 {
                return false;
            }
            if GetWindow(h, GW_OWNER).map(|o| !o.is_invalid()).unwrap_or(false) {
                return false;
            }
            if GetWindowTextLengthW(h) == 0 {
                return false;
            }
            let mut cloaked = 0u32;
            let _ = DwmGetWindowAttribute(
                h,
                DWMWA_CLOAKED,
                &mut cloaked as *mut u32 as *mut _,
                std::mem::size_of::<u32>() as u32,
            );
            if cloaked != 0 {
                return false;
            }
            let mut buf = [0u16; 64];
            let n = GetClassNameW(h, &mut buf) as usize;
            let class = String::from_utf16_lossy(&buf[..n]);
            !matches!(
                class.as_str(),
                "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
            )
        }
    }

    unsafe extern "system" fn enum_cb(h: HWND, lp: LPARAM) -> BOOL {
        let out = &mut *(lp.0 as *mut Vec<isize>);
        if is_candidate(h) {
            out.push(h.0 as isize);
        }
        BOOL::from(out.len() < MAX_WINDOWS)
    }

    /// EnumWindows 按 Z 序从顶到底枚举
    fn visible_windows() -> Vec<isize> {
        let mut out: Vec<isize> = Vec::new();
        unsafe {
            let _ = EnumWindows(Some(enum_cb), LPARAM(&mut out as *mut _ as isize));
        }
        out
    }

    pub fn collect_targets(target: FxTarget) -> Vec<isize> {
        match target {
            FxTarget::All => visible_windows(),
            FxTarget::Foreground => {
                let fg = unsafe { GetForegroundWindow() };
                if !fg.is_invalid() && is_candidate(fg) {
                    vec![fg.0 as isize]
                } else {
                    // 前台是自己（控制面板）时，取 Z 序最高的其他应用窗口
                    visible_windows().into_iter().take(1).collect()
                }
            }
        }
    }
}

/// macOS：窗口 id 为 CGWindowID，移动通过 AX 元素（platform::macos 里登记 / 释放）
#[cfg(target_os = "macos")]
mod win {
    use super::FxTarget;
    use crate::platform::macos;

    /// AX 调用是跨进程 IPC，比 SetWindowPos 慢，少动几个窗口保证动画流畅
    const MAX_WINDOWS: usize = 6;

    pub fn window_pos(h: isize) -> Option<(i32, i32)> {
        let (x, y) = macos::ax_window_pos(h as u32)?;
        Some((x.round() as i32, y.round() as i32))
    }

    pub fn move_to(h: isize, x: i32, y: i32) {
        macos::ax_move_to(h as u32, x as f64, y as f64);
    }

    /// movable_windows 已按 Z 序从前到后，第一个就是前台窗口
    pub fn collect_targets(target: FxTarget) -> Vec<isize> {
        let max = match target {
            FxTarget::All => MAX_WINDOWS,
            FxTarget::Foreground => 1,
        };
        macos::movable_windows(max).into_iter().map(|id| id as isize).collect()
    }
}
