# 品牌与字体：贴纸宝宝

更新：2026-11-20｜状态：已验证

## 软件名 / 图标

- 正式名：**贴纸宝宝**（Sticker Baby）。
- 图标原图：`design/sticker-baby-logo.png`（2048×2048，橘白猫方形图标）。
- 系统图标：`pnpm tauri icon design/sticker-baby-logo.png`，生成 `src-tauri/icons/*`；tray 使用 `default_window_icon()`，重启后生效。
- 侧栏 logo：`src/assets/brand/sticker-baby.webp`（256×256 WebP）。
- favicon：`public/favicon.png`（128×128）。
- 用户可见名称要同步：`tauri.conf.json` productName、窗口 title、tray、侧栏、顶栏状态、设置页底部、README、package/Cargo description。

## 字体选择

| 用途 | 字体 | 文件 | 说明 |
|---|---|---|---|
| 全部 UI / 标题 | 资源圆体 CN | `src/assets/fonts/body-regular.woff2` / `body-bold.woff2` | 圆润、可读性好；标题和正文统一用它 |

站酷庆科黄油体已移除：它的字形覆盖不足，新增文案会出现缺字。现在标题和正文都使用资源圆体，拉丁字符也由它提供，后面接系统字体兜底。

字体来源：`H:\百度网盘下载\免费可商用字体大全\资源圆体`。发布前再次核对许可证。

## 字体子集

当前子集包含 **GB2312 常用字 + 源码里出现的全部字符 + 常用标点/ASCII**，共 7542 个字符：

- Regular：约 1.14 MB
- Bold：约 1.17 MB

生成脚本：`scripts/build-body-fonts.py`，字符表写到 `scripts/font-chars.txt`。

```powershell
python scripts/build-body-fonts.py
```

新增大量文案后重新跑一次即可，避免再次出现缺字。不要退回只包含 400 个字符的旧子集。

## 验证

- 重启/刷新后执行：`document.fonts.check('16px DeskPetBody')` 应为 true。
- 标题和正文的 computed `font-family` 都以 `DeskPetBody` 开头。
- 设置页的「翻滚」「物理帧率」「太空」等新文案不能出现方块/缺字。
- 字体文件 404 或解析 error 时，浏览器会静默 fallback；要同时看 `document.fonts.check` 和截图。
