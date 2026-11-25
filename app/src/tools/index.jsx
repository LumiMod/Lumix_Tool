import { BgColorsOutlined, DatabaseOutlined, SoundOutlined, VideoCameraOutlined } from '@ant-design/icons';
import OpenGate from './OpenGate';
import LutDirect from './lut/LutDirect';
import Sounds from './sounds/Sounds';
import Memory from './memory/Memory';

export const tools = [
  {
    id: 'lut-direct',
    title: '实时 LUT 直出',
    icon: <BgColorsOutlined />,
    description: '纯 RAM 启用 DC-S5 静态照片 JPEG 实时 3D LUT 直出，原生联动 V-Log 查看助手。',
    scope: '写入 RAM · DC-S5',
    component: LutDirect,
  },
  {
    id: 'focus-sound',
    title: '音效替换',
    icon: <SoundOutlined />,
    description: '管理 28 项相机音效，逐项替换或批量定位触发动作。',
    scope: 'DC-S5 专属',
    component: Sounds,
  },
  {
    id: 'memory',
    title: '内存诊断',
    icon: <DatabaseOutlined />,
    description: '只读扫描相机 RAM 暂存区，查看哪些区域可安全写入',
    scope: '只读 · DC-S5',
    component: Memory,
  },
  {
    id: 'open-gate',
    title: '片门全开',
    icon: <VideoCameraOutlined />,
    description: '解锁 DC-S5 的 6K 3:2、5.9K 16:9 与不限时录制，或一键恢复原厂默认。',
    scope: '写入 RAM · DC-S5',
    component: OpenGate,
  },
];
