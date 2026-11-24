import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from 'antd';
import { ArrowLeftOutlined, CheckOutlined, UsbOutlined } from '@ant-design/icons';
import DriverSetup, { DriverResult, DriverStatus } from './DriverSetup';
import { needsDriverSetup } from './driverState.mjs';
import CameraButtonGuide from './CameraButtonGuide';

const steps = ['准备相机', '连接 USB', '连接完成'];

export default function ConnectionGuide({ device, navigate, active }) {
  const { driver, ready, checking, locked, device: camera } = device;
  const [manualPage, setManualPage] = useState(null);
  const [tested, setTested] = useState(false);
  const detected = driver?.present === true;
  const unsupported = driver?.supported === false;
  const page = manualPage === 'prepare' ? 0 : ready ? 2
    : manualPage === 'usb' || detected || unsupported ? 1 : 0;
  const needsInstall = needsDriverSetup(driver);
  const driverPanel = needsInstall || unsupported;
  const missingPython = driver?.ok && (camera.pythonMissing || (device.env && !device.env.python));
  const pending = checking || device.driverChecking;
  const heading = useRef(null);
  const previousPage = useRef(page);
  useEffect(() => {
    if (active && previousPage.current !== page) heading.current?.focus({ preventScroll: true });
    previousPage.current = page;
  }, [active, page]);


  useEffect(() => {
    if (!active || !driver?.supported || page === 1) return;
    const timer = setInterval(() => { void device.refreshDriver(); }, 5000);
    return () => clearInterval(timer);
  }, [active, driver?.supported, device.refreshDriver, page]);

  async function detect() {
    setTested(true);
    await device.refreshDevice();
  }

  function prepare() {
    setManualPage('prepare');
    setTested(false);
  }

  function connect() {
    setManualPage('usb');
    setTested(false);
  }

  return <div className="connection-guide">
    <h2 className="connection-heading" ref={heading} tabIndex={-1}>连接相机</h2>
    <ol className="connection-progress" aria-label="连接进度">
      {steps.map((label, index) => <li key={label} aria-current={index === page ? 'step' : undefined}>
        <span aria-hidden="true">{index < page ? <CheckOutlined /> : index + 1}</span>{label}
      </li>)}
    </ol>
    {page === 0 && <>
      {driver?.normalPresent && <Alert showIcon type="info" title="电脑检测到相机处于普通模式，请按下图重新开机。" />}
      <CameraButtonGuide active={active}>
        <Button type="primary" onClick={connect}>相机已开机，继续</Button>
      </CameraButtonGuide>
      <Alert className="page-notice" showIcon type="info" title="建议先在机身菜单关闭「自动休眠」"
        description="若相机开启了省电定时睡眠（自动休眠），进入睡眠时会与电脑断开 USB 连接，导致音频写入中断；单纯的屏幕自动熄灭不会断联。" />
    </>}
    {page === 1 && <section className="connection-sheet">
      <Button type="text" className="guide-back" icon={<ArrowLeftOutlined />} onClick={prepare}>查看开机方法</Button>
      <h3>{unsupported ? '请在 Windows 电脑上连接相机' : needsInstall ? '为这台相机安装驱动'
        : detected ? '检查相机连接' : '用 USB 数据线连接相机和电脑'}</h3>
      {driverPanel ? <>
        <DriverStatus driver={driver} />
        <DriverResult device={device} />
        <DriverSetup device={device} />
      </> : <>
        <p className="guide-instruction">{detected ? '电脑已识别 USB 设备。检测连接后即可使用相机工具。'
          : '相机保持开机。将数据线一端插入相机的 USB-C 接口，另一端插入电脑。'}</p>
        <div aria-live="polite">
          {pending ? <p className="guide-instruction">正在检测，请保持 USB 连接…</p>
            : driver?.normalPresent && !detected ? <Alert type="warning" showIcon title="相机处于普通模式" description="请返回开机方法，按住两个指定按键重新开机，再检测连接。" />
            : detected && !driver.ok ? <DriverStatus driver={driver} />
            : missingPython ? <Alert type="warning" showIcon title="相机已识别，需要配置 Python 运行环境" />
            : tested || driver?.error || detected ? <Alert type="info" showIcon
                title={detected ? 'USB 设备已识别，等待相机响应' : driver?.error ? '未能检测 USB 设备' : '尚未检测到相机'}
                description={driver?.error || (detected && camera.error) || (detected ? '请关闭其他占用相机的软件，再检测一次。' : '确认数据线支持文件传输、两端插紧，然后重新检测。')} /> : null}
        </div>
        <div className="connection-actions">
          {missingPython ? <Button type="primary" onClick={() => navigate('settings')}>配置运行环境</Button>
            : <Button id="verifyDevice" type="primary" disabled={locked} loading={pending} icon={<UsbOutlined />}
                onClick={detect}>{tested ? '重新检测相机' : '检测相机'}</Button>}
        </div>
        <details className="connection-details"><summary>驱动信息与维护</summary>
          {(!detected || driver.ok) && <DriverStatus driver={driver} />}<DriverResult device={device} /><DriverSetup device={device} maintenanceOnly />
        </details>
      </>}
    </section>}
    {page === 2 && <section className="connection-sheet">
      <span className="connection-check" aria-hidden="true"><CheckOutlined /></span>
      <h3>{camera.model || 'DC-S5'} 已连接</h3>
      <p className="guide-instruction">电脑已能读取相机信息。{camera.body_version ? '机身版本 ' + camera.body_version + '。' : ''}写入较长音频前请确认已关闭机身「自动休眠」（仅屏幕黑屏不会断联，进入睡眠会断开 USB）。</p>
      <div className="connection-actions"><Button id="verifyDevice" type="primary"
        disabled={device.actionLocked} onClick={() => navigate('focus-sound')}>打开音效工具</Button></div>
      <details className="connection-details"><summary>连接信息与驱动维护</summary>
        <DriverStatus driver={driver} /><DriverResult device={device} /><DriverSetup device={device} maintenanceOnly />
        <Button type="link" onClick={prepare}>再次查看机身按键</Button>
      </details>
    </section>}
  </div>;
}
