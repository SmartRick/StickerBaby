# Windows 安装包：WiX 中文产品名

适用：在 Windows 上运行 `pnpm tauri build`，应用编译成功但 MSI 打包报错。

更新：2026-11-21｜状态：已验证

## 问题

WiX 的 `light.exe` 报 `LGHT0311`，提示数据库代码页 `1252` 无法表示「贴纸宝宝」。默认的 en-US MSI 使用西欧代码页，产品名也会写入 MSI 数据库和快捷方式。

## 处理方式

在 `src-tauri/tauri.windows.conf.json` 设置 `bundle.windows.wix.language` 为 `zh-CN`，再运行 `pnpm tauri build`。x64 构建会在 `src-tauri/target/release/bundle` 生成简体中文 MSI 和 NSIS EXE。

## 验证方式

- Windows Installer API 能读取 MSI 的中文 `ProductName`，`ProductLanguage` 为 `2052`。File 表包含 `deskpet.exe` 和 `onnxruntime.dll`。
- 可用 Tauri 缓存中的 `WixTools314/dark.exe -x` 提取 MSI 内容，核对运行库哈希，并用独立 WebView2 数据目录启动提取出的应用。2026-11-21 已实测发布版主窗口和互动页。
