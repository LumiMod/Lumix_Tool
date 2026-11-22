import { SoundOutlined } from '@ant-design/icons';
import Sounds from './sounds/Sounds';

export const tools = [
  {
    id: 'focus-sound',
    title: '音效替换',
    icon: <SoundOutlined />,
    description: '管理 28 项相机音效，逐项替换或批量定位触发动作。',
    scope: 'DC-S5 专属',
    component: Sounds,
  },
];
