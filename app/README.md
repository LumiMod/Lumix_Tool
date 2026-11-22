# LumixTool

离线运行的 LUMIX 相机工具箱，使用 React 19 + Ant Design 6。默认浅色，实时跟随系统深色模式。当前工具是 **Panasonic DC-S5 音效替换**：管理全部 28 项音效，选择音频、试听、逐项或批量写入 RAM，再通过相机电源键热重启生效。

仅修改 RAM，不写 flash。电源键重启后保留；拔电池或恢复出厂后失效。音频最多 3 秒，超出时取前 3 秒。完成后**用电源键关机再开机，不要拔电池**。

## 运行、构建与开发

需要 Node.js 22.12+（或 20.19+）、npm 和用于实机通信的 Python 3（无需额外 Python 包）。Electron 使用 45.4.1。依赖已经安装时无需再次安装；新环境先运行 `npm ci`。构建和运行均不使用 CDN 或远程资源。

```sh
cd app
npm run build   # Vite 输出到 renderer-dist/
npm start       # 先构建，再启动 Electron
npm run dev     # Vite http://127.0.0.1:5173 + Electron，支持 React 热更新
npm test
```

`npm run dev` 会设置 `LUMIXTOOL_DEV_URL`，Electron 加载该地址；退出 Electron 或 Ctrl+C 会关闭开发服务器。端口 5173 需空闲。也可手动设置 `LUMIXTOOL_DEV_URL` 使用开发服务。正常启动加载 `renderer-dist/index.html`，可离线运行。

Windows 可双击 `start.bat`，若缺少 `renderer-dist\index.html` 会先运行构建。修改源码后需重新运行 `npm run build` 或 `npm start`。如果环境设置过 `ELECTRON_RUN_AS_NODE`，需清除此变量；`start.bat` 和开发脚本会自动清除。macOS 可使用 `env -u ELECTRON_RUN_AS_NODE npm start`。

在「设置 → Python 运行环境」选择 Python 3 可执行文件（Windows 为 `python.exe`）。应用依次检测已保存路径、`LUMIXTOOL_PYTHON`、打包版内置的 Python、兼容变量 `S5_PYTHON`、原版 Windows 运行时路径、`python3` / `python` / `py`。设置保存在系统应用数据目录的 `LumixTool/config.json`；第一次运行时，若新配置不存在，会复制同目录下 `s5-focus-sound/config.json`，不删除旧文件，不覆盖新配置。

**实机通信目前仅支持 Windows**：现有 Python 后端使用 WinUSB。macOS/Linux 正常启动时显示「未连接」及平台提示；可使用模拟模式开发完整界面。

## 连接与使用

1. Windows 下在「连接指南 → 安装驱动」查看状态并点击「一键安装驱动」，授权 UAC，为 `04DA:2370`（含接口 0）安装 **WinUSB**。只用 Windows 内置工具，安装过程离线，不捆绑第三方程序。需先进入服务模式并连接 USB；高级区域提供卸载、可选证书清理和 Zadig 官网链接。
2. DC-S5 关机后，按住 **PLAY + AF-ON**，同时开机进入服务模式，再连接 USB。
3. 在应用中刷新连接，查看型号与机身版本。普通 PTP 模式 `04DA:2382` 无法使用该工具。
4. 在音效表中点击某项「替换」，或勾选多个编号以写入同一段声音。#1 对焦提示音已确认；#20 参考资料称快门音但实测不符，其余映射待确认。可点名称旁的编辑按钮记录本机名称。选择或拖入音频（不超过 100 MB）。支持格式取决于 Electron / 系统解码器，解码失败会显示原因。
5. 查看原文件真实时长、声道数与波形。试听的是转换为 **44.1 kHz / 单声道 / s16le** 后的实际写入片段；超过 3 秒会提示截取。Web Audio 解码后的采样率不是原文件采样率，因此不将它标作原文件采样率。
6. 点击「写入所选音效」，等待逐项传输与校验成功。实机耗时约为采样数 × 0.002 秒 × 所选项数，3 秒音频每项约需 265 秒。预计超过 2 分钟会提示服务模式约 4–7 分钟空闲后可能自动关机，请轻点相机触摸屏保活。批量同时显示总进度与当前项进度，首项失败即停止，并报告成功、失败和未执行编号。
7. **用电源键关机再开机，不要拔电池**，触发相应动作试听（#1 为半按快门合焦）。恢复时点击该行「恢复」或「全部恢复」并确认，然后热重启。全部恢复仅包含有原始备份的条目。操作结果会自动滚入视野，并显示常驻通知和热重启提醒。

写入 / 恢复期间，刷新、音频更换、Python 设置和其他相机操作禁用；可以切换页面，已选音频、进度与结果保留，试听在离开工具页时停止。真实恢复命令不输出项内分段进度，因此当前项显示等待状态直到校验完成，总进度按已完成条目更新；写入显示后端真实采样进度，100% 传输不代表校验成功。失败时显示后端原始错误或校验信息。

驱动安装会创建或复用 `CN=LumixTool Driver Signing` 本机自签名证书，并加入 `LocalMachine\Root` 与 `LocalMachine\TrustedPublisher`，私钥保存在 `LocalMachine\My`（不可导出）。该信任影响整台电脑，INF 只匹配 `2370`，不会匹配普通模式 `2382`。卸载应用不清理驱动和证书；在连接指南「高级」中卸载，可选择同时移除证书。安装 / 卸载 / 检测与相机操作共用主进程锁，驱动操作本身无需 Python。

`pnputil` 接受包后，应用会重新检测 WinUSB 服务、设备问题代码和 `DeviceInterfaceGUIDs`；仅三项验证通过才显示「驱动正常」并推进引导。已添加包但未绑定时会保留提示。自签名目录在目标 Windows 的签名策略、Secure Boot、驱动排名和目录格式要求下仍需实测，失败可查看原始输出及 `C:\Windows\INF\setupapi.dev.log`，再使用手动方案。不会更改签名或启动策略。完整说明见 [驱动安装指南](../docs/DRIVER_SETUP.md#3-一键安装lumixtool-内置)。

### Windows 发行包（单文件便携 exe）

```sh
cd app
npm run dist:win   # 输出 release/LumixTool-<版本>-portable-x64.exe
```

- `scripts/fetch-python.mjs` 下载 python.org 官方 Windows 嵌入版 Python（版本与 SHA-256 写死在脚本里，缓存于 `vendor/cache/`），解压到 `vendor/python-win-amd64/`，打包为 `resources/python/`。打包版优先使用它，用户无需安装 Python；设置里手动选的路径仍然优先。
- electron-builder 配置在 `package.json` 的 `build` 字段：`python/` 解包到 `app.asar.unpacked`（外部 Python 进程读不了 asar），`driver/` 留在 asar 内（`driver.js` 会先复制到临时目录再提权运行）。
- 用 `toolsets.nsis: "1.2.1"`，它带 Apple 芯片原生的 makensis，可以在 M 系列 Mac 上交叉打包。
- React / antd 由 Vite 打进 `renderer-dist/`，所以都放在 devDependencies，不进安装包。
- exe 未做代码签名，首次运行 Windows SmartScreen 会提示，需点「更多信息 → 仍要运行」。

管理员脚本不接收 renderer 提供的脚本路径或任意命令，只接收应用生成的结果路径及可选证书清理标记。外链 IPC 仅允许精确的 `https://zadig.akeo.ie/`，renderer 使用文字按钮调用，不直接导航。

## 原始备份与 RAM 区域

成功连接后，应用自动 `dump` 全部声表。每个机身版本的原始 32 字节 hex 和本地名称保存在 userData 的 `sounds.json`；模拟模式使用独立的 `sounds-mock.json`，避免污染实机备份。原始表项只在采样虚拟地址小于 `0x0F000100` 且尚未保存该项时记录，已有备份不会被新值覆盖。若首次连接时某项已经替换而没有备份，会标记「无法单独恢复（拔电池可恢复）」并禁用该项恢复。原始时长来自保存的表项，没有备份时显示「—」。备份文件无法读取或保存时停止写入，请先检查文件。

每个索引 `i` 使用物理区域 `0x8F000100 + (i + 1) × 0x42000`，跳过旧版共用区域；16 字节 `LMXTSLOT` / u32 索引 / u32 采样数头之后存 PCM。写入前读取整个区域，只接受该索引的已有头或全区 `0x55`，否则返回 `region not free` 和地址，零写入。区域空闲总大小未知，安全检查失败时不会越过它继续写入。详见 [声表文档](../docs/SOUND_TABLE.md#41-lumixtool-每项独立-ram-区域新版)。

后端兼容 `status`、`dump`、`apply`、`apply-id`、`restore`、`restore-id`，并新增 `apply-slot <index> <pcm> <samples>`；所有 apply 命令均采用独立区域方案，输出 `PROGRESS <done> <total>`，最后输出一行 JSON。UI 的批量操作在主进程持有整个批次的互斥锁，依次调用 `apply-slot` / `restore-id`。

## 模拟模式

无需 Python 或相机，不启动 Python、不访问 USB、不写入音频临时文件。

```sh
# macOS / Linux（开发时也可将 start 换成 run dev）
LUMIXTOOL_MOCK=1 npm start
```

```powershell
# Windows PowerShell
$env:LUMIXTOOL_MOCK = '1'
npm start
```

```bat
rem Windows CMD
set LUMIXTOOL_MOCK=1
start.bat
```

默认返回 `DC-S5`、机身版本 `0x0208`。顶部工具栏可切换「已连接 / 未连接 / 连接异常 / Python 缺失 / 区域被占用（#20）」，并勾选「下次操作失败」。28 项模拟表的采样长度来自 `docs/SOUND_TABLE.md` §2；各项状态在当前进程内保留，重启模拟进程后回到原厂表。写入和恢复每项约 3 秒，通过 IPC 发送进度；失败选项在 60% 时返回模拟 USB 超时，仅生效一次。「区域被占用（#20）」在写 #20 时立即返回 `region not free` 及地址；选择 #1、#20、#21 可检查批量在 #20 停止且报告 #1 成功。恢复不受区域占用影响。

驱动模拟独立于平台，可在 macOS/Linux 走查 Windows 界面。`#mockDriver` 提供正常、无设备、普通模式 2382、未安装、libusbK、GUID 缺失、GUID 未知；`#mockDriverResult` 选择安装 / 卸载成功、失败或取消 UAC。成功安装会将已连接服务设备改为正常，卸载后改为未安装；无设备或普通模式下只模拟添加包，不伪造绑定。设备状态选「未连接」时优先显示无设备，需切回「已连接」检查驱动场景。驱动结果选项持续生效，可反复测试，不使用「下次相机操作失败」。模拟操作绝不调用 Windows 命令或修改证书。

驱动自动化入口：`#driverStatus`（在引导各步骤中均可见）、`#installDriver`、`#recheckDriver`、`#uninstallDriver`（展开「高级」后）；驱动正常会完成步骤 1 并前进，需点击步骤 1 才能查看卸载入口。建议走查：未安装 → 连接提示「安装驱动」→ 安装失败 / UAC 取消 → 重试成功并前进 → 回到步骤 1 卸载 → 2382 → 未检测到设备 → GUID 未知。

建议走查：未连接 → 连接指南 → 已连接 → 拖入超过 3 秒的音频 → 波形与试听 → 写入进度与成功 → 恢复确认 / 取消 → 勾选失败后写入 → 连接异常 → Python 缺失 → 设置。也应切换系统浅色 / 深色，确认实时更新。

自动化稳定入口：`#mockScenario`（Ant Design Select）、`#mockFail`、`#refreshDevice`、`#applyAudio`、`#restoreAll`、`#audioDrop`、`[data-tool="focus-sound"]`（保留原导航 key）、`#navConnection`、`#navSettings`。音效表每行有 `data-slot="<index>"`，行内有选择 checkbox、`[data-action="replace"]`、`[data-action="restore"]` 与 `[data-action="rename"]`；表格不分页、不虚拟化，28 行均在 DOM 中。Select 应点击后选择标签，Modal 确认按钮位于 body 的 portal 中，例如 Playwright：

```js
await page.locator('#mockScenario').click();
await page.locator('.ant-select-item-option').filter({ hasText: '区域被占用（#20）' }).click();
await page.locator('[data-slot="20"] [data-action="replace"]').click();
// 批量选择使用行内 checkbox；默认已选 #1，先取消再选择目标项。
await page.locator('[data-slot="1"] input[type="checkbox"]').uncheck();
await page.locator('[data-slot="20"] input[type="checkbox"]').check();
await page.locator('[data-slot="20"] [data-action="restore"]').click();
await page.locator('.ant-modal-confirm').getByRole('button', { name: '确认恢复' }).click();
// 取消：.ant-modal-confirm 中点击「取消」；重命名输入 #soundLabel 后点「保存名称」。
```

不要直接修改 Select 内部 input 的 value。拖放文件走 `Upload.Dragger.beforeUpload` → `window.api.pathForFile(file)`，并返回 `false`，不会上传文件。

## 添加一个工具

在 `src/tools/` 下新建一个工具目录与 React 组件，在 `src/tools/index.jsx` 的 `tools` 数组中增加一项：

```jsx
import { ToolOutlined } from '@ant-design/icons';
import MyTool from './my-tool/MyTool';

// 加入 tools 数组
{
  id: 'my-tool',
  title: '新工具',
  icon: <ToolOutlined />,
  description: '工具介绍',
  scope: 'DC-S5',
  component: MyTool,
}
```

组件接收 `{ device, active }`。`device` 提供 `api`（preload 白名单接口）、`env`、`device`（相机信息）、`ready`、`locked`、`busy`、`progress`、`refreshDevice()` 和 `runOperation()`。操作按钮应检查 `locked` / `ready`；用共享操作入口确保互斥，结束后会刷新设备与模拟状态：

```jsx
const result = await device.runOperation({
  tool: 'my-tool',
  label: '正在处理',
  execute: () => device.api.someExplicitlyExposedMethod(),
});
if (!result.ok) throw new Error(result.error || '后端校验失败');
```

组件保持挂载，切换页面时 `active` 为 `false`，应停止本地试听等临时活动。后端文本交给 React 渲染，不使用 `dangerouslySetInnerHTML`。新增后端能力仍需显式添加 preload / IPC 通道；工具注册不再依赖 `list-tools` IPC。

## 结构与验证

- `src/main.jsx`：React 入口、中文 locale、跟随系统的 Ant Design 主题。
- `src/App.jsx`：Layout / Sider / Menu、设备栏、模拟工具栏与导航。
- `src/hooks/useDevice.js`：共享状态、进度订阅、设备操作互斥。
- `src/components/`：连接指南与设置。
- `src/tools/index.jsx`：工具注册表。
- `src/tools/sounds/`：28 项表格、名称目录 `catalog.js`、状态、逐项 / 批量写入与恢复。
- `src/tools/focus-sound/`：复用的音频转换与波形组件。
- `vite.config.mjs` / `index.html`：本地构建与 CSP；产物 `renderer-dist/` 不提交。
- `scripts/dev.mjs`：开发服务器与 Electron 生命周期。
- `main.js` / `preload.js`：窗口、原生对话框与隔离 IPC。
- `runtime.js`：Python 检测、配置迁移、输出解析与 mock 后端。
- `driver.js` / `driver/`：Windows 驱动状态解析、受控提权、INF 模板与安装 / 回滚脚本。
- `python/s5focus.py`：声表与独立 RAM 区域；`python/s5svc.py`：原有协议实现，未修改。
- `mock-sound-table.json`：模拟用 28 项原厂表（长度和地址取自声表文档，辅助字段为模拟值，不用于实机恢复）。

```sh
npm run build
npm test
node --check main.js
node --check preload.js
node --check runtime.js
python3 -m unittest discover -s python/tests -v
```

启动日志：系统临时目录中的 `lumixtool_startup.log`。保留 `contextIsolation: true`、`nodeIntegration: false` 和 `sandbox: true`。生产 CSP 的脚本与连接只允许 `self`；样式允许 Ant Design 注入的内联样式，图片 / 媒体允许本地 data / blob。开发模式额外允许本机 Vite WebSocket，React refresh 前导脚本作为外部本地模块加载，不放宽内联脚本权限。

新增测试覆盖中英文 `pnputil` 样本、PowerShell JSON 的单条 / 数组、复合接口优先级、WinUSB / GUID / 设备问题、查询失败、提权结果 / UAC 取消 / 临时资源清理、驱动与相机 IPC 互斥、无需 Python 的驱动操作、重新检测期间的 UI 锁、preload 和外链精确白名单。通过真实 React 组件的服务端渲染校验状态文案、控件 ID、平台禁用与结果展示。PowerShell 安装 / 卸载脚本只做静态检查，测试中使用替代进程调用，绝不执行这些脚本。

### 仍需 Windows + 相机验收

1. 在 Windows 10/11（覆盖 x64 / ARM64 目标）测试开发版与 `app.asar` 打包版：无相机、普通模式 `2382`、服务模式 `2370`；核对设备管理器枚举、非管理员 JSON 查询与中文 / 英文系统回退结果。
2. 选择「一键安装驱动」，先取消 UAC，确认恢复可操作；重试授权，核对证书存储、生成与签名目录、`pnputil` 原始输出、退出码。确认正常配置下能否被签名策略接受，失败时是否清晰报告且可以使用手动方案。
3. 检查实际绑定 WinUSB，读取 `Device Parameters\DeviceInterfaceGUIDs` 的 REG_MULTI_SZ 和固定 GUID，确认步骤 1 完成；重复安装验证幂等。已有其它驱动时检查排名造成的保留情况，必要时使用手动方案。
4. 用真实相机完成「连接并验证」，再执行 `python python/s5focus.py status`。分别验证整体设备与 `MI_00` 复合枚举；`s5svc.py` 仍按非复合枚举根键构造路径，复合接口即使驱动正常也可能需要后续后端适配，本次不修改该文件。
5. 安装 / 卸载期间尝试相机读写、刷新、模拟切换和退出，确认互斥与提示。重新插拔 USB，确认状态自动更新。
6. 「高级」卸载，核对只删除本项目的 `oemNN.inf`；重复卸载；再安装后勾选证书清理卸载，核对三个证书存储。普通开机重插相机，确认 `2382` 的 MTP 与照片导入正常。
