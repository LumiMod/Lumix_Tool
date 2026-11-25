import { Alert, Badge, Button, Checkbox, ConfigProvider, Flex, Layout, Menu, Select, Space, Typography, theme } from 'antd';
import { AimOutlined, ExperimentOutlined, ReloadOutlined, SettingOutlined, UsbOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import './styles.css';
import './components/ConnectionGuide.css';
import './components/CameraButtonGuide.css';
import { useDevice } from './hooks/useDevice';
import { tools } from './tools';
import ConnectionGuide from './components/ConnectionGuide';
import Settings from './components/Settings';
import SupportCard from './components/SupportCard';
import LanguagePicker from './components/LanguagePicker';
import { needsDriverSetup } from './components/driverState.mjs';
import { I18nProvider, useI18n } from './i18n';

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
  return <I18nProvider>
    <ConfigProvider theme={desktopTheme}>
      <DesktopApp />
      <LanguagePicker />
    </ConfigProvider>
  </I18nProvider>;
}

const TOOL_I18N = {
  'lut-direct': { title: 'nav.lut', desc: 'nav.lutDesc', scope: 'nav.lutScope' },
  'focus-sound': { title: 'nav.sounds', desc: 'nav.soundsDesc', scope: 'nav.soundsScope' },
  memory: { title: 'nav.memory', desc: 'nav.memoryDesc', scope: 'nav.memoryScope' },
  'open-gate': { title: 'nav.openGate', desc: 'nav.openGateDesc', scope: 'nav.openGateScope' },
};

function DesktopApp() {
  const { t } = useI18n();
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
  const label = busy ? busy.label : checking || !env ? t('status.checking') : missing ? t('status.needPython') : camera.error ? t('status.error') : ready ? t('status.connected') : t('status.disconnected');
  const statusColor = camera.error && !missing ? token.colorError : ready ? token.colorSuccess : busy || checking ? token.colorInfo : token.colorTextQuaternary;
  const selectedTool = tools.find(tool => tool.id === page);
  const toolMeta = selectedTool && TOOL_I18N[selectedTool.id];
  const menuItems = [
    { key: 'connection', id: 'navConnection', icon: <UsbOutlined />, label: t('nav.connection') },
    { type: 'group', label: t('nav.tools'), children: tools.map(tool => ({ key: tool.id, icon: tool.icon, label: TOOL_I18N[tool.id] ? t(TOOL_I18N[tool.id].title) : tool.title, 'data-tool': tool.id })) },
    { type: 'divider' },
    { key: 'settings', id: 'navSettings', icon: <SettingOutlined />, label: t('nav.settings') },
  ];

  async function openGithub() {
    setLinkError('');
    try {
      const result = await device.api?.openGithub?.();
      if (result && result.ok === false) setLinkError(result.error || t('support.error'));
    } catch (error) {
      setLinkError(error.message || String(error));
    }
  }

  return <Layout className="app-shell">
    <Sider width={200} className="desktop-rail">
      <div className="sidebar-content">
        <div className="desktop-brand"><span className="brand-icon" aria-hidden="true"><AimOutlined /></span><span>Lumix<span className="brand-light">Tool</span></span></div>
        <nav aria-label={t('nav.tools')}><Menu mode="inline" className="rail-menu" inlineIndent={14}
          selectedKeys={[page]} items={menuItems} onClick={({ key }) => setPage(key)} /></nav>
        <div className="sidebar-bottom">
          <SupportCard compact id="btnSupportAuthor" onOpen={openGithub} />
          <div className="sidebar-footer"><span>{t('status.localRun')}</span><span>v{__APP_VERSION__}</span></div>
        </div>
      </div>
    </Sider>
    <Layout className="desktop-main">
      <Header className="device-header">
        <div className="device-identity">
          <span className="device-thumbnail" aria-hidden="true" />
          <div><Text strong id="deviceModel">LUMIX {camera.model || 'DC-S5'}</Text>
            <Text id="deviceDetail" type="secondary">{ready ? `Service · ${camera.body_version || ''}` : driverNeeded ? t('status.needService') : t('nav.connection')}</Text></div>
        </div>
        <Space><span id="connectionState" className="connection-state" role="status">
          <Badge color={statusColor} text={<span id="connectionLabel">{label}</span>} /></span>
          <Button id="refreshDevice" aria-label={t('status.refresh')} title={t('status.refresh')} icon={<ReloadOutlined />} loading={checking} disabled={locked} onClick={device.refreshDevice} />
        </Space>
      </Header>
      <Content className="workspace" ref={workspace}>
        <div className="page-content">
          {env?.mock && <MockToolbar device={device} />}
          {device.error && <Alert type="error" showIcon title={device.error} className="page-notice" />}
          {linkError && <Alert type="error" showIcon closable title={linkError} onClose={() => setLinkError('')} className="page-notice" />}
          {selectedTool && <>
            <div className="page-heading"><div><Title level={2}>{toolMeta ? t(toolMeta.title) : selectedTool.title}</Title><Text type="secondary">{toolMeta ? t(toolMeta.desc) : selectedTool.description}</Text></div>
              <span className="page-scope">{toolMeta ? t(toolMeta.scope) : (selectedTool.scope || 'LUMIX')}</span>
            </div>
            {!selectedTool.offline && !ready && !checking && env && <Alert className="page-notice" showIcon type={camera.error && !missing ? 'warning' : 'info'}
              title={driverNeeded ? t('status.needService') : missing ? t('status.needPython') : camera.error ? t('status.error') : t('og.connectFirst')}
              description={<span className="break-text">{camera.error || camera.platformNote || t('mobile.home.cameraSub')}</span>}
              action={<Button onClick={() => setPage(!driverNeeded && missing ? 'settings' : 'connection')}>{!driverNeeded && missing ? t('nav.settings') : t('nav.connection')}</Button>} />}
          </>}
          {tools.map(({ id, component: Tool }) => <section key={id} hidden={page !== id} data-tool-view={id}><Tool device={device} active={page === id} navigate={setPage} /></section>)}
          <section hidden={page !== 'connection'}><ConnectionGuide device={device} navigate={setPage} active={page === 'connection'} /></section>
          <section hidden={page !== 'settings'}><Settings device={device} /></section>
        </div>
      </Content>
      {busy && <div className="operation-strip" role="status">{t('status.keepUsb', { label: busy.label })}</div>}
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
