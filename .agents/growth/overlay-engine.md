# 悬浮层引擎（2026-11-22 从技术验证项目 web/贴图宝宝 移植）

- 旧的 React pet-window / 窗口 Region / 12ms rect 命中已删除；现在两层（pet 置顶、pet-desktop 桌面层）都跑 `src/overlay/main.ts`。
- JS 全局 `listen()` 会收到发给任何窗口的事件。光标流 `sb://cursor` 必须用 `getCurrentWebviewWindow().listen`，否则置顶层会吃到桌面层的 inside=false。
- tao 里 builder 同时调 `always_on_top(true)` 和 `always_on_bottom(false)` 会取消置顶，只设需要的那一个。
- 运动模式 desk/space/gravity；desk 且不碰撞时用贴纸自带的摩擦滑行，其余交给 Matter（stickers/physics.ts）。
- 调试：CDP 9222 + `scripts/cdp.mjs "layer=floating" ...`，`scripts/desk.py` 截屏 / 模拟鼠标（物理像素）。
