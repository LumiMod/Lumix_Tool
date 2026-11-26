# 在 Mac mini 上构建 LumixTool iOS 版

分支 `codex/ios-offline-lut` 基于 v0.4.2 的移动界面。iOS 版可以从「文件」读取 CUBE 或 VLT、使用内置预设、导出适用于 DC-S5 存储卡的 VLT，并离线查看三语菜单教程。「检查 USB 相机」用于观察 iOS 能否发现接入的设备。相机激活、LUT 机身烧录和其他机身写入功能仍需使用已支持的平台。

## 从干净的检出开始

准备 Xcode 26 或更高版本、iOS Simulator 运行时和 Node.js 22.12 或更高版本。App 支持 iOS 16.4 及以上。首次构建需要联网获取 npm 依赖和 Swift Package。[Capacitor iOS 环境要求](https://capacitorjs.com/docs/ios)

```sh
git clone --branch codex/ios-offline-lut --single-branch https://github.com/USER-HFC/Lumix_Tool.git
cd Lumix_Tool/app
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
npm run ios:sync
```

`ios:sync` 会生成 iOS 专用网页资源并复制进现有的 Xcode 工程。每次修改 React 界面后，先重新运行这条命令。工程使用 Swift Package Manager。以下命令均从 `app/` 运行。

## 先编译模拟器版本

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$TMPDIR/LumixTool-iOS" build
open ios/App/App.xcodeproj
```

在 Xcode 选择 **App** scheme 和一台 iPhone 模拟器，按 **Run**。可以用仓库的 [CINEWARM.cube](../luts/CINEWARM.cube) 测试文件往返。将文件放入模拟器「文件」，从 App 选取并导出为 VLT，再把导出的 VLT 导入一次。分别取消一次选取和保存，确认可以继续操作。另可用内置预设检查导出，用菜单教程检查语言切换与返回。

文件选取支持 UTF-8 文本，上限为 32 MiB。实际导出通过系统「文件」选择保存位置。模拟器中的 USB 检查会显示不可用。插手机前，可以先编译面向真机的代码，检查 ImageCaptureCore 与当前 SDK 是否匹配。

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath "$TMPDIR/LumixTool-iOS" CODE_SIGNING_ALLOWED=NO build
```

## 真机和归档

在 Xcode 的 **App → Signing & Capabilities** 选择自己的开发团队。默认 Bundle Identifier 为 `io.github.userhfc.lumixtool`。若签名团队需要其他标识，请同时修改 App target 的 Bundle Identifier 和 [Capacitor 配置](../app/capacitor.config.json) 中的 `appId`。连接 iPhone 或 iPad，选择该设备后按 **Run**。首次安装开发版本时，按设备提示启用开发者模式。[Apple 开发者模式说明](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)

USB 识别需要 **iPhone 或 iPad、可传数据的连接线或转接器，以及真实的 DC-S5**。分别记录普通照片传输模式与服务模式下的检查结果。检查由用户发起，界面显示 iOS 报告的设备和可用标识。检测结果用于确认系统能否发现相机，机身控制能力仍待验证。

需要安装包时，选择 **Any iOS Device**，执行 **Product → Archive**。在 Organizer 中选择 **Distribute App**，按实际签名团队选择已注册设备分发或 TestFlight。证书与签名描述文件由 Mac 的开发团队管理。[Apple 分发说明](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)
