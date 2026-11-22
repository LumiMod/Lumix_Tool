# 驱动安装指南（服务模式 USB / WinUSB）

> 适用：Windows 10/11，Panasonic DC-S5 服务模式（`04DA:2370`）
> 目的：让上位机（Electron 应用 / `tools/s5svc.py`）能通过 USB 读写相机 RAM。

---

## 0. 为什么需要装驱动

相机有两种 USB 身份：

| 模式 | VID:PID | 类 | Windows 默认行为 |
|---|---|---|---|
| 正常模式（PTP） | `04DA:2382` | PTP/MTP | 系统自动装 MTP 驱动，可传照片 |
| **服务模式** | `04DA:2370` | 厂商自定义 `ff/a0/b0` | **没有自带驱动**，需要手动绑定 WinUSB |

服务接口使用 Bulk IN `0x82` / Bulk OUT `0x01` 传输自定义帧，系统默认不会加载可用驱动。
因此必须用 **Zadig** 把该接口绑定到 **WinUSB**（微软通用 USB 驱动）。

> 这是一次性操作：绑定后，只要接口 PID 仍是 `2370`，驱动就一直有效。

---

## 1. 准备工作

1. 一根**数据线**（不是纯充电线）
2. 相机电池电量充足
3. 下载 [Zadig](https://zadig.akeo.ie/)（单文件，免安装）
4. 关闭其它可能占用相机的软件（图片导入工具、PTP 客户端等）

---

## 2. 让相机进入服务模式

1. 相机**关机**
2. 按住 **`PLAY`**（回放键）+ **`AF-ON`** 不放
3. 保持按住，**开机**
4. 松开按键，用 USB 线连接电脑

进入成功后，设备管理器里会出现 `04DA:2370`（可能显示为未知设备/复合设备）。

> 退出服务模式：关机再开机即可（普通开机就是正常模式）。
> 如果按 `PLAY + AF-ON` 开机后设备仍是 `2382`，说明没进服务模式，重试。

---

## 3. 用 Zadig 绑定 WinUSB

1. 运行 `zadig.exe`
2. 菜单 **Options → List All Devices**（必须勾选，否则看不到相机）
3. 在设备下拉列表里选择 **`04DA:2370`**（或名称里带 `2370` 的那一项）
   - 相机可能有多个接口，选**接口 0**（Interface 0）通常是服务接口
4. 右侧目标驱动选择 **WinUSB**（`WinUSB (v6.1.7600.16385)` 或类似）
5. 点击 **Install Driver**（或 **Replace Driver**），等待完成
6. 完成后设备管理器里该设备的驱动提供者应显示 **WinUSB**

### 验证绑定成功

- 设备管理器 → 找到该设备 → 属性 → 驱动程序 → 提供程序：`WinUSB`
- 设备管理器 → 属性 → 详细信息 → `设备接口 GUID`，应能看到：
  `{CDE53111-593A-43C9-AB10-EA9DACF2C573}`
  （本项目的客户端就是按这个 GUID 枚举接口的）

---

## 4. 用工具验证连通性

相机保持服务模式、USB 连接，运行：

```bash
cd app
python python/s5focus.py status
```

预期输出类似：

```json
{"connected": true, "id1_addr": "0x06AA3180", "id1_size": 14464, "custom": false, "body_version": "0x0290"}
```

或者用更底层的自检：

```bash
python tools/s5svc.py selftest
```

能读到数据即说明驱动 + 协议都正常。

---

## 5. 回退 / 卸载驱动

想让相机恢复成普通 MTP 设备：

1. 设备管理器 → 找到 `04DA:2370` 设备
2. 右键 → **卸载设备**，勾选「删除此设备的驱动程序软件」
3. 拔掉 USB，重新插上
4. Windows 会重新识别（正常模式下为 `04DA:2382`，自动装 MTP 驱动）

也可以在 Zadig 里对该设备选择 **Replace Driver → USB Serial (CDC)** 之类恢复，但最干净的是卸载后让系统重装。

---

## 6. 常见问题（本项目实际遇到过的）

| 现象 | 原因 | 处理 |
|---|---|---|
| `python s5focus.py status` 输出 `{"connected": false}` | 设备没枚举到，或没进服务模式 | 确认 PID 是 `2370`；重新按 `PLAY+AF-ON` 开机 |
| 报错 `CreateFile failed - is WinUSB bound to 04DA:2370? (GetLastError=2)` | 接口没绑定 WinUSB，或 GUID 不对 | 用 Zadig 重新绑定；确认设备接口 GUID 是 `{CDE53111-593A-43C9-AB10-EA9DACF2C573}` |
| `WinUsb_Initialize failed (GetLastError=6)` | 句柄未以重叠（overlapped）方式打开 | 本项目客户端已用 `FILE_FLAG_OVERLAPPED`，无需处理；自己写客户端时必须加 |
| Zadig 列表里看不到相机 | 没开 `List All Devices`，或相机不在服务模式 | 勾选 Options → List All Devices；重新进服务模式 |
| 绑定后程序仍连不上 | 其它程序占用了设备 | 关闭相机伴侣、图片导入、PTP 工具后重试 |
| 传输中途相机无响应 | 发送了 `0x70` 等会冻结机身的命令 | **永远不要发 `0x70`**；重新插拔 USB 恢复 |

---

## 7. 自动化/进阶说明

- 客户端（`tools/s5svc.py`）通过 SetupAPI 枚举设备，读取注册表
  `Device Parameters\DeviceInterfaceGUIDs` 得到接口 GUID，再用 `CreateFile` +
  `WinUsb_Initialize` 打开。
- 设备打开标志必须包含 `FILE_FLAG_OVERLAPPED`，否则 `WinUsb_Initialize` 返回
  `ERROR_INVALID_HANDLE (6)`。
- 每次 1 KiB 读（`0x5C`）约 4 ms；半字写（`0x9C`）约 2 ms，可用 `settle` 参数调节。
- 服务模式会在一段时间空闲后自动关机，长时间操作时注意。

---

## 8. 应用内的引导

Electron 应用的「新手引导」第 1 步就是本文档的简化版：

1. 用 Zadig 把 `04DA:2370` 接口绑定为 WinUSB（只需一次）
2. `PLAY + AF-ON` 开机进服务模式
3. 点「刷新」确认连接

如果这步失败，应用状态栏会显示「未连接」，请回到本文档第 6 节排查。
