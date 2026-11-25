import { Alert, Badge, Button, Checkbox, ConfigProvider, Flex, Layout, Menu, Select, Space, Typography, theme } from 'antd';
import { AimOutlined, ExperimentOutlined, ReloadOutlined, SettingOutlined, StarOutlined, UsbOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import './styles.css';
import './components/ConnectionGuide.css';
import './components/CameraButtonGuide.css';
import { useDevice } from './hooks/useDevice';
import { tools } from './tools';
import ConnectionGuide from './components/ConnectionGuide';
import Settings from './components/Settings';
import { needsDriverSetup } from './components/driverState.mjs';

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;

const desktopTheme = {
  token: {
    colorPrimary: '#0067b8',
    colorLink: '#005fb8',
    borderRadius: 6,
    fontFamily: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif',
  },
  components: {
    Card: { headerHeight: 50, headerFontSize: 16, bodyPadding: 20 },
    Table: { cellPaddingBlockSM: 8 },
  },
};

export default function App() {
  return <ConfigProvider theme={desktopTheme}><DesktopApp /></ConfigProvider>;
}

function DesktopApp() {
  const device = useDevice(window.api);
  const [chosenPage, setPage] = useState(null);
  const [linkError, setLinkError] = useState('');
  const page = chosenPage ?? 'connection';
  const workspace = useRef(null);
  useEffect(() => { workspace.current?.scrollTo(0, 0); }, [page]);
  const { token } = theme.useToken();
  const { env, ready, locked, checking, busy, device: camera } = device;
  useEffect(() => {
    if (env && !checking) setPage(current => current ?? (ready ? tools[0].id : 'connection'));
  }, [env, checking, ready]);
  const missing = camera.pythonMissing || (env && !env.python);
  const driverNeeded = needsDriverSetup(device.driver);
  const label = busy ? busy.label : checking || !env ? '检测中' : missing ? '需要 Python' : camera.error ? '连接异常' : ready ? '已连接' : '未连接';
  const statusColor = camera.error && !missing ? token.colorError : ready ? token.colorSuccess : busy || checking ? token.colorInfo : token.colorTextQuaternary;
  const selectedTool = tools.find(tool => tool.id === page);
  const menuItems = [
    { key: 'connection', id: 'navConnection', icon: <UsbOutlined />, label: '连接相机' },
    { type: 'group', label: '相机工具', children: tools.map(tool => ({ key: tool.id, icon: tool.icon, label: tool.title, 'data-tool': tool.id })) },
    { type: 'divider' },
    { key: 'settings', id: 'navSettings', icon: <SettingOutlined />, label: '设置' },
  ];

  async function openGithub() {
    setLinkError('');
    try {
      const result = await device.api?.openGithub?.();
      if (result && result.ok === false) setLinkError(result.error || '无法打开 GitHub 链接。');
    } catch (error) {
      setLinkError(error.message || String(error));
    }
  }

  return <Layout className="app-shell">
    <Sider width={200} className="desktop-rail">
      <div className="sidebar-content">
        <div className="desktop-brand"><span className="brand-icon" aria-hidden="true"><AimOutlined /></span><span>Lumix<span className="brand-light">Tool</span></span></div>
        <nav aria-label="工具导航"><Menu mode="inline" className="rail-menu" inlineIndent={14}
          selectedKeys={[page]} items={menuItems} onClick={({ key }) => setPage(key)} /></nav>
        <div className="sidebar-bottom">
          <button type="button" id="btnSupportAuthor" className="sidebar-support" title="前往 GitHub 点亮 Star 支持作者" onClick={openGithub}>
            <StarOutlined className="sidebar-support__icon" aria-hidden="true" />
            <span>给作者赞赏</span>
            <span className="sidebar-support__tag">Star</span>
          </button>
          <div className="sidebar-footer"><span>本地运行</span><span>v{__APP_VERSION__}</span></div>
        </div>
      </div>
    </Sider>
    <Layout className="desktop-main">
      <Header className="device-header">
        <div className="device-identity">
          <span className="device-thumbnail" aria-hidden="true" />
          <div><Text strong id="deviceModel">LUMIX {camera.model || 'DC-S5'}</Text>
            <Text id="deviceDetail" type="secondary">{ready ? `服务模式 · 机身版本 ${camera.body_version || '未知'} · ${camera.custom ? '自定义音效' : '原厂音效'}` : driverNeeded ? '已识别服务模式设备，等待安装驱动' : '通过 USB 连接相机'}</Text></div>
        </div>
        <Space><span id="connectionState" className="connection-state" role="status">
          <Badge color={statusColor} text={<span id="connectionLabel">{label}</span>} /></span>
          <Button id="refreshDevice" aria-label="刷新设备连接" title="刷新设备连接" icon={<ReloadOutlined />} loading={checking} disabled={locked} onClick={device.refreshDevice} />
        </Space>
      </Header>
      <Content className="workspace" ref={workspace}>
        <div className="page-content">
          {env?.mock && <MockToolbar device={device} />}
          {device.error && <Alert type="error" showIcon title={device.error} className="page-notice" />}
          {linkError && <Alert type="error" showIcon closable title={linkError} onClose={() => setLinkError('')} className="page-notice" />}
          {selectedTool && <>
            <div className="page-heading"><div><Title level={2}>{selectedTool.title}</Title><Text type="secondary">{selectedTool.description}</Text></div>
              <span className="page-scope">{selectedTool.scope || 'LUMIX'}</span>
            </div>
            {!selectedTool.offline && !ready && !checking && env && <Alert className="page-notice" showIcon type={camera.error && !missing ? 'warning' : 'info'}
              title={driverNeeded ? '服务模式设备已连接，请先安装驱动' : missing ? '先准备 Python 运行环境' : camera.error ? '相机连接需要检查' : '先连接你的相机'}
              description={<span className="break-text">{driverNeeded ? '打开「连接相机」，使用「一键安装驱动」，完成后重新检测。' : camera.error || camera.platformNote || (page === 'focus-sound' ? '进入服务模式并连接 USB，即可写入音效。你可以先选择音频并试听。' : '请将相机置于服务模式并连接 USB，然后刷新设备。')}</span>}
              action={<Button onClick={() => setPage(!driverNeeded && missing ? 'settings' : 'connection')}>{driverNeeded ? '安装驱动' : missing ? '打开设置' : '连接相机'}</Button>} />}
          </>}
          {tools.map(({ id, component: Tool }) => <section key={id} hidden={page !== id} data-tool-view={id}><Tool device={device} active={page === id} navigate={setPage} /></section>)}
          <section hidden={page !== 'connection'}><ConnectionGuide device={device} navigate={setPage} active={page === 'connection'} /></section>
          <section hidden={page !== 'settings'}><Settings device={device} /></section>
        </div>
      </Content>
      {busy && <div className="operation-strip" role="status">{busy.label} · 请保持 USB 与电源连接</div>}
    </Layout>
  </Layout>;
}

function MockToolbar({ device }) {
  const { env, locked } = device;
  return <Flex className="mock-toolbar" align="center" justify="space-between" gap="middle" wrap>
    <Space><ExperimentOutlined /><Text strong>模拟模式</Text><Text type="secondary">所有操作均在本地模拟</Text></Space>
    <Space wrap><label htmlFor="mockScenario">设备状态</label><Select id="mockScenario" value={env.mockState.scenario} disabled={locked} style={{ width: 170 }}
      onChange={scenario => device.configureMock({ scenario })} options={[
        { value: 'connected', label: '已连接' }, { value: 'disconnected', label: '未连接' },
        { value: 'error', label: '连接异常' }, { value: 'python-missing', label: 'Python 缺失' },
        { value: 'region-not-free', label: '缓存过期（首个区域被占用）' },
        { value: 'unverified', label: '未验证固件（0x0280）' },
      ]} /><label htmlFor="mockDriver">驱动状态</label><Select id="mockDriver" value={env.mockState.driverScenario} disabled={locked} style={{ width: 170 }}
      onChange={driverScenario => device.configureMock({ driverScenario })} options={[
        { value: 'ok', label: '驱动正常' }, { value: 'absent', label: '无服务模式设备' }, { value: 'normal', label: '普通模式 2382' },
        { value: 'missing', label: '未安装驱动' }, { value: 'wrong-driver', label: '错误驱动 libusbK' },
        { value: 'missing-guid', label: '接口 GUID 缺失' }, { value: 'unknown-guid', label: '接口 GUID 未知' },
      ]} /><label htmlFor="mockDriverResult">驱动操作结果</label><Select id="mockDriverResult" value={env.mockState.driverResult} disabled={locked} style={{ width: 150 }}
      onChange={driverResult => device.configureMock({ driverResult })} options={[
        { value: 'success', label: '安装 / 卸载成功' }, { value: 'failure', label: '安装 / 卸载失败' }, { value: 'cancelled', label: '取消 UAC 授权' },
      ]} /><Checkbox id="mockFail" checked={env.mockState.failNext} disabled={locked} onChange={event => device.configureMock({ failNext: event.target.checked })}>下次相机操作失败</Checkbox></Space>
  </Flex>;
}
