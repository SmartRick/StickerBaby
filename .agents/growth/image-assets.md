# 贴纸素材：裁剪、透明边与 WebP

适用：替换 `src/assets/stickers/*.webp`，或重新裁切四张宠物贴纸合集。

更新：2026-11-20｜状态：参考全局已验证流程

## 先读全局知识

`C:\Users\28697\.agents\growth\sprite-sheet-icon-slicing.md`
`C:\Users\28697\.agents\growth\scripts\slice_sprite_icons.py`
`C:\Users\28697\.agents\growth\scripts\convert_to_webp.py`

要点（全局文档里的原话/原则）：

- **不要按宽/列数、高/行数直接等分切**。AI 合集通常不对齐，等分会切到相邻光晕甚至切掉本体。
- 布局检测用 `alpha > 128` 找真实沟壑；最终裁剪 bbox 用 `alpha > 8`，四周留 8px 透明边；保持原始宽高比，不强行补正方形、不缩放。
- 投影失败时改用连通域分组，把星星/彩纸挂到最近主体；仍失败再退回等分并接受轻微切边。
- 拼深色底（RGB 24,26,32）contact sheet 验收：缺角、光晕被切、混入邻图、命名顺序。
- 把 `alpha < 8` 的像素 RGB 清 0，能去灰边/白边并显著减小 PNG。
- 成品 RGBA PNG → WebP q90；原图另存，不要只留 WebP 后想再切。

## 本项目的特殊情况

四张原始合集是**不透明灰底 WebP**（不是带 alpha 的透明 PNG），所以 `slice_sprite_icons.py` 的 alpha 投影不能直接套用：要先做背景抠除（flood fill / 色差 matte），再按上面的内容 bbox + 8px 边 + contact sheet 流程处理。不要直接用等分网格。

当前成品在 `src/assets/stickers/`（24 张，文件名与 `src/lib/stickers.ts` 的 id 对应），裁切工作副本在 `design/stickers/`。如果重切，保持文件名和 1:1 方形画布（或用 `object-contain` 适配非正方形），UI 会自动使用新图。

## 2026-11-20 招手图

`pet-wave-six-animals.png` 是真正的 RGBA，直接用了全局 `slice_sprite_icons.py`：

```bash
python C:\Users\28697\.agents\growth\scripts\slice_sprite_icons.py \
  "<...>\pet-wave-six-animals.png" design\waving \
  --mode components --cols 3 --rows 2 \
  --names tabby,shiba,panda,rabbit,penguin,otter \
  --preview design\waving-contact.png
```

裁切结果 8px 透明边；`design/waving/tabby.png` 转成 `src/assets/sidebar/greeting-cat.webp`。用户对比后选择这版（“白边会少一些”），不要再用“招手单图”目录里的版本。


## 本次踩坑记录

第一次用“等分 + 灰底 flood fill”直接切，边缘残留大量灰块，被用户否掉。教训：开工前应先读全局 `sprite-sheet-icon-slicing.md`，按内容检测/bbox/8px 边/深色 contact sheet 验收，而不是先写脚本再肉眼补。

## 2026-11-21 创建贴纸抠图实测

i5-12400F、RTX 4090。三张已知 alpha 的贴纸合成到背景上，另加两张实拍图。CPU 用 ONNX Runtime 1.18.1，2 个推理线程。GPU 用 ONNX Runtime Web 1.31.1 的 Web Worker，在独立 WebView2 146.0.3856.109 窗口测量。

- ISNet 1024 CPU 的预热中位数 3.00 秒，Python 测试进程峰值工作集 1508 MiB，贴纸轮廓 F1 均值 89.7%。
- BiRefNet Lite 1024 CPU 的预热中位数 28.21 秒，峰值工作集 10920 MiB，贴纸轮廓 F1 均值 99.8%。
- Studio Ludens 的 BiRefNet Lite 512 FP16（模型修订 18d56c5，93.9 MiB）在 WebView2 WebGPU 上预热中位数 2.92 秒，冷启动加载 14.84 秒，首次推理 8.53 秒。贴纸轮廓 F1 均值 99.8%。独特效果是保住独角鲸水花的完整轮廓。正式包和低配硬件待验收。
- 本机 MSVC 14.43 链接 ort 2.0.0-rc.12 默认静态库时遇到 LNK2019 和 __std_find_first_of_trivial_pos_1/_2。关闭默认特性，启用 std、load-dynamic、api-24，用 ort::init_from 加载微软 NuGet CPU 1.24.4 的 win-x64 onnxruntime.dll，Rust 的 ISNet 和 BiRefNet Lite 样图均跑通，对比样图输出 alpha 与 Python 逐像素一致。
- 已透明的 PNG 可以直接保存或先按 alpha 外扩描边。12 px 白边试样保留了不透明主体像素。
- Windows Python 临时 HTTP 服务在本机把 .mjs 识别为 text/plain。跑 ORT Web 时给 .mjs 显式返回 text/javascript，给 .wasm 返回 application/wasm。


## 创建页运行与自制贴纸

- 创建页和 ORT Web 按需加载。图片解码、GPU 推理和描边在 Worker 里跑，保存过的图片不会让桌面窗口加载抠图模型。
- Windows x64 的 CPU 兼容模式使用 `tauri.windows.conf.json` 打包好的官方 DLL。模型通过原生命令下载到 `$APPLOCALDATA/models/`，按字节数和 SHA-256 校验后提交缓存。
- 自制贴纸以原图或处理后的 PNG 与元数据一起落盘。主窗口和桌面层读相同目录，创建时从现有 BroadcastChannel 同步；浏览器预览用 IndexedDB 保存媒体 Blob。
- Windows Tauri 已验证 WebGPU、强制 CPU 兼容模式、保存后在库内显示和放到桌面。前端预览完成了原图字节一致性、描边尺寸、AI 提交、创建筛选、跨窗口与刷新验证。
