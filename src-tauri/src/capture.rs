//! 屏幕截取（GDI BitBlt，取 DWM 合成后的画面，包含悬浮层自身内容）。
//! 返回原始 BGRA 字节：前 8 字节为 width/height（u32 LE），前端直接上传为 WebGL 纹理，
//! 避免 PNG 编解码开销（1080p 约 8MB，走 Tauri 二进制 IPC）。

use crate::overlay::OverlayState;
use tauri::ipc::Response;
use tauri::State;

#[tauri::command]
pub async fn capture_screen(state: State<'_, OverlayState>) -> Result<Response, String> {
    let r = state.info.lock().unwrap().rect;
    let bytes = grab(r.x, r.y, r.width as i32, r.height as i32)?;
    Ok(Response::new(bytes))
}

#[cfg(windows)]
fn grab(x: i32, y: i32, w: i32, h: i32) -> Result<Vec<u8>, String> {
    use std::ffi::c_void;
    use windows::Win32::Graphics::Gdi::*;
    unsafe {
        let screen = GetDC(None);
        let mem = CreateCompatibleDC(Some(screen));
        let mut bmi = BITMAPINFO::default();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = w;
        bmi.bmiHeader.biHeight = -h; // top-down
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB.0;
        let mut bits: *mut c_void = std::ptr::null_mut();
        let result = (|| {
            let dib = CreateDIBSection(Some(mem), &bmi, DIB_RGB_COLORS, &mut bits, None, 0)
                .map_err(|e| e.to_string())?;
            let old = SelectObject(mem, dib.into());
            let ok = BitBlt(mem, 0, 0, w, h, Some(screen), x, y, SRCCOPY | CAPTUREBLT);
            let len = (w * h * 4) as usize;
            let mut out = Vec::with_capacity(len + 8);
            out.extend_from_slice(&(w as u32).to_le_bytes());
            out.extend_from_slice(&(h as u32).to_le_bytes());
            if ok.is_ok() && !bits.is_null() {
                out.extend_from_slice(std::slice::from_raw_parts(bits as *const u8, len));
            }
            SelectObject(mem, old);
            let _ = DeleteObject(dib.into());
            ok.map_err(|e| e.to_string())?;
            Ok(out)
        })();
        let _ = DeleteDC(mem);
        ReleaseDC(None, screen);
        result
    }
}

#[cfg(not(windows))]
fn grab(_x: i32, _y: i32, _w: i32, _h: i32) -> Result<Vec<u8>, String> {
    Err("capture not supported on this platform yet".into())
}
