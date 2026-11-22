use std::{
    fs::{self, File},
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};

use image::{ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{
    ipc::{Channel, InvokeBody, Request, Response},
    AppHandle, Manager, WebviewWindow,
};

const MAX_FILE_BYTES: usize = 25 * 1024 * 1024;
const MAX_IMAGE_PIXELS: u64 = 32_000_000;
const MAX_IMAGE_SIDE: u32 = 8192;
const CREATE_WINDOW: &str = "main";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedSticker {
    id: String,
    name: String,
    path: PathBuf,
    /// 缺省为图片；"video" 为视频贴纸
    #[serde(default, skip_serializing_if = "Option::is_none")]
    media: Option<String>,
    /// 视频绿幕抠像参数（前端 ChromaKey），原样保存
    #[serde(default, skip_serializing_if = "Option::is_none")]
    chroma: Option<serde_json::Value>,
}

fn ensure_creator(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == CREATE_WINDOW {
        Ok(())
    } else {
        Err("请在主窗口创建贴纸。".into())
    }
}

fn app_directory(app: &AppHandle, subdirectory: &str) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join(subdirectory);
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn raw_body<'a>(body: &'a InvokeBody) -> Result<&'a [u8], String> {
    match body {
        InvokeBody::Raw(bytes) => Ok(bytes),
        _ => Err("无法读取图片数据。".into()),
    }
}

async fn background<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn save_created_sticker(
    app: AppHandle,
    window: WebviewWindow,
    request: Request<'_>,
) -> Result<CreatedSticker, String> {
    ensure_creator(&window)?;
    let data = raw_body(request.body())?;
    let size_bytes = data.get(..2).ok_or("无法读取贴纸名称。")?;
    let name_size = u16::from_le_bytes([size_bytes[0], size_bytes[1]]) as usize;
    let name = std::str::from_utf8(data.get(2..2 + name_size).ok_or("无法读取贴纸名称。")?)
        .map_err(|_| "贴纸名称无法读取。")?
        .trim();
    if name.is_empty() || name.chars().count() > 60 || name.chars().any(char::is_control) {
        return Err("请输入 1 到 60 个字符的贴纸名称。".into());
    }
    let name = name.to_owned();
    let bytes = &data[2 + name_size..];
    if bytes.is_empty() || bytes.len() > MAX_FILE_BYTES {
        return Err("请选择不超过 25 MB 的图片。".into());
    }
    let bytes = bytes.to_vec();

    background(move || {
        let reader = ImageReader::new(Cursor::new(&bytes))
            .with_guessed_format()
            .map_err(|error| error.to_string())?;
        let filename = match reader.format() {
            Some(ImageFormat::Png) => "image.png",
            Some(ImageFormat::Jpeg) => "image.jpg",
            Some(ImageFormat::WebP) => "image.webp",
            _ => return Err("仅支持 PNG、JPG 和 WebP 图片。".into()),
        };
        let (width, height) = reader.into_dimensions().map_err(|_| "无法读取图片尺寸。")?;
        if width == 0
            || height == 0
            || width > MAX_IMAGE_SIDE
            || height > MAX_IMAGE_SIDE
            || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS
        {
            return Err("图片尺寸过大，请缩小后再试。".into());
        }

        let root = app_directory(&app, "stickers")?;
        let id = format!("created-{}", uuid::Uuid::new_v4());
        let saved = CreatedSticker {
            id: id.clone(),
            name,
            path: root.join(&id).join(filename),
            media: None,
            chroma: None,
        };
        let pending = tempfile::tempdir_in(&root).map_err(|error| error.to_string())?;
        fs::write(pending.path().join(filename), bytes).map_err(|error| error.to_string())?;
        let meta = serde_json::to_vec(&saved).map_err(|error| error.to_string())?;
        fs::write(pending.path().join("sticker.json"), meta).map_err(|error| error.to_string())?;
        fs::rename(pending.path(), root.join(&id)).map_err(|error| error.to_string())?;
        Ok(saved)
    })
    .await
}

const MAX_VIDEO_BYTES: usize = 200 * 1024 * 1024;

/// 导入视频贴纸。请求体为原始视频字节；名称、扩展名、抠像参数通过请求头传入
/// （`x-name` 为 URI 编码的名称，`x-ext` 为 mp4/webm/mov，`x-chroma` 为 JSON 或空）。
#[tauri::command]
pub async fn save_created_video(
    app: AppHandle,
    window: WebviewWindow,
    request: Request<'_>,
) -> Result<CreatedSticker, String> {
    ensure_creator(&window)?;
    let header = |key: &str| {
        request
            .headers()
            .get(key)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned)
    };
    let name = header("x-name")
        .map(|raw| percent_decode(&raw))
        .unwrap_or_default()
        .trim()
        .to_owned();
    if name.is_empty() || name.chars().count() > 60 || name.chars().any(char::is_control) {
        return Err("请输入 1 到 60 个字符的贴纸名称。".into());
    }
    let ext = header("x-ext").unwrap_or_default().to_ascii_lowercase();
    if !["mp4", "webm", "mov"].contains(&ext.as_str()) {
        return Err("仅支持 MP4、WebM 和 MOV 视频。".into());
    }
    let chroma = header("x-chroma")
        .filter(|raw| !raw.is_empty())
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
    let bytes = raw_body(request.body())?;
    if bytes.is_empty() || bytes.len() > MAX_VIDEO_BYTES {
        return Err("请选择不超过 200 MB 的视频。".into());
    }
    let bytes = bytes.to_vec();
    background(move || {
        let root = app_directory(&app, "stickers")?;
        let id = format!("created-{}", uuid::Uuid::new_v4());
        let filename = format!("video.{ext}");
        let saved = CreatedSticker {
            id: id.clone(),
            name,
            path: root.join(&id).join(&filename),
            media: Some("video".into()),
            chroma,
        };
        let pending = tempfile::tempdir_in(&root).map_err(|error| error.to_string())?;
        fs::write(pending.path().join(&filename), bytes).map_err(|error| error.to_string())?;
        let meta = serde_json::to_vec(&saved).map_err(|error| error.to_string())?;
        fs::write(pending.path().join("sticker.json"), meta).map_err(|error| error.to_string())?;
        fs::rename(pending.path(), root.join(&id)).map_err(|error| error.to_string())?;
        Ok(saved)
    })
    .await
}

fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(value) = std::str::from_utf8(&bytes[i + 1..i + 3])
                .ok()
                .and_then(|hex| u8::from_str_radix(hex, 16).ok())
            {
                out.push(value);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[tauri::command]
pub async fn list_created_stickers(app: AppHandle) -> Result<Vec<CreatedSticker>, String> {
    background(move || {
        let root = app_directory(&app, "stickers")?;
        let mut result = Vec::new();
        for entry in fs::read_dir(root)
            .map_err(|error| error.to_string())?
            .flatten()
        {
            let id = entry.file_name();
            let Some(id) = id.to_str().filter(|name| name.starts_with("created-")) else {
                continue;
            };
            // Resolve the image relative to the metadata for moves or restored backups.
            let folder = entry.path();
            let Ok(meta) = fs::read(folder.join("sticker.json")) else {
                continue;
            };
            let Ok(mut sticker) = serde_json::from_slice::<CreatedSticker>(&meta) else {
                continue;
            };
            if sticker.id != id {
                continue;
            }
            let Some(filename) = sticker.path.file_name() else {
                continue;
            };
            let path = folder.join(filename);
            if path.is_file() {
                sticker.path = path;
                result.push((
                    entry.metadata().ok().and_then(|value| value.created().ok()),
                    sticker,
                ));
            }
        }
        result.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.id.cmp(&a.1.id)));
        Ok(result.into_iter().map(|(_, sticker)| sticker).collect())
    })
    .await
}

#[tauri::command]
pub async fn delete_created_sticker(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
) -> Result<(), String> {
    ensure_creator(&window)?;
    let valid = id.starts_with("created-")
        && id.len() <= 80
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-');
    if !valid {
        return Err("无效的贴纸编号。".into());
    }
    background(move || {
        let root = app_directory(&app, "stickers")?;
        match fs::remove_dir_all(root.join(&id)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("删除创作失败。{error}")),
        }
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CutoutModel {
    Birefnet,
    Isnet,
}

struct ModelDownload {
    filename: &'static str,
    url: &'static str,
    bytes: u64,
    sha256: &'static str,
}

impl CutoutModel {
    fn download(&self) -> ModelDownload {
        match self {
            Self::Birefnet => ModelDownload {
                filename: "birefnet-lite-512-fp16.onnx",
                url: "https://huggingface.co/studioludens/birefnet-lite-512/resolve/18d56c5/onnx/model_fp16.onnx",
                bytes: 98_484_532,
                sha256: "eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516",
            },
            Self::Isnet => ModelDownload {
                filename: "isnet-general-use.onnx",
                url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
                bytes: 178_648_008,
                sha256: "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a",
            },
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProgress {
    downloaded: u64,
    total: u64,
}

static MODEL_DOWNLOAD: Mutex<()> = Mutex::new(());

fn cache_matches(path: &Path, model: &ModelDownload) -> bool {
    let Ok(mut file) = File::open(path) else {
        return false;
    };
    if file.metadata().ok().map(|data| data.len()) != Some(model.bytes) {
        return false;
    }
    let mut digest = Sha256::new();
    std::io::copy(&mut file, &mut digest).is_ok()
        && format!("{:x}", digest.finalize()) == model.sha256
}

#[tauri::command]
pub async fn prepare_cutout_model(
    app: AppHandle,
    window: WebviewWindow,
    model: CutoutModel,
    progress: Channel<ModelProgress>,
) -> Result<PathBuf, String> {
    ensure_creator(&window)?;
    background(move || {
        let _active_download = MODEL_DOWNLOAD.lock().map_err(|error| error.to_string())?;
        let root = app_directory(&app, "models")?;
        let download = model.download();
        let path = root.join(download.filename);
        if cache_matches(&path, &download) {
            return Ok(path);
        }
        // A previous download can be corrupt or from an older model version.
        // Remove it first: renaming a temp file over an existing target fails
        // on Windows and would otherwise make the model permanently unusable.
        if path.exists() {
            fs::remove_file(&path).map_err(|error| error.to_string())?;
        }
        let _ = progress.send(ModelProgress {
            downloaded: 0,
            total: download.bytes,
        });
        let client = reqwest::blocking::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(480))
            .user_agent("DeskPet/0.1")
            .build()
            .map_err(|error| error.to_string())?;
        let mut response = client
            .get(download.url)
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|error| format!("模型下载失败，请检查网络后重试。{error}"))?;

        let mut tempfile =
            tempfile::NamedTempFile::new_in(root).map_err(|error| error.to_string())?;
        let mut digest = Sha256::new();
        let mut written = 0;
        let mut last_update = Instant::now();
        let mut buffer = vec![0; 128 * 1024];
        loop {
            let count = response
                .read(&mut buffer)
                .map_err(|error| format!("模型下载中断。{error}"))?;
            if count == 0 {
                break;
            }
            written += count as u64;
            if written > download.bytes {
                return Err("模型大小与预期不符，请重试。".into());
            }
            digest.update(&buffer[..count]);
            tempfile
                .write_all(&buffer[..count])
                .map_err(|error| error.to_string())?;
            if last_update.elapsed() >= Duration::from_millis(140) {
                let _ = progress.send(ModelProgress {
                    downloaded: written,
                    total: download.bytes,
                });
                last_update = Instant::now();
            }
        }

        if written != download.bytes || format!("{:x}", digest.finalize()) != download.sha256 {
            return Err("模型校验失败，请重试。".into());
        }
        tempfile
            .as_file()
            .sync_all()
            .map_err(|error| error.to_string())?;
        tempfile.persist(&path).map_err(|error| error.to_string())?;
        let _ = progress.send(ModelProgress {
            downloaded: written,
            total: download.bytes,
        });
        Ok(path)
    })
    .await
}

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
fn isnet_alpha(app: AppHandle, input: Vec<u8>) -> Result<Vec<u8>, String> {
    use ort::{session::Session, value::Tensor};
    use std::sync::OnceLock;
    use tauri::path::BaseDirectory;

    // A single background inference avoids parallel CPU bursts on the desktop layer.
    static INFERENCE: Mutex<()> = Mutex::new(());
    static RUNTIME: OnceLock<()> = OnceLock::new();
    let _active_inference = INFERENCE.lock().map_err(|error| error.to_string())?;
    if RUNTIME.get().is_none() {
        let dll = app
            .path()
            .resolve(
                "resources/onnxruntime/onnxruntime.dll",
                BaseDirectory::Resource,
            )
            .map_err(|error| error.to_string())?;
        ort::init_from(dll)
            .map_err(|error| error.to_string())?
            .commit();
        let _ = RUNTIME.set(());
    }
    let model = app_directory(&app, "models")?.join(CutoutModel::Isnet.download().filename);
    let input: Vec<f32> = input
        .chunks_exact(4)
        .map(|bytes| f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
        .collect();
    let attempt = (|| -> ort::Result<Vec<u8>> {
        let mut session = Session::builder()?
            .with_intra_threads(2)?
            .with_inter_threads(1)?
            .commit_from_file(model)?;
        let tensor = Tensor::from_array(([1, 3, 1024, 1024], input))?;
        let values = session.run(ort::inputs![tensor])?;
        let (_, mask) = values[0].try_extract_tensor::<f32>()?;
        let (low, high) = mask
            .iter()
            .fold((f32::INFINITY, f32::NEG_INFINITY), |(low, high), pixel| {
                (low.min(*pixel), high.max(*pixel))
            });
        let range = (high - low).max(1e-7);
        Ok(mask
            .iter()
            .map(|pixel| ((pixel - low) / range * 255.0).round() as u8)
            .collect())
    })();
    attempt.map_err(|error| format!("CPU 抠图失败。{error}"))
}

#[tauri::command]
pub async fn cutout_cpu(
    app: AppHandle,
    window: WebviewWindow,
    request: Request<'_>,
) -> Result<Response, String> {
    ensure_creator(&window)?;
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        let data = raw_body(request.body())?;
        if data.len() != 3 * 1024 * 1024 * 4 {
            return Err("抠图输入尺寸不正确。".into());
        }
        let input = data.to_vec();
        background(move || isnet_alpha(app, input).map(Response::new)).await
    }
    #[cfg(not(all(target_os = "windows", target_arch = "x86_64")))]
    {
        let _ = (app, request);
        Err("当前系统无法使用 CPU 抠图。".into())
    }
}
