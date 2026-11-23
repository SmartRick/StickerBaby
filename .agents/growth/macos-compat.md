# macOS 兼容（2026-11-23 首次在 macOS 上跑通）

适用：修改 `src-tauri/src/platform/macos.rs`、`overlay.rs` 的 `win` 模块，或排查 macOS 上悬浮层 / 权限问题。

## 坐标

- CoreGraphics / AX 的坐标单位是“点”，原点在主屏左上角。tao 的显示器 `position()/size()` 是“点 × 该屏 scale”。
- 光标乘上悬浮层所在屏的 scale 后，才能和 `OverlayInfo.rect` 比较。截屏、移动窗口时反过来除以 scale，换算回点。
- `place()` 必须先 `set_size` 再 `set_position`。tao 的 `set_position` 用的是 `setFrameTopLeftPoint`，而 `set_size` 保持左下角不动，顺序反过来会把窗口顶出屏幕（桌面层曾因此出现在 `Y=-780`）。macOS 上用目标屏的 scale 换成 Logical 再设置。

## 窗口

- 置顶层层级是 25（NSStatusWindowLevel），能盖住菜单栏。桌面层沿用 tao `always_on_bottom` 的 -1 层，在桌面图标之上、普通窗口之下。
- 两层都设置 `CanJoinAllSpaces | Stationary | IgnoresCycle | FullScreenAuxiliary`。
- 不能把 tao 的窗口强转成 NSPanel：TaoWindow 带 ivars，`object_setClass` 后读取会出错。所以点击贴纸仍会激活应用，由 `FocusGuard` 在松开鼠标 150ms 后把前台还给之前的应用。如果主界面拿到了焦点，就不归还。
- 桌面层是否被遮挡：用 `CGWindowListCopyWindowInfo` 从前往后找，先遇到桌面层就算可见，置顶层和 alpha 为 0 的窗口跳过。结果节流到 33–100ms。
- 查看窗口实际位置和层级：用 swift 脚本调 `CGWindowListCopyWindowInfo`，看 `kCGWindowBounds` 和 `kCGWindowLayer`。

## 权限与资源

- 截屏使用 `CGDisplayCreateImage`。macOS 26 上依然可用，返回 BGRA，需要“屏幕录制”权限。首次调用会请求授权，授权后要重启应用。
- 窗口扰动使用 AX API 加私有的 `_AXUIElementGetWindow`，需要“辅助功能”权限。开发模式下，权限记在启动它的终端 app 名下。
- CPU 抠图使用 `resources/onnxruntime-macos/libonnxruntime.dylib`（1.24.3，仅 arm64），取自 npm 包 `onnxruntime-node` 的 `bin/napi-v6/darwin/arm64`。
- 数据目录不做便携，统一放在 `~/Library/Application Support/com.deskpet.app`。
- 快捷键使用 ⌘⌥P / Q / F12，前端文案统一从 `src/lib/shortcuts.ts` 取。
