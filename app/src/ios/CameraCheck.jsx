import { useRef, useState } from 'react';
import { CameraOutlined, LoadingOutlined, UsbOutlined } from '@ant-design/icons';
import { discoverCameras } from './native';

function usbId(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff
    ? '0x' + value.toString(16).toUpperCase().padStart(4, '0')
    : null;
}

function UsbCamera({ device, copy }) {
  const vendor = usbId(device.vendorId);
  const product = usbId(device.productId);
  let mode = copy.unknown;
  if (vendor && product) {
    mode = device.vendorId === 0x04da && device.productId === 0x2370 ? copy.matched : copy.other;
  }
  return <li>
    <strong><CameraOutlined aria-hidden="true" /> {device.name || copy.unnamed}</strong>
    {(vendor || product) && <div className="ios-camera-ids">
      {vendor && <span>VID <code>{vendor}</code></span>}
      {product && <span>PID <code>{product}</code></span>}
    </div>}
    <p>{mode}</p>
  </li>;
}

export default function CameraCheck({ copy, onPendingChange }) {
  const [status, setStatus] = useState(null);
  const [devices, setDevices] = useState([]);
  const checking = useRef(false);

  async function check() {
    if (checking.current) return;
    checking.current = true;
    onPendingChange(true);
    setStatus('checking');
    setDevices([]);
    try {
      const response = await discoverCameras();
      if (response?.status === 'found' && Array.isArray(response.devices) && response.devices.length) {
        setDevices(response.devices);
        setStatus('found');
      } else {
        setStatus(['empty', 'denied', 'restricted'].includes(response?.status) ? response.status : 'unavailable');
      }
    } catch {
      setStatus('unavailable');
    } finally {
      checking.current = false;
      onPendingChange(false);
    }
  }

  return <div className="ios-usb-panel">
    <button type="button" className="lut-btn is-primary" disabled={status === 'checking'} onClick={check}>
      {status === 'checking' ? <LoadingOutlined aria-hidden="true" /> : <UsbOutlined aria-hidden="true" />}
      {status === 'checking' ? copy.checking : copy.check}
    </button>
    <div role="status" aria-live="polite" aria-atomic="true">
      {status && <div className="ios-usb-result">
        <h2>{copy[status]}</h2>
        {status === 'found'
          ? <ul>{devices.map((device, i) => <UsbCamera key={i} device={device} copy={copy} />)}</ul>
          : copy[status + 'Help'] && <p>{copy[status + 'Help']}</p>}
      </div>}
    </div>
  </div>;
}
