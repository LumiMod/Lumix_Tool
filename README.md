# LumixTool

**简体中文** | [English](README.en.md) | [日本語](README.ja.md)

LumixTool 是给初代 Panasonic LUMIX DC-S5 使用的离线工具箱。Windows 和 Android 都可以用它拍摄套用 LUT 的 JPEG 照片、开启 6K 片门全开与不限时录制，以及自定义机身的 28 项提示音。

**下载 v0.4.3**　[Windows x64 免安装包](https://github.com/USER-HFC/Lumix_Tool/releases/download/v0.4.3/LumixTool-0.4.3-win-x64.zip) · [Android APK](https://github.com/USER-HFC/Lumix_Tool/releases/download/v0.4.3/LumixTool-0.4.3.apk) · [版本说明与校验值](https://github.com/USER-HFC/Lumix_Tool/releases/tag/v0.4.3)

> **适用机型**　松下 DC-S5（一代），官方固件 2.9。LUT 直接写入机身仍为 Beta，尚未经真机验证。

- 对机身的修改保存在 **RAM** 中。用电源开关重启后仍然有效，拔电池或恢复出厂设置后会还原。
- 音效写在相机 RAM 的暂存区（`0x8F000000` 起）里，写入前会检查，不会覆盖其它已写入的音效。首次替换时建议先选一段短音频，试用一个音效。
- 支持 **简体中文 / English / 日本語**，首次进入可选择语言，也可在「设置」中随时切换。
- 完全本地离线运行，不联网。

## 功能

| 工具 | 说明 |
|---|---|
| **实时 LUT 直出** | 为 JPEG 照片套用所选 LUT。可导入 CUBE 或 VLT，导出存储卡用的 VLT，也可选择机身临时写入（Beta）。 |
| **音效替换** | 完整映射并列出全部 28 项机身音效（含对焦提示音 `#1–3`、电子快门单张 `#20–22`、电子连拍 `#11–13`、自拍倒计时 `#0` 等），提供常用预设一键选择、单项或批量写入及恢复原厂。支持 wav / mp3 / m4a / flac / ogg / opus，自动转成 44.1 kHz 单声道，最长 3 秒。 |
| **片门全开** | 一键解锁 6K 3:2、5.9K 16:9 与所有限时模式的不限时录制，也可以恢复原厂默认。写入前校验 13 处固件特征锚点，只改写 19 个易失性 RAM 半字。 |
| **内存诊断** | 只读扫描相机 RAM 暂存区，用分布图显示哪里空闲、哪里有数据、每个音效存在哪里，可导出 JSON。 |
| **连接相机** | 一键安装 WinUSB 驱动、检测驱动状态、引导进入服务模式。 |
| **多语言与设置** | 支持中文 / 英文 / 日文三语切换（首次启动引导 + 设置页随时切换），查看版本号与项目支持入口。 |

全部 28 项音效的反汇编核验记录见 [docs/S5_V29_FINDINGS_2026-11-25.md](docs/S5_V29_FINDINGS_2026-11-25.md) 与 [docs/SOUND_TABLE.md](docs/SOUND_TABLE.md)。

## 用实时 LUT 拍摄 JPEG 照片

在 Windows 或 Android 打开「实时 LUT 直出」。**此功能仅适用于 JPEG 照片。** 使用 RAW+FINE 拍摄时，LUT 效果保存在同时生成的 JPEG 中。

1. **功能激活**　用 USB 连接相机，在「功能激活」卡片点击「激活功能」，等待「激活成功」弹窗。取出电池后需要重新激活。
2. **LUT 烧录**　要使用自定义 LUT，在同一个文件选择框导入 `.cube` 或 `.vlt`。应用自动处理格式，再按下表选择保存方式。使用相机自带的 `Vlog_709` 可以跳过这一步。
3. **使用教程**　按 LUT 来源选择「从存储卡导入」或「使用机内 LUT」，跟随黄色高亮选择机身菜单项。在「V-Log查看助手」中选好 LUT，将「LUT查看助手(监视器)」设为 ON。回到拍照界面，按 Q 将「照片格调」设为 V-Log，选择 FINE 或 RAW+FINE 后拍摄。

| 保存方式 | 怎么用 | 换电池之后 |
|---|---|---|
| **导出 VLT 到 SD 卡** | 无需连接相机即可导出。把文件放在 SD 卡根目录。扩展名前最多用 8 个英文字母或数字，例如 `LOOK01.VLT`。 | VLT 保留在卡上，重新激活照片直出后仍可从卡中读取，适合长期使用。 |
| **直接写入机身（Beta，尚未经真机验证）** | 连接相机，选择目标槽位并写入。机内仍显示该槽位原来的名称，可按写入的位置找到它。 | 拔掉电池会清空临时写入的 LUT。 |

从 SD 卡导入时，在「V-Log查看助手」打开「读取LUT文件」，选卡槽和文件，再从四个机内位置中选择保存位置。**选择已有 LUT 的位置并确认，会覆盖原来的 LUT。** 显示「读取LUT数据完成」后，返回「LUT选择」选用刚导入的 LUT。

![v0.4.2 使用教程的菜单示意图，黄色高亮标出 S5 当前要选的菜单项](docs/images/lut-guide-v0.4.2-zh.png)

图为 v0.4.2 在模拟连接下的使用教程。机身菜单路径见[松下《DC-S5 高级功能使用说明书》第 280–281 页](https://eww.pavc.panasonic.co.jp/dscoi/DC-S5/GK/DC-S5_DVQP2219ZD_full_sch.pdf#page=280)。

## Android 版（APK）

安卓版可以用手机通过 USB OTG 离线连接松下 LUMIX DC-S5 一代。需要 Android 8.0 或更高版本、支持 USB Host（OTG）的手机，以及能传输数据的 USB 线。片门全开与音效替换适用于相机官方固件 2.9。

| 页面 | 可以做什么 |
|---|---|
| 实时 LUT 直出 | 连接相机激活照片直出，或在离线状态下导出 VLT、查看机身菜单教程。 |
| 连接相机 | 动画标出机背的回放键和 AF-ON 键，演示按住双键时拨动电源开关的时机。连接后可查看机身固件和当前状态。 |
| 片门全开解锁 | 可开启或还原 6K 3:2、5.9K 16:9 录制规格，以及原有限时模式的不限时录制。两种高分辨率格式均为 23.98p、10 位 HEVC。 |
| 相机音效替换 | 提供「常用音效」（对焦音、电子快门单张/全3档、电子连拍、自拍倒计时）一键选择，也可切至「全部 28 项」自定义替换或恢复。写入可能较久，期间请保持 USB 连接，偶尔轻点相机触摸屏以防休眠。 |
| 设置 | 位于顶栏连接状态右侧：支持切换中/英/日语言、查看版本号、前往 GitHub 点 Star（OTA 更新暂未开发）。 |

以下为旧版 Android 首页和 USB 连接引导。

<p>
  <img src="docs/images/android-home.png" alt="安卓版首页，包含连接相机、片门全开解锁和相机音效替换" width="300">
  <img src="docs/images/android-connection.png" alt="安卓版连接引导，按住回放和 AF-ON 键时将电源拨到 ON" width="300">
</p>

**安装与首次连接**　从 [Releases](https://github.com/USER-HFC/Lumix_Tool/releases) 下载最新的 `LumixTool-*.apk`（调试签名，系统可能提示来源未知，允许安装即可）。启动后选择语言，点「连接相机」，跟随动画开机，通过 OTG 接好相机，并在 Android 弹窗中允许 USB 访问。

## Windows v0.3.2 截图

![Windows v0.3.2 连接相机界面，演示按住回放键和 AF-ON 键时打开电源](docs/images/windows-0.3.2-connection.png)

| | |
|---|---|
| ![音效文件的波形、音量滑块和写入准备面板](docs/images/windows-0.3.2-sounds-write.png) | ![正在写入相机时的单项进度与总体进度](docs/images/windows-0.3.2-sounds-progress.png) |
| **准备写入**　试听音频、调整音量，再确认目标音效和预计耗时。 | **写入中**　查看当前音效和整个批次的写入进度。 |
| ![内存诊断的空间概览及分布图](docs/images/windows-0.3.2-memory.png) | ![音效列表中的编号、名称、时长和恢复操作](docs/images/windows-0.3.2-sounds-list.png) |
| **内存诊断**　扫描后查看可写入容量和空间分布。 | **音效列表**　快速选择常用音效或从 28 项中选择替换与恢复。 |

界面跟随系统切换浅色 / 深色：

![Windows v0.3.2 深色模式下的音效替换界面](docs/images/windows-0.3.2-dark-mode.png)

> 截图来自 Windows v0.3.2 本地打包版。音效与进度数据来自模拟相机，已隐藏模拟调试工具栏。

## Windows 版系统要求与使用步骤

- Windows 10 / 11（64 位）；macOS / Linux 只能用模拟模式开发界面。
- Panasonic LUMIX DC-S5（v2.9 固件），以及一根能传数据的 USB 线。
- 不需要单独安装 Python，安装包里已经自带。

1. 到 [Releases](https://github.com/USER-HFC/Lumix_Tool/releases) 下载 `LumixTool-<版本>-win-x64.zip`，**全部解压到桌面或「文档」**后双击 `LumixTool.exe`（首次运行 SmartScreen 拦截时点「更多信息 → 仍要运行」）。
2. **进入服务模式**：相机关机，同时按住机背的回放键（▶）和 `AF-ON` 键不放，再开机，用 USB 连接电脑（设备管理器出现 `04DA:2370` 即成功）。
3. **安装驱动**（只需一次）：在「连接相机」中点「一键安装驱动」，失败时可参考 [docs/DRIVER_SETUP.md](docs/DRIVER_SETUP.md) 用 Zadig 安装。
4. **解锁片门全开 / 替换音效**：按界面指引操作；写入完成后用**电源键**关机再开机（**不要拔电池**）即可生效。

## 注意事项

- **写入很慢**：每个采样点约 2 ms，1 秒音频大约要 1.5 分钟。服务模式空闲 4–7 分钟会自动关机，写长音频时请关闭机身「自动休眠」或隔一会儿轻点触摸屏保持唤醒。
- **电子快门音提示**：`#20–22`（单张）与 `#11–13`（连拍）需在相机菜单切至**电子快门**并开启电子快门音量才能听到。
- **原厂备份**：首次连接会自动按机身版本备份原厂音效表项，恢复原厂或直接拔电池均可还原。

## 仓库结构

| 目录 | 内容 |
|---|---|
| [`app/`](app/) | LumixTool 桌面应用（Electron + React + Ant Design + Python 后端）与安卓前端。 |
| [`android/`](android/) | Android OTG 原生壳工程（WebView + USB Host 协议实现）。 |
| [`docs/`](docs/) | 固件分析与发现（[S5_V29_FINDINGS_2026-11-25.md](docs/S5_V29_FINDINGS_2026-11-25.md)）、音效表（[SOUND_TABLE.md](docs/SOUND_TABLE.md)）、驱动指南（[DRIVER_SETUP.md](docs/DRIVER_SETUP.md)）。 |
| `tools/`、`js/` | 实验性固件研究脚本（容器解析、OSD、反汇编等），**不是 LumixTool 应用的一部分**。 |

## 开发

```sh
cd app
npm ci
npm start            # 构建桌面界面并启动
npm run dev          # 开发模式（热更新）
npm test             # JS 单元测试（Python 测试：python3 -m unittest discover -s python/tests）
npm run build:android # 构建安卓前端资源
npm run dist:win     # 打包 Windows 免安装 zip
```

模拟模式（无需连相机）：

```sh
LUMIXTOOL_MOCK=1 npm start
```

## 致谢（Acknowledgements）

本项目在研究与开发过程中参考和借鉴了以下优秀开源项目，特此致谢：

- **[rileydeacon/s5-unlocker](https://github.com/rileydeacon/s5-unlocker)** — 提供了初代 DC-S5（MC801 v2.9）6K Open Gate / 5.9K / 不限时录制的 19 半字 RAM 补丁与 13 处固件特征锚点。
- **[yis2014/Lumix_S5](https://github.com/yis2014/Lumix_S5)** — 提供了 DC-S5 V2.9 固件深度逆向、5 轮 AES 全分区解密研究、内存地址表及扩展路线参考。

## 免责声明

本项目与 Panasonic 无关。服务模式和直接改写相机内存都不在官方支持范围内，使用风险自负。
