import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Col, Descriptions, Flex, Progress, Result, Row, Space, Spin, Steps, Tag, Typography, Upload, theme } from 'antd';
import { CheckCircleOutlined, CloudUploadOutlined, FileOutlined, FolderOpenOutlined, PauseOutlined, PlayCircleOutlined, PoweroffOutlined } from '@ant-design/icons';
import { decodeAudio, MAX_SECONDS } from '../focus-sound/audio.mjs';
import Waveform from '../focus-sound/Waveform';

import SoundTable from './SoundTable';
import { soundName } from './catalog';

const { Text, Paragraph } = Typography;

export default function Sounds({ device, active }) {
  const { api, ready, locked, env, progress } = device;
  const { modal, notification } = App.useApp();
  const { token } = theme.useToken();
  const [selected, setSelected] = useState([1]);
  const actionCard = useRef(null);
  const resultCard = useRef(null);
  const table = device.device.soundTable;
  const originals = table?.originals || {};
  const labels = table?.labels || {};
  const version = table?.version;
  const [audio, setAudio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [action, setAction] = useState(null);
  const [result, setResult] = useState(null);
  const [playing, setPlaying] = useState(false);
  const localLock = useRef(false);
  const player = useRef(null);
  const playbackContext = useRef(null);
  const previewEpoch = useRef(0);
  const disabled = locked || loading || picking || !!action;

  const stopPreview = useCallback(() => {
    previewEpoch.current++;
    if (player.current) {
      player.current.onended = null;
      try { player.current.stop(); } catch {}
      player.current = null;
    }
    setPlaying(false);
  }, []);
  useEffect(() => { if (!active || device.busy) stopPreview(); }, [active, device.busy, stopPreview]);
  useEffect(() => () => {
    previewEpoch.current++;
    if (player.current) { player.current.onended = null; try { player.current.stop(); } catch {} }
    void playbackContext.current?.close().catch(() => {});
  }, []);

  async function loadFile(filename) {
    stopPreview();
    setLoading(true);
    setAudio(null);
    setResult(null);
    try { setAudio(await decodeAudio(await api.readFile(filename), filename)); }
    catch (error) {
      setResult({ ok: false, title: '无法读取这段音频', text: `${error.message || error}\n请尝试其他文件；实际格式支持取决于系统音频解码器。` });
    } finally { setLoading(false); }
  }

  async function pickAudio() {
    if (disabled || localLock.current) return;
    localLock.current = true;
    setPicking(true);
    try {
      const filename = await api.pickAudio();
      if (filename) await loadFile(filename);
    } catch (error) { setResult({ ok: false, title: '无法选择文件', text: error.message || String(error) }); }
    finally { localLock.current = false; setPicking(false); }
  }

  function beforeUpload(file) {
    if (!disabled && !localLock.current) {
      localLock.current = true;
      void (async () => {
        try {
          const filename = api.pathForFile(file);
          if (!filename) throw new Error('无法读取文件路径，请使用「选择音频文件」。');
          await loadFile(filename);
        } catch (error) { setResult({ ok: false, title: '无法打开文件', text: error.message || String(error) }); }
        finally { localLock.current = false; }
      })();
    }
    // Ant Design must never upload the file or make a network request.
    return false;
  }

  async function preview() {
    if (playing) { stopPreview(); return; }
    if (!audio || disabled) return;
    const epoch = ++previewEpoch.current;
    try {
      if (!playbackContext.current) playbackContext.current = new AudioContext();
      await playbackContext.current.resume();
      if (epoch !== previewEpoch.current) return;
      const source = playbackContext.current.createBufferSource();
      source.buffer = audio.buffer;
      source.connect(playbackContext.current.destination);
      source.onended = stopPreview;
      player.current = source;
      source.start();
      setPlaying(true);
    } catch (error) { stopPreview(); setResult({ ok: false, title: '无法试听', text: error.message || String(error) }); }
  }

  useEffect(() => {
    if (active && result) resultCard.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, result]);

  async function perform(kind, indices = selected) {
    if (disabled || localLock.current || !ready || (kind === 'apply' && !audio)) return;
    localLock.current = true;
    stopPreview();
    setAction(kind);
    setResult(null);
    try {
      const response = await device.runOperation({
        tool: 'focus-sound', label: kind === 'apply' ? '正在写入音效' : '正在恢复音效',
        execute: () => kind === 'apply' ? api.applySlots(indices, audio.pcm, audio.samples, version)
          : indices ? api.restoreId(indices[0], version) : api.restoreAll(version),
      });
      const succeeded = response.succeeded || [];
      const errorText = response.error === 'region not free'
        ? '目标 RAM 区域不是空闲区，为避免覆盖相机内存，已拒绝写入'
        : response.error;
      const text = [
        response.ok ? '音效表已通过校验。' : `${errorText || '后端校验未通过。'}${response.address ? `（地址 ${response.address}）` : ''}`,
        response.failedIndex != null ? `失败编号：#${response.failedIndex}；已停止后续操作。` : '',
        `已成功：${succeeded.length ? succeeded.map(i => `#${i}`).join('、') : '无'}`,
        response.pending?.length ? `未执行：${response.pending.map(i => `#${i}`).join('、')}` : '',
      ].filter(Boolean).join('\n');
      const title = response.ok ? kind === 'apply' ? '写入成功' : '已恢复原厂音效' : kind === 'apply' ? '写入未完成' : '恢复未完成';
      const changed = response.ok || succeeded.length > 0;
      setResult({ ok: response.ok, title, text, changed });
      notification[response.ok ? 'success' : 'error']({ key: 'sound-operation', title,
        description: changed ? `${text} 用电源键关机再开机，不要拔电池。` : text, duration: 0 });
    } catch (error) {
      setResult({ ok: false, title: '操作未完成', text: error.message || String(error) });
      notification.error({ key: 'sound-operation', title: '操作未完成', description: `${error.message || error} 完成后请用电源键热重启，不要拔电池。`, duration: 0 });
    }
    finally { localLock.current = false; setAction(null); }
  }

  function confirmRestore(index) {
    if (disabled || !ready) return;
    modal.confirm({
      title: index == null ? '恢复所有有备份的原厂音效？' : `恢复 #${index} ${soundName(index, labels)}？`,
      content: `将恢复${index == null ? Object.keys(originals).length + ' 项已保存' : '这项'}原始表项。完成后请用电源键关机再开机，不要拔电池。`,
      okText: '确认恢复', cancelText: '取消',
      onOk: () => perform('restore', index == null ? null : [index]),
    });
  }

  const estimatedSeconds = audio ? audio.samples * .002 * selected.length : 0;

  const percent = progress ? Math.min(100, Math.max(0, Math.round(progress.done / progress.total * 100))) : 0;
  return <Space orientation="vertical" size="large" className="full-width">
    <SoundTable device={device} disabled={disabled} selected={selected} onSelect={setSelected}
      onReplace={index => { setSelected([index]); setResult(null); actionCard.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}
      onRestore={confirmRestore} />
    <div ref={actionCard} className="action-card"><Row gutter={[20, 20]}>
    <Col xs={24} xl={16}>
      <Space orientation="vertical" size="large" className="full-width">
        <Card title="音效文件" extra={<Tag>最长 3 秒</Tag>}>
          <Space orientation="vertical" size="large" className="full-width">
            <Steps size="small" current={result?.ok ? 2 : action ? 1 : 0} items={[{ title: '准备音频' }, { title: '写入相机' }, { title: '热重启试听' }]} />
            <div id="audioDrop" aria-label="音频文件拖放区域" aria-disabled={disabled}>
              <Upload.Dragger accept=".wav,.mp3,.m4a,.aac,.flac,.ogg,.opus" multiple={false} showUploadList={false} openFileDialogOnClick={false} disabled={disabled} beforeUpload={beforeUpload}>
              {!audio && !loading && <>
                <CloudUploadOutlined className="upload-icon" style={{ color: token.colorPrimary }} />
                <Paragraph strong>拖入一段你喜欢的声音</Paragraph>
                <Paragraph type="secondary">WAV / MP3 / M4A / AAC / FLAC / OGG / OPUS · 不超过 100 MB</Paragraph>
                <Button id="pickAudio" icon={<FolderOpenOutlined />} disabled={disabled} loading={picking} onClick={pickAudio}>选择音频文件</Button>
              </>}
              {loading && <Flex vertical align="center" gap="middle" style={{ padding: '48px 16px' }} role="status"><Spin /><Text>正在解码并转换音频…</Text></Flex>}
              {audio && <Space orientation="vertical" size="middle" className="full-width" style={{ textAlign: 'left' }}>
                <Flex align="center" gap="middle" justify="space-between">
                  <div style={{ minWidth: 0 }}><Space><FileOutlined /><Text strong id="audioName" className="file-name break-text" title={audio.filename}>{audio.filename.split(/[\\/]/).pop()}</Text></Space><br />
                    <Text type="secondary" id="audioMeta">原音频 {audio.originalDuration.toFixed(2)} 秒 · {audio.channels} 声道</Text></div>
                  <Button id="changeAudio" icon={<FolderOpenOutlined />} disabled={disabled} onClick={pickAudio}>更换</Button>
                </Flex>
                <Waveform buffer={audio.buffer} active={active} />
                <Flex align="center" justify="space-between" gap="small">
                  <Button id="previewAudio" icon={playing ? <PauseOutlined /> : <PlayCircleOutlined />} disabled={disabled} onClick={preview}>{playing ? '停止试听' : '试听写入片段'}</Button>
                  <Text type="secondary">{audio.duration.toFixed(2)} 秒 · 44.1 kHz</Text>
                </Flex>
                {audio.originalDuration > MAX_SECONDS && <Alert id="trimNotice" type="warning" showIcon title={`原音频 ${audio.originalDuration.toFixed(2)} 秒，只写入前 3 秒`} description="试听与波形均为截取、转换后的实际写入片段。" />}
              </Space>}
              </Upload.Dragger>
            </div>
            <Text type="secondary">自动转换为 44.1 kHz · 单声道 · 16-bit PCM</Text>
          </Space>
        </Card>
        {action && <Card id="operationProgress" title={action === 'apply' ? '正在写入相机' : '正在恢复原厂音效'} role="status">
          {action === 'restore' && !env?.mock ? <Space><Spin size="small" /><Text>正在恢复并校验原厂音效表…</Text></Space>
            : <Progress percent={percent} status="active" strokeColor={token.colorPrimary} />}
          <Paragraph type="secondary">{progress?.index != null ? `第 ${progress.position} / ${progress.count} 项 · #${progress.index} · ` : ''}{progress ? `${Math.min(progress.done, progress.total).toLocaleString()} / ${progress.total.toLocaleString()} ${action === 'apply' ? '采样' : '恢复单元'}${percent === 100 ? ' · 正在校验，尚未完成' : ''}` : action === 'apply' ? '准备传输 PCM 数据…' : '等待后端校验…'}</Paragraph>
          {progress?.overallTotal > 0 && <><Text>总体进度</Text><Progress id="overallProgress" percent={Math.min(100, Math.round(progress.overallDone / progress.overallTotal * 100))} status="active" /></>}
          <Alert type="info" showIcon title="请保持 USB 与电源连接，等待校验完成。" />
        </Card>}
        <div ref={resultCard}>{result && (result.ok ? <Card id="operationResult" role="status">
          <Result status="info" icon={<CheckCircleOutlined style={{ color: token.colorPrimary }} />} title={result.title} subTitle={result.text}
            extra={<Button onClick={() => setResult(null)}>收起结果</Button>} />
          <Alert showIcon type="info" icon={<PoweroffOutlined />} title="用电源键关机再开机，不要拔电池" description="电源键热重启后生效；拔电池会清除自定义音效。" />
        </Card> : <Alert id="operationResult" showIcon type="error" title={result.title} description={<span className="break-text">{result.text}</span>} closable={{ onClose: () => setResult(null) }} />)}
        {result && !result.ok && result.changed && <Alert showIcon type="info" title="用电源键关机再开机，不要拔电池" description="操作可能已部分完成，请热重启后检查；拔电池会清除全部替换。" />}
        </div>

      </Space>
    </Col>
    <Col xs={24} xl={8}>
      <Space orientation="vertical" size="large" className="full-width">
        <Card title="写入准备">
          <Descriptions column={1} size="small" items={[
            { key: 'target', label: '目标音效', children: selected.length ? selected.map(i => `#${i}`).join('、') : '请在表格中选择' },
            { key: 'duration', label: '音效时长', children: audio ? `${audio.duration.toFixed(2)} 秒` : '—' },
            { key: 'estimate', label: '预计耗时', children: audio ? `约 ${Math.ceil(estimatedSeconds)} 秒${env?.mock ? `（模拟约 ${selected.length * 3} 秒）` : ''}` : '—' },
            { key: 'location', label: '写入位置', children: '相机 RAM' },
          ]} />
          {estimatedSeconds > 120 && <Alert id="timeWarning" className="page-notice" type="warning" showIcon title="预计操作超过 2 分钟" description="服务模式空闲约 4–7 分钟可能自动关机。请轻点相机触摸屏保持唤醒，并保持 USB 与电源连接。" />}
          <Button id="applyAudio" type="primary" size="large" block icon={<CloudUploadOutlined />} disabled={disabled || !ready || !audio || !selected.length} loading={action === 'apply'} onClick={() => perform('apply')}>写入所选音效（{selected.length} 项）</Button>
          <Paragraph type="secondary" style={{ margin: '12px 0 0' }}>{action ? '操作中，请保持连接' : device.checking ? '正在检查相机连接' : !ready ? '连接相机后即可写入' : !audio ? '选择音频，开始准备' : '准备就绪，写入后需热重启'}</Paragraph>
        </Card>
        <Card title="使用提示" size="small"><Paragraph>仅修改 <Text strong>RAM</Text>，不写入 flash。电源键重启后保留，拔电池或恢复出厂后失效。</Paragraph><Text type="secondary">写入期间保持 USB 与电源连接。每个编号使用独立 RAM 区域，首次写入前会检查是否空闲。完成后用电源键热重启，再触发对应动作试听。</Text></Card>
      </Space>
    </Col>
  </Row></div></Space>;
}
