# Tauri 全屏透明贴纸层：命中测试与桌面层

适用：修改 `src-tauri/src/overlay.rs`、`src-tauri/src/platform/hit_test.rs`、`click_through.rs`，或排查“贴纸挡住桌面/移动时边缘撕裂”。

更新：2026-11-20｜状态：已切换为参照实现（Windows 11，2560×1440 @125%，WebView2）

## 结论：不要再用窗口 Region

之前的方案用 `SetWindowRgn` 把窗口裁成宠物矩形。贴纸移动时，原生 Region 永远比 DOM 慢一帧以上，于是出现“图已经过去了，边界还没过去”的割裂感；快速拖动/物理模式尤其明显。

参考项目：

`G:\project\project\python\Islenote\islenote-desktop`

它的 `desktop-canvas-window` + `platform/hit_test.rs` 用的是：

1. **一个全屏透明窗口，始终完整绘制**，不做任何 Region 裁剪；
2. 窗口常驻 `WS_EX_LAYERED | WS_EX_TOOLWINDOW`；
3. 后台线程每 **12ms** 读取一次鼠标位置；
4. 鼠标在任意贴纸/按钮矩形内 → 去掉 `WS_EX_TRANSPARENT`（窗口可点）；
5. 鼠标在空白/锁定贴纸上 → 加回 `WS_EX_TRANSPARENT`（窗口穿透）；
6. 拖动期间 `pinned=true`，离开贴纸也不恢复穿透，保证 pointer capture。

这样窗口永远不裁切，图片和边界一起移动，不会撕裂；锁定贴纸也仍然可见，只是不在命中矩形里。

## 关键实现

- `click_through.rs`：`WS_EX_LAYERED` 只加一次，`SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA)`；之后只切换 `WS_EX_TRANSPARENT`。`needs_repair` 每次检查 live style，因为 tao 在 show / z-order 变化时会重写扩展样式。
- `hit_test.rs`：保存 `origin`、`scale`、`visible`、`passthrough`、`pinned`、`rects`。矩形是 CSS 像素，命中时先 `(cursor - origin) / scale`。`pad` 用于右键菜单、气泡、解锁按钮的额外热区。
- `usePetHitRects`：测量 `[data-pet-hit]`、`[data-pet-visual]`、Radix 菜单；跳过 `[data-pet-passthrough="true"]` 里面的元素。**锁定贴纸的视觉仍在 DOM 里，只是不参与命中。**
- 解锁按钮是独立的 `data-pet-hit`，鼠标移上去时窗口会变可点，所以能点击。
- 拖动时前端调用 `set_overlay_dragging` → `hit_test::set_pinned(true)`；松手后延迟恢复。
- 取消置顶：`set_always_on_top(false)` + `set_always_on_bottom(true)`（Tauri 原生方法）。Windows 桌面层用 `.focusable(false)` 接收鼠标事件，并保持 Explorer 的前台位置。原生轮询用 `GetAsyncKeyState` 检测菜单外的鼠标按下，补发 `overlay:blur` 收起菜单。
- 置顶：`set_always_on_bottom(false)` + `set_always_on_top(true)` + `SetWindowPos(HWND_TOPMOST, NOACTIVATE)`。

## 已验证

- 关闭置顶后窗口 ex style 为 `0x801B0`：有 `LAYERED|TOOLWINDOW|TRANSPARENT`，无 `TOPMOST`。
- 开启置顶后为 `0x801B8`：多 `TOPMOST`。
- 鼠标移到未锁定贴纸上，`WS_EX_TRANSPARENT` 被移除（`0x80198`），说明 12ms 轮询生效。
- DPI-aware 桌面截图能看到 layered 透明窗口里的贴纸，旧文档“本机 layered 会丢 WebView2 表面”的结论已不适用于当前实现。
- `WindowFromPoint` 不能用来判断 `WS_EX_TRANSPARENT` 是否穿透；它仍会返回窗口。要看实际点击或看 ex style。

## 不要做

- 不要再加 `SetWindowRgn`，也不要把 Region 当作命中测试。
- 不要在每次鼠标移动时调用 `set_ignore_cursor_events`；只在 12ms 轮询的状态**变化**时调用。
- 不要移除 `WS_EX_TOOLWINDOW`；Chromium 需要它避免被 Windows 判定为遮住下方窗口。
- 不要用 `WindowFromPoint` 判断分层是否正确，参考上面的 ex style/截图方法。

## 换图只显示上半（历史修复）

宠物外层固定 `width/height` + `h-full w-full` 图片容器，换图时不再让 intrinsic size 决定窗口区域；`换一只` 前 `new Image().decode()`。这条仍然有效。

## 动态贴纸与物理性能（2026-11-20）

- 匹配贴纸 ID 的 `src/assets/sticker-motion/<id>.riv` 自动归入「含动态」，WebP 继续用作缩略图和加载回退。当前动画约定 artboard / state machine 都叫 `Sticker`，View Model 触发器叫 `greet`。
- Rive WASM 由 Vite 本地打包。运行时仅在进入动态预览或桌面显示时加载，同源文件在一个 WebView 内共享解码，桌面画布共用 WebGL 上下文。桌面同时显示 3 张以上 Rive 时，内部动画绘制上限为 30 FPS。
- Matter 用固定步长推进，CSS translate / rotate 由物理循环写入。坐标仅在休眠、离开页面或拆除物理世界时提交 Zustand，避免把存储和跨窗口同步放进运动帧。锁定贴纸保留静态碰撞。重力、惯性、重量、弹性和碰撞设置保存于原 Zustand 持久化键。
- 命中目标在 DOM 结构或锁定状态变化时重建，运动期间约 30 Hz 采样并上报整像素几何。全局锁定和隐藏时发送空命中集。不要让命中轮询重新依赖每次 React 提交。
- 在开启调试端口的 native dev 进程中，可用 Playwright CDP 接入 9222，通过临时拦截 store 模块给桌面 WebView 注入隔离测试配置。对活动用户窗口做验证时保留原存储和广播频道。Windows WebView2 用 Long Animation Frames 记录到运动时每约 900ms 的坐标提交和 139–245ms 的长帧重合。移除定时提交后，六张 Rive 同播加太空抛掷的 7 秒复测未出现长帧，移动约 60 次/秒。浏览器 rAF 次数不能作为贴纸移动 FPS。

- 画面尺寸与碰撞体共用 `getPetSize`。从贴纸 Alpha 采样生成复合碰撞体，各块按 `object-fit: contain` 定位。贴纸落地、悬浮拖动和缩放共用可见轮廓的屏幕边界，Rive 使用海报图轮廓。
- Windows 复测桌面层时，先单击桌面空白让 Explorer 处于前台。使用带 `CAPTUREBLT` 的屏幕截图比较按下前、按住和松开后的贴纸像素。GetPixel 直接采屏和 CDP 页面截图无法单独验证分层窗口的桌面合成。悬浮、重力、太空均已实测两层右键缩放。
