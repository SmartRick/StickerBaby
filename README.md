# 贴纸宝宝 · Sticker Baby

一个用 **Tauri 2 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui** 做的桌面宠物客户端。
24 只手绘风贴纸宠物，可以放到桌面上陪你工作、学习、发呆。

## 功能

### 桌面悬浮层
- **单窗口、单 WebView2**：全屏透明层里渲染所有宠物，不为每只宠物创建独立窗口。
- **原生 Region 穿透**：Windows 的窗口 Region 只保留宠物和右键菜单的矩形；屏幕其余区域根本不属于这个窗口，**不会挡住任何操作**。
- **始终置顶**：宠物层会显示在普通应用窗口上方；启动时会主动抬到置顶层的最前面。
- **锁定贴纸**：右键可锁定单张贴纸。锁定后贴纸仍显示，鼠标点击会穿透，拖动和缩放暂停。
- **右键拖拽缩放**：右键按住宠物左右或上下拖拽即可调整大小；有最小 20% / 最大 250% 的阈值，并可按菜单恢复默认大小。
- **全局锁定**：临时锁定所有桌面贴纸。`Ctrl+Alt+P` 可切换全局锁定。
- **自动降低透明度**：鼠标离开后渐隐到设定透明度，移入恢复；延迟与最低透明度可调。
- **精准命中**：只有宠物/菜单矩形会被窗口接收，其余位置点击直达桌面。
- **无浏览器右键菜单**：WebView2 自带的刷新/另存为/检查等菜单已在原生层关闭。

### 主界面
- **首页**：天空草地 Hero（3 张 banner 背景）、AI 房间背景展示台（3 张房间图可切换）、贴纸仓库、分类筛选、分享、添加到桌面。
- **我的贴纸**：24 只贴纸全量浏览，搜索 / 分类筛选。
- **动态贴纸**：12 只带呼吸、摇摆、浮动动画的宠物，可一键放 3 只到桌面。
- **设置**：全局锁定、显隐、自动渐隐、大小、减少动效、快捷键、清空桌面、退出，并带实时预览。

### 系统集成
- 系统托盘：打开主界面 / 显示隐藏宠物 / 切换全局锁定 / 退出。
- 全局快捷键：`Ctrl+Alt+P` 切换全局锁定。
- 关闭主窗口不会退出应用，而是收进托盘；宠物继续留在桌面上。
- 设置、宠物位置/大小、收藏通过 `localStorage` + `BroadcastChannel` 在两个窗口间实时同步。

## 开发

```bash
pnpm install
pnpm tauri dev     # 启动桌面应用（同时起 Vite）
pnpm dev           # 只启动网页预览
pnpm build         # 前端类型检查 + 构建
pnpm tauri build   # 打安装包
```

需要 Node 20+、Rust stable、Windows 上安装 WebView2（Win10/11 通常自带）。

## 目录

```
src/
  app/main-window.tsx       主窗口外壳与页面路由
  app/pet-window.tsx        全屏透明宠物层
  components/pet-sprite.tsx 单只宠物：拖动、右键缩放、互动气泡、右键菜单
  hooks/use-pet-hit-rects.ts 把可点击区域与阴影留白上报给原生 Region
  hooks/use-overlay-effects.ts 设置 → 原生窗口；托盘/快捷键事件 → 设置
  lib/store.ts              共享状态（设置、桌面宠物）
  lib/stickers.ts           贴纸目录与素材映射
  assets/stickers/*.webp    24 张透明贴纸
  assets/rooms/*.webp       3 张首页展示台背景
  assets/banners/*.webp     3 张首页 banner 背景
  assets/greeting/*.webp    6 张左侧打招呼图
  assets/brand/             软件图标 / 品牌素材
  assets/fonts/*.woff2      子集化中文字体
src-tauri/
  src/overlay.rs            透明覆盖层、置顶/置底、显隐
  src/platform/hit_test.rs  Windows 窗口 Region（宠物矩形 + 阴影留白）
  src/platform/click_through.rs 无焦点提升、WebView2 默认菜单关闭、重绘
  src/lib.rs                命令、托盘、全局快捷键、窗口生命周期
design/
  stickers/                 贴纸裁切工作副本
  waving/                   招手动物裁切工作副本
  sticker-baby-logo.png     软件图标原图
```

## 素材说明

贴纸成品位于 `src/assets/stickers/`，文件名与 `src/lib/stickers.ts` 中的 `id` 一一对应。
替换素材时保持文件名和 1:1 方形画布即可，UI 与桌面层会自动使用新图。
首页展示台的 3 张房间背景位于 `src/assets/rooms/`。
`design/stickers/` 保留了裁切工作副本，方便后续继续替换。

## 品牌与字体

- 软件名：**贴纸宝宝 / Sticker Baby**
- 图标：`design/sticker-baby-logo.png`，Tauri 系统图标由 `pnpm tauri icon` 生成
- 标题 / 展示字体：**站酷庆科黄油体**（子集化 WOFF2）
- 正文 / UI 字体：**资源圆体** Regular + Bold（子集化 WOFF2）
- 字体来自本机 `H:\百度网盘下载\免费可商用字体大全`，发布前请再次核对对应字体许可证。

字体都按项目实际用到的 400+ 个汉字做了子集化，三个文件合计约 220 KB，不是整包中文字体。

## 已知边界

- 宠物层当前创建在主显示器上（单显示器覆盖）。多显示器支持需要按显示器创建多个覆盖层。
- Region 是矩形拼合，所以宠物方形 bounding box 内、贴纸轮廓外的透明像素仍会接收鼠标；宠物矩形之外则完全穿透。
- 穿透模式下宠物会暂时隐身（区域缩成 1×1），这是保证“点击任何位置都直达桌面”的最稳妥做法。
- “AI 生成”是本地随机挑选 + 文案包装，不会上传任何数据。
