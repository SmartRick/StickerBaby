//! macOS 平台能力：全局光标、窗口列表、截屏、辅助功能移动窗口、悬浮层窗口样式、焦点归还。
//!
//! 坐标约定：CoreGraphics / AX 使用“点”，原点在主屏（带菜单栏的屏）左上角；
//! tao 的显示器 position / size 是“点 × 该屏 scale”。调用方负责按 scale 换算。

#![allow(non_upper_case_globals, non_snake_case)]

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::{Mutex, OnceLock};

type CFTypeRef = *const c_void;

#[repr(C)]
#[derive(Clone, Copy, Default, Debug)]
pub struct CGPoint {
    pub x: f64,
    pub y: f64,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Debug)]
pub struct CGSize {
    pub width: f64,
    pub height: f64,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Debug)]
pub struct CGRect {
    pub origin: CGPoint,
    pub size: CGSize,
}

impl CGRect {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.origin.x
            && y >= self.origin.y
            && x < self.origin.x + self.size.width
            && y < self.origin.y + self.size.height
    }
}

#[repr(C)]
struct Opaque([u8; 0]);

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    static kCFTypeDictionaryKeyCallBacks: Opaque;
    static kCFTypeDictionaryValueCallBacks: Opaque;
    static kCFBooleanTrue: CFTypeRef;
    fn CFRelease(cf: CFTypeRef);
    fn CFRetain(cf: CFTypeRef) -> CFTypeRef;
    fn CFArrayGetCount(array: CFTypeRef) -> isize;
    fn CFArrayGetValueAtIndex(array: CFTypeRef, index: isize) -> CFTypeRef;
    fn CFDictionaryGetValue(dict: CFTypeRef, key: CFTypeRef) -> CFTypeRef;
    fn CFDictionaryCreate(
        alloc: CFTypeRef,
        keys: *const CFTypeRef,
        values: *const CFTypeRef,
        count: isize,
        key_cb: *const Opaque,
        value_cb: *const Opaque,
    ) -> CFTypeRef;
    fn CFNumberGetValue(number: CFTypeRef, ty: isize, out: *mut c_void) -> bool;
    fn CFStringCreateWithBytes(
        alloc: CFTypeRef,
        bytes: *const u8,
        len: isize,
        encoding: u32,
        external: bool,
    ) -> CFTypeRef;
    fn CFDataGetBytePtr(data: CFTypeRef) -> *const u8;
    fn CFDataGetLength(data: CFTypeRef) -> isize;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    static kCGWindowNumber: CFTypeRef;
    static kCGWindowLayer: CFTypeRef;
    static kCGWindowBounds: CFTypeRef;
    static kCGWindowOwnerPID: CFTypeRef;
    static kCGWindowAlpha: CFTypeRef;
    fn CGEventCreate(source: CFTypeRef) -> CFTypeRef;
    fn CGEventGetLocation(event: CFTypeRef) -> CGPoint;
    fn CGEventSourceButtonState(state: i32, button: u32) -> bool;
    fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> CFTypeRef;
    fn CGRectMakeWithDictionaryRepresentation(dict: CFTypeRef, rect: *mut CGRect) -> bool;
    fn CGGetDisplaysWithPoint(point: CGPoint, max: u32, displays: *mut u32, count: *mut u32) -> i32;
    fn CGDisplayCreateImage(display: u32) -> CFTypeRef;
    fn CGImageGetWidth(image: CFTypeRef) -> usize;
    fn CGImageGetHeight(image: CFTypeRef) -> usize;
    fn CGImageGetBytesPerRow(image: CFTypeRef) -> usize;
    fn CGImageGetBitsPerPixel(image: CFTypeRef) -> usize;
    fn CGImageGetBitmapInfo(image: CFTypeRef) -> u32;
    fn CGImageGetDataProvider(image: CFTypeRef) -> CFTypeRef;
    fn CGDataProviderCopyData(provider: CFTypeRef) -> CFTypeRef;
    fn CGImageRelease(image: CFTypeRef);
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    static kAXTrustedCheckOptionPrompt: CFTypeRef;
    fn AXIsProcessTrustedWithOptions(options: CFTypeRef) -> bool;
    fn AXUIElementCreateApplication(pid: i32) -> CFTypeRef;
    fn AXUIElementCopyAttributeValue(element: CFTypeRef, attr: CFTypeRef, out: *mut CFTypeRef) -> i32;
    fn AXUIElementSetAttributeValue(element: CFTypeRef, attr: CFTypeRef, value: CFTypeRef) -> i32;
    fn AXValueCreate(ty: u32, value: *const c_void) -> CFTypeRef;
    fn AXValueGetValue(value: CFTypeRef, ty: u32, out: *mut c_void) -> bool;
    /// 私有但长期稳定（yabai / Rectangle 等都在用）：AX 窗口 → CGWindowID
    fn _AXUIElementGetWindow(element: CFTypeRef, id: *mut u32) -> i32;
}

const kCFNumberSInt64Type: isize = 4;
const kCFNumberDoubleType: isize = 13;
const kCFStringEncodingUTF8: u32 = 0x0800_0100;
const kCGWindowListOptionOnScreenOnly: u32 = 1 << 0;
const kCGWindowListExcludeDesktopElements: u32 = 1 << 4;
const kAXValueCGPointType: u32 = 1;
const kCGEventSourceStateCombinedSessionState: i32 = 0;

/// 持有一个 CF 对象，Drop 时释放
struct Cf(CFTypeRef);
// CF 对象的引用计数是线程安全的；AX 元素也允许跨线程调用
unsafe impl Send for Cf {}
unsafe impl Sync for Cf {}
impl Drop for Cf {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CFRelease(self.0) }
        }
    }
}

fn cfstr(s: &str) -> Cf {
    Cf(unsafe {
        CFStringCreateWithBytes(std::ptr::null(), s.as_ptr(), s.len() as isize, kCFStringEncodingUTF8, false)
    })
}

unsafe fn dict_i64(dict: CFTypeRef, key: CFTypeRef) -> Option<i64> {
    let v = CFDictionaryGetValue(dict, key);
    let mut out = 0i64;
    (!v.is_null() && CFNumberGetValue(v, kCFNumberSInt64Type, &mut out as *mut _ as *mut c_void)).then_some(out)
}

unsafe fn dict_f64(dict: CFTypeRef, key: CFTypeRef) -> Option<f64> {
    let v = CFDictionaryGetValue(dict, key);
    let mut out = 0f64;
    (!v.is_null() && CFNumberGetValue(v, kCFNumberDoubleType, &mut out as *mut _ as *mut c_void)).then_some(out)
}

// ---------------------------------------------------------------------------
// 光标

/// 全局光标（点）与左 / 右 / 中键是否按下
pub fn cursor() -> Option<(f64, f64, bool)> {
    unsafe {
        let event = CGEventCreate(std::ptr::null());
        if event.is_null() {
            return None;
        }
        let p = CGEventGetLocation(event);
        CFRelease(event);
        let down = (0..3).any(|b| CGEventSourceButtonState(kCGEventSourceStateCombinedSessionState, b));
        Some((p.x, p.y, down))
    }
}

// ---------------------------------------------------------------------------
// 窗口列表

#[derive(Clone, Copy, Debug)]
pub struct WindowInfo {
    pub id: u32,
    pub pid: i32,
    pub layer: i64,
    pub alpha: f64,
    pub bounds: CGRect,
}

/// 屏幕上可见的窗口（不含桌面元素），按 Z 序从前到后
pub fn onscreen_windows() -> Vec<WindowInfo> {
    let mut out = Vec::new();
    unsafe {
        let list = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
            0,
        );
        if list.is_null() {
            return out;
        }
        let list = Cf(list);
        for i in 0..CFArrayGetCount(list.0) {
            let d = CFArrayGetValueAtIndex(list.0, i);
            let mut bounds = CGRect::default();
            let b = CFDictionaryGetValue(d, kCGWindowBounds);
            if b.is_null() || !CGRectMakeWithDictionaryRepresentation(b, &mut bounds) {
                continue;
            }
            let (Some(id), Some(pid)) = (dict_i64(d, kCGWindowNumber), dict_i64(d, kCGWindowOwnerPID)) else {
                continue;
            };
            out.push(WindowInfo {
                id: id as u32,
                pid: pid as i32,
                layer: dict_i64(d, kCGWindowLayer).unwrap_or(0),
                alpha: dict_f64(d, kCGWindowAlpha).unwrap_or(1.0),
                bounds,
            });
        }
    }
    out
}

/// 点 (x, y) 处，桌面层是否没被其他窗口挡住：从前往后找，先遇到桌面层即可见；
/// 置顶层（透明全屏）跳过；在那之前任何不透明窗口盖住该点都视为被挡（含本应用主界面、菜单栏、Dock）
pub fn desktop_visible_at(x: f64, y: f64, desktop_id: u32, floating_id: u32) -> bool {
    for w in onscreen_windows() {
        if w.id == desktop_id {
            return true;
        }
        if w.id == floating_id || w.alpha <= 0.0 {
            continue;
        }
        if w.bounds.contains(x, y) {
            return false;
        }
    }
    true
}

// ---------------------------------------------------------------------------
// 截屏

/// 截取包含点 (x, y) 的显示器，返回 (宽, 高, BGRA 紧密排列的像素)。需要“屏幕录制”权限。
pub fn capture_display_at(x: f64, y: f64) -> Result<(u32, u32, Vec<u8>), String> {
    unsafe {
        if !CGPreflightScreenCaptureAccess() {
            // 首次调用会弹出系统授权；授权后需要重启应用才生效
            CGRequestScreenCaptureAccess();
            return Err("需要屏幕录制权限：系统设置 › 隐私与安全性 › 屏幕与系统录音，允许贴纸宝宝后重启应用".into());
        }
        let mut display = 0u32;
        let mut count = 0u32;
        CGGetDisplaysWithPoint(CGPoint { x, y }, 1, &mut display, &mut count);
        if count == 0 {
            return Err("找不到对应的显示器".into());
        }
        let image = CGDisplayCreateImage(display);
        if image.is_null() {
            return Err("截屏失败".into());
        }
        let result = (|| {
            let w = CGImageGetWidth(image);
            let h = CGImageGetHeight(image);
            let stride = CGImageGetBytesPerRow(image);
            if CGImageGetBitsPerPixel(image) != 32 {
                return Err("不支持的截屏像素格式".to_string());
            }
            let data = CGDataProviderCopyData(CGImageGetDataProvider(image));
            if data.is_null() {
                return Err("读取截屏数据失败".to_string());
            }
            let data = Cf(data);
            let len = CFDataGetLength(data.0) as usize;
            if len < stride * h {
                return Err("截屏数据不完整".to_string());
            }
            let src = std::slice::from_raw_parts(CFDataGetBytePtr(data.0), len);
            let mut out = Vec::with_capacity(w * h * 4);
            for row in 0..h {
                out.extend_from_slice(&src[row * stride..row * stride + w * 4]);
            }
            // kCGBitmapByteOrder32Little + alpha first = 内存中 BGRA（屏幕截图的常规格式）；
            // 大端 / 默认字节序则是 ARGB，换成 BGRA
            let info = CGImageGetBitmapInfo(image);
            if info & 0x7000 != 0x2000 {
                for px in out.chunks_exact_mut(4) {
                    px.reverse();
                }
            }
            Ok((w as u32, h as u32, out))
        })();
        CGImageRelease(image);
        result
    }
}

// ---------------------------------------------------------------------------
// 辅助功能：移动其他应用的窗口

/// 是否已获得“辅助功能”权限；prompt=true 时未授权会弹出系统引导
pub fn accessibility_trusted(prompt: bool) -> bool {
    unsafe {
        if !prompt {
            return AXIsProcessTrustedWithOptions(std::ptr::null());
        }
        let keys = [kAXTrustedCheckOptionPrompt];
        let values = [kCFBooleanTrue];
        let options = Cf(CFDictionaryCreate(
            std::ptr::null(),
            keys.as_ptr(),
            values.as_ptr(),
            1,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks,
        ));
        AXIsProcessTrustedWithOptions(options.0)
    }
}

/// CGWindowID → AX 窗口元素（扰动期间持有，结束后释放）
fn ax_windows() -> &'static Mutex<HashMap<u32, Cf>> {
    static M: OnceLock<Mutex<HashMap<u32, Cf>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 在应用 pid 的 AX 窗口里找到 CGWindowID 对应的元素并登记
fn bind_ax_window(pid: i32, id: u32) -> bool {
    if ax_windows().lock().unwrap().contains_key(&id) {
        return true;
    }
    unsafe {
        let app = Cf(AXUIElementCreateApplication(pid));
        let attr = cfstr("AXWindows");
        let mut windows: CFTypeRef = std::ptr::null();
        if AXUIElementCopyAttributeValue(app.0, attr.0, &mut windows) != 0 || windows.is_null() {
            return false;
        }
        let windows = Cf(windows);
        for i in 0..CFArrayGetCount(windows.0) {
            let el = CFArrayGetValueAtIndex(windows.0, i);
            let mut wid = 0u32;
            if _AXUIElementGetWindow(el, &mut wid) == 0 && wid == id {
                // CFArray 只是借用，自己 retain 一份
                ax_windows().lock().unwrap().insert(id, Cf(CFRetain(el)));
                return true;
            }
        }
    }
    false
}

/// 可扰动的其他应用窗口（普通层级、可见、非本进程），按 Z 序从前到后，已绑定 AX 元素
pub fn movable_windows(max: usize) -> Vec<u32> {
    let own = std::process::id() as i32;
    onscreen_windows()
        .into_iter()
        .filter(|w| {
            w.layer == 0
                && w.pid != own
                && w.alpha > 0.0
                && w.bounds.size.width >= 80.0
                && w.bounds.size.height >= 60.0
        })
        .filter(|w| bind_ax_window(w.pid, w.id))
        .take(max)
        .map(|w| w.id)
        .collect()
}

fn with_ax<T>(id: u32, f: impl FnOnce(CFTypeRef) -> Option<T>) -> Option<T> {
    let map = ax_windows().lock().unwrap();
    let el = map.get(&id)?;
    f(el.0)
}

/// 窗口左上角（点）
pub fn ax_window_pos(id: u32) -> Option<(f64, f64)> {
    with_ax(id, |el| unsafe {
        let attr = cfstr("AXPosition");
        let mut value: CFTypeRef = std::ptr::null();
        if AXUIElementCopyAttributeValue(el, attr.0, &mut value) != 0 || value.is_null() {
            return None;
        }
        let value = Cf(value);
        let mut p = CGPoint::default();
        AXValueGetValue(value.0, kAXValueCGPointType, &mut p as *mut _ as *mut c_void).then_some((p.x, p.y))
    })
}

pub fn ax_move_to(id: u32, x: f64, y: f64) {
    with_ax(id, |el| unsafe {
        let p = CGPoint { x, y };
        let value = Cf(AXValueCreate(kAXValueCGPointType, &p as *const _ as *const c_void));
        let attr = cfstr("AXPosition");
        AXUIElementSetAttributeValue(el, attr.0, value.0);
        Some(())
    });
}

pub fn ax_release(id: u32) {
    ax_windows().lock().unwrap().remove(&id);
}

pub fn ax_release_all() {
    ax_windows().lock().unwrap().clear();
}

// ---------------------------------------------------------------------------
// AppKit：悬浮层窗口样式、焦点归还

use objc2_app_kit::{
    NSApplicationActivationOptions, NSRunningApplication, NSWindow, NSWindowCollectionBehavior,
    NSWorkspace,
};

/// 菜单栏状态图标所在层级，置顶层与其同级：能盖住菜单栏和全屏应用
const NS_STATUS_WINDOW_LEVEL: isize = 25;

/// 悬浮层：所有桌面空间可见、不随调度中心移动、跳过 ⌘` 切换、可出现在全屏应用之上。
/// 置顶层再提到状态栏层级。必须在主线程调用。返回窗口号（= CGWindowID）。
pub fn configure_overlay(ns_window: *mut c_void, floating: bool) -> u32 {
    if ns_window.is_null() {
        return 0;
    }
    let window = unsafe { &*(ns_window as *const NSWindow) };
    window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle
            | NSWindowCollectionBehavior::FullScreenAuxiliary,
    );
    if floating {
        window.setLevel(NS_STATUS_WINDOW_LEVEL);
    }
    window.setHasShadow(false);
    window.windowNumber() as u32
}

/// 显示窗口但不激活应用（主线程）
pub fn order_front_no_activate(ns_window: *mut c_void) {
    if ns_window.is_null() {
        return;
    }
    let window = unsafe { &*(ns_window as *const NSWindow) };
    window.orderFrontRegardless();
}

/// 当前前台应用的 pid
pub fn frontmost_pid() -> Option<i32> {
    NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .map(|app| app.processIdentifier())
}

pub fn self_is_active() -> bool {
    NSRunningApplication::currentApplication().isActive()
}

/// 把前台还给 pid 对应的应用（只有自己是前台时系统才允许让出）
pub fn activate_pid(pid: i32) {
    if let Some(app) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
        #[allow(deprecated)]
        app.activateWithOptions(NSApplicationActivationOptions::empty());
    }
}
