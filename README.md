# 贴纸宝宝 · Sticker Baby

一个用 **Tauri 2 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui** 做的桌面宠物客户端。
24 只手绘风贴纸宠物，可以放到桌面上陪你工作、学习、发呆。

## 功能

### 信息架构

```
首页
贴纸   贴纸库 · 创建贴纸（图片抠图 / 视频贴纸 / AI）· 我的桌面（每张贴纸的摆放、中键互动、点击粒子；运动与行为）
玩法   全屏特效 · 恶作剧 · 屏幕扰动
设置
```

- 贴纸内容：主题包 → 角色 → 状态（`lib/packs.ts`、`lib/stickers.ts`、`lib/characters.ts`），格式有静态 / Rive 动态 / 视频。
- 玩法目录：`domain/playables.ts`，领域（页面）→ 分类 → 玩法，与引擎实现解耦；新增玩法 = 引擎注册工厂 + 目录加一条。

### 桌面悬浮层（`src/overlay/`，原生 TS 引擎）

- 两个全屏透明窗口共用一套引擎：`pet` 置顶层（置顶贴纸 + 特效 / 恶作剧 / 扰动），`pet-desktop` 桌面层（取消置顶的贴纸，在所有窗口之下）。
- 默认点击穿透；Rust 120Hz 轮询全局光标推给两层，前端按贴纸 alpha 像素级命中，只在命中时关闭本窗口穿透。保留 `WS_EX_LAYERED + LWA_ALPHA=254`、`WS_EX_NOACTIVATE`，点贴纸不抢焦点、不会让浏览器视频暂停。桌面层被应用窗口盖住时不响应。
- 贴纸：DOM 渲染，静止零重绘。单击 Q 弹 + 粒子 + 台词，双击转圈，来回蹭抚摸，中键手势，拖拽拎起倾斜拉伸，甩出惯性滑行撞边回弹；右键拖动缩放、单击右键菜单；滚轮缩放、Shift+滚轮旋转。多状态角色按拖拽 / 点击 / 闲置切换姿势；Rive 动态贴纸；视频贴纸 WebGL 绿幕抠像。
- 运动模式：悬浮（拖到哪停在哪）/ 滑冰（直接跟手，甩出摩擦滑行、撞边挤压回弹，默认）/ 太空（无重力漂浮）/ 重力（下落堆叠）。太空和重力用 Matter.js 弹簧拖拽（抓偏心会转、能撞开别的贴纸），带惯性 / 重量 / 弹性等物理参数；滑冰模式始终保持自带的滑行手感——打开“贴纸之间碰撞”只是在滑行 / 拖拽时做 alpha 轮廓凸包的 SAT 互撞（`stickers/collide.ts`，按面积质量交换动量），不增加任何额外物理参数。贴纸互撞不加 Q 弹，只有撞墙有挤压。
- 点击粒子两级设置：贴纸库详情里改这款贴纸的默认，“我的桌面”里可以给单张覆盖；中键手势在“我的桌面”逐张设置。
- 首页“常用推荐”按使用记录排序（最近贴过、贴得多、正在桌面上的在前）。
- 锁定 = 点击穿透；悬停锁定贴纸 1.2 秒出现“解锁”。全局锁定、自动变淡、隐藏贴纸。
- 全屏特效 / 恶作剧 / 屏幕扰动（截屏 + 着色器）/ 真实窗口扰动（结束、清场、退出时精确还原），见各玩法页。

### 快捷键 / 托盘

- `Ctrl+Alt+P` 全局锁定，`Ctrl+Alt+Q` 一键清场，`Ctrl+Alt+F12` 隐藏 / 显示悬浮层；被占用时只打印日志，不影响启动。
- 托盘：打开主界面 / 贴纸库 / 全屏特效 / 设置、显示贴纸、全局锁定、运动模式、一键清场、退出。关闭主窗口只收进托盘。

### 状态同步

- 贴纸实例与设置：zustand + `localStorage` + `BroadcastChannel`，主界面与两个悬浮层共享；悬浮层只在贴纸停稳时回写位置。
- 玩法指令 / 运行状态：Tauri 事件 `sb://cmd` / `sb://state`（`shared/protocol.ts`、`lib/overlay-client.ts`）。

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
overlay.html / src/overlay/   悬浮层引擎（core 运行时、stickers 贴纸、effects 特效、pranks 恶作剧、distort 扰动）
src/shared/protocol.ts       主界面 <-> 悬浮层协议
src/domain/                  玩法目录与播放
src/lib/overlay-client.ts    主界面调用悬浮层的入口
src/components/              页面（playground-page 玩法页、desktop-page 我的桌面……）
public/assets/               特效图集（scripts 生成）
src-tauri/src/
  overlay.rs                 两层悬浮层、光标轮询、穿透切换、显示器
  capture.rs                 GDI 截屏（屏幕扰动）
  window_fx.rs               真实窗口扰动与还原
  desktop.rs                 桌面图标显隐（熊猫烧香）
  sticker_creation.rs        自制贴纸（图片抠图 / 视频）
```

玩法卡片缩略图：先 `pnpm dev`，再 `node scripts/capture-thumbs.mjs [前缀...]`，在无头 Chrome 里实际渲染每个玩法并截一帧到 `src/assets/playables/`。

物理调试：`node scripts/probe-physics.mjs gravity` 让桌面贴纸一起落下，统计静止后刚体之间的重叠深度。

调试：`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 pnpm tauri dev`，然后
`node scripts/cdp.mjs "layer=floating" "__sb.handle({type:'effect.play',kind:'fireworks'})"`；`python scripts/desk.py shot out.png` 截屏 / 模拟鼠标。

## 素材说明

贴纸成品位于 `src/assets/stickers/`，文件名与 `src/lib/stickers.ts` 中的 `id` 一一对应。
替换素材时保持文件名和 1:1 方形画布即可，UI 与桌面层会自动使用新图。
首页展示台的 3 张房间背景位于 `src/assets/rooms/`。
`design/stickers/` 保留了裁切工作副本，方便后续继续替换。

## 数据与存储（绿色便携）

- 自创贴纸、AI 抠图模型、WebView 配置（设置与贴纸摆放的 localStorage）都存在
  **软件目录旁的 `data\`**（`data\stickers`、`data\models`、`data\webview`），
  跟着软件走，不占系统盘；整个目录一起拷走即完成迁移。
- `data\` 写不进去（例如装在 Program Files）时自动退回系统 `AppData\Local\com.deskpet.app`。
- 从旧版升级：首次启动会自动把 AppData 里已有的自创贴纸复制过来、模型搬过来
  （贴纸保留原件，模型搬完删除），AppData 里的旧 WebView 缓存（EBWebView）不再使用，
  确认无虞后可手动删除。
- 三个窗口的 WebView 数据目录必须一致（都指向同一处），否则 localStorage /
  BroadcastChannel 的共享状态同步会断——新增窗口时记得带上 `data_directory`。

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
