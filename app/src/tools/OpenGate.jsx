import { Alert, Button, Card, Descriptions, Flex, Popconfirm, Progress, Space, Tag, Typography } from 'antd';
import {
  CheckCircleFilled, UndoOutlined, UnlockOutlined, UsbOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import './OpenGate.css';

const { Text, Paragraph } = Typography;

const formats = [
  { id: 'open', name: '6K 片门全开', resolution: '5952 × 3968', ratio: '3:2' },
  { id: 'wide', name: '5.9K 宽屏', resolution: '5888 × 3312', ratio: '16:9' },
];
const frameRate = '23.98p';
const codec = '10-bit HEVC';
const camera = 'DC-S5 一代，官方固件 2.9';
const note = '规格来源：rileydeacon / S5 Unlocker。请在相机的 MOV 录制质量菜单确认当前可选模式。';

export default function OpenGate({
  mobile = false,
  device = null,
  deviceState = null,
  busy = false,
  progress = null,
  onOpenConnect = null,
  onSetUnlock = null,
}) {
  if (!mobile) return <DesktopOpenGate device={device} />;
  return <MobileOpenGate deviceState={deviceState} busy={busy} progress={progress}
    onOpenConnect={onOpenConnect} onSetUnlock={onSetUnlock} />;
}

function DesktopOpenGate({ device }) {
  const { api, device: cameraInfo = {}, busy, progress, locked, env, navigate } = device || {};
  const unlock = cameraInfo?.unlock;
  const connected = !!cameraInfo?.connected && !cameraInfo?.error;
  const supported = !!unlock?.supported;
  const unlocked = !!unlock?.unlocked;
  const working = busy?.tool === 'open-gate';
  const disabled = !!locked || working;
  const [error, setError] = useState('');

  async function run(enable) {
    if (!api || disabled) return;
    setError('');
    try {
      const result = await device.runOperation({
        tool: 'open-gate',
        label: enable ? '正在解锁片门全开' : '正在恢复原厂默认',
        execute: () => api.setUnlock(enable),
      });
      if (!result?.ok) setError(result?.error || '操作未成功，请检查连接后重试。');
    } catch (err) { setError(err.message || String(err)); }
  }

  const total = progress?.total || 19;
  const percent = working ? Math.round(((progress?.done || 0) / total) * 100) : 0;
  const statusTag = !connected ? <Tag>未连接</Tag> : !supported ? <Tag color="error">固件不支持</Tag>
    : unlocked ? <Tag color="success">已解锁</Tag> : <Tag color="default">未解锁</Tag>;

  return <Flex vertical gap={16} className="opengate">
    <Card title="可解锁规格" extra={<Tag color="blue">DC-S5 一代 · 固件 2.9</Tag>}>
      <Descriptions column={2} size="small" bordered items={[
        { key: 'camera', label: '适用机型', children: camera },
        ...formats.map(format => ({
          key: format.id, label: format.name,
          children: [format.resolution, format.ratio, frameRate, codec].join(' · '),
        })),
        { key: 'duration', label: '录制时长', children: '所有限时模式解除时长限制' },
      ]} />
      <Paragraph type="secondary" style={{ margin: '12px 0 0' }}>{note}</Paragraph>
    </Card>

    <Card title="解锁状态" extra={<span id="unlockState">{statusTag}</span>}>
      {!connected && <Alert type="info" showIcon title="尚未连接相机"
        description={cameraInfo?.pythonMissing || (env && !env.python)
          ? '先准备好 Python 运行环境，再进入服务模式连接相机。'
          : '相机关机，同时按住机背回放键（▶）和 AF-ON 键，再开机，然后用 USB 连接电脑。'}
        action={<Button id="openGateConnectBtn" onClick={() => navigate?.('connection')}>去连接相机</Button>} />}

      {connected && !supported && <Alert type="error" showIcon title="当前固件不支持片门全开解锁"
        description={unlock?.error || `仅支持初代 DC-S5（MC801）官方固件 2.9；写入前会校验 ${unlock?.totalAnchors || 13} 处固件特征锚点。`} />}

      {connected && supported && <>
        <Alert type={unlocked ? 'success' : 'info'} showIcon
          title={unlocked ? '已解锁：6K 3:2、5.9K 16:9 与不限时录制已生效' : '尚未解锁'}
          description={unlocked
            ? '可以直接拔下数据线。进入相机 MENU → 视频 → 录制质量（MOV），在最底部选择 6K / 5.9K 规格。'
            : `将写入并校验 ${unlock?.totalPatches || 19} 个易失性 RAM 半字，不修改固件。正常开关机后仍生效，拔电池即恢复原厂。`} />
        {working && <Progress percent={percent} status="active" style={{ marginTop: 16 }} />}
        <Space style={{ marginTop: 16 }} wrap>
          {!unlocked && <Button id="btnUnlockCamera" type="primary" icon={<UnlockOutlined />}
            loading={working} disabled={disabled} onClick={() => run(true)}>一键解锁</Button>}
          {unlocked && <Popconfirm title="恢复原厂默认？"
            description="把 19 个 RAM 半字还原为原厂值，不需要拔电池。"
            okText="确认恢复" cancelText="取消" disabled={disabled}
            onConfirm={() => run(false)}>
            <Button id="btnPromptRestoreUnlock" icon={<UndoOutlined />}
              loading={working} disabled={disabled}>恢复原厂默认</Button>
          </Popconfirm>}
          <Text type="secondary">
            锚点 {unlock?.verifiedAnchors || 0}/{unlock?.totalAnchors || 13} · 半字 {unlock?.unlockedWords || 0}/{unlock?.totalPatches || 19}
          </Text>
        </Space>
      </>}

      {error && <Alert type="error" showIcon title="操作未成功" description={error} style={{ marginTop: 16 }} />}
      {working && <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>请保持 USB 与相机电源连接。</Text>}
    </Card>

    <Card title="安全说明">
      <ul className="opengate-notes">
        <li>只改写 19 个易失性 RAM 半字，不写固件、不动 flash。</li>
        <li>写入前强制校验 13 处固件特征锚点，非 MC801 2.9 一律拒绝，相机不会被修改。</li>
        <li>正常电源开关机后仍然生效；拔电池或恢复出厂设置即还原。</li>
        <li>解锁后无需保持连接，可直接拔下数据线再操作相机菜单。</li>
      </ul>
    </Card>
  </Flex>;
}

function MobileOpenGate({ deviceState, busy, progress, onOpenConnect, onSetUnlock }) {
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const connected = !!deviceState?.connected;
  const unlockInfo = deviceState?.unlock || null;
  const supported = !!unlockInfo?.supported;
  const unlocked = !!unlockInfo?.unlocked;
  const working = busy && (progress?.phase === 'unlock' || progress?.phase === 'lock');

  async function runUnlock(enable) {
    if (!onSetUnlock || busy) return;
    setConfirmRestore(false);
    setErrorMsg('');
    const res = await onSetUnlock(enable);
    if (!res?.ok) {
      setErrorMsg(res?.error || '操作未成功，请检查连接后重试');
    }
  }

  return <section className="gate-spec" aria-label="片门全开解锁">
    <div className="gate-card">
      <div className="gate-spec__comparison">
        {formats.map(format => <figure key={format.id}>
          <div className="gate-spec__stage" aria-hidden="true">
            <div className={'gate-spec__frame' + (unlocked ? ' is-armed' : '')} style={{ aspectRatio: format.ratio.replace(':', '/') }}>
              <span>{format.ratio}</span>
            </div>
          </div>
          <figcaption>
            <strong>{format.name}</strong>
            <span>{format.resolution}</span>
          </figcaption>
        </figure>)}
      </div>
    </div>

    <div className="gate-card">
      <ul className="gate-perks">
        <li>
          <span>6K / 5.9K 规格</span>
          <strong>23.98p · 10-bit MOV</strong>
        </li>
        <li>
          <span>录制时长</span>
          <strong>解除 30 分钟限制</strong>
        </li>
        <li>
          <span>安全可逆</span>
          <strong>正常开关机保留 · 拔电池还原</strong>
        </li>
      </ul>
    </div>

    {connected && !supported && <div role="alert" className="gate-notice is-error">
      <WarningOutlined />
      <span>仅支持初代 DC-S5 官方 2.9 固件</span>
    </div>}

    {errorMsg && <div role="alert" className="gate-notice is-error">
      <WarningOutlined />
      <span>{errorMsg}</span>
    </div>}

    {working && <div className="gate-progress" role="status">
      <div className="gate-progress__bar">
        <div style={{ width: `${Math.round(((progress?.done || 0) / (progress?.total || 19)) * 100)}%` }} />
      </div>
    </div>}

    {!connected && <button id="unlockConnectBtn" className="primary-btn" disabled={busy} onClick={() => onOpenConnect?.()}>
      <UsbOutlined />先连接相机
    </button>}

    {connected && supported && !unlocked && <button id="btnUnlockCamera" className="primary-btn" disabled={busy} onClick={() => runUnlock(true)}>
      <UnlockOutlined />{busy ? '正在解锁…' : '一键解锁'}
    </button>}

    {connected && supported && unlocked && <div className="gate-armed">
      <div className="gate-armed__box" role="status">
        <CheckCircleFilled />
        <div>
          <strong>已解锁，可直接拔下数据线</strong>
          <p>进入相机 MENU → 视频 → 录制质量 (MOV) 最底部选择</p>
        </div>
      </div>

      {!confirmRestore ? (
        <button id="btnPromptRestoreUnlock" className="ghost-btn" disabled={busy} onClick={() => setConfirmRestore(true)}>
          <UndoOutlined />恢复原厂默认
        </button>
      ) : (
        <div className="gate-confirm">
          <span>确认恢复为原厂默认状态？</span>
          <div>
            <button id="btnConfirmRestoreUnlock" className="primary-btn is-compact" disabled={busy} onClick={() => runUnlock(false)}>确认</button>
            <button className="ghost-btn is-compact" disabled={busy} onClick={() => setConfirmRestore(false)}>取消</button>
          </div>
        </div>
      )}
    </div>}
  </section>;
}
