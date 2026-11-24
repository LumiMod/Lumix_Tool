import { useAudioPreview } from '../../hooks/useAudioPreview';
import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Flex, Progress, Result, Slider, Space, Spin, Typography, Upload, theme } from 'antd';
import { CheckCircleOutlined, CloudUploadOutlined, FileOutlined, FolderOpenOutlined, PauseOutlined, PlayCircleOutlined, PoweroffOutlined, SoundOutlined } from '@ant-design/icons';
import { applyAudioGain, decodeAudio, MAX_GAIN_DB, MAX_SECONDS, MIN_GAIN_DB } from '../focus-sound/audio.mjs';
import Waveform from '../focus-sound/Waveform';

import SoundTable from './SoundTable';
import './Sounds.css';
import { soundName } from './catalog';
import { BLOCK, TAIL_BYTES, memoryStats, planAllocation } from '../../../memory.mjs';

const { Text, Paragraph } = Typography;

export default function Sounds({ device, active, navigate }) {
  const { api, ready, locked, env, progress } = device;
  const { modal, notification } = App.useApp();
  const { token } = theme.useToken();
  const [selected, setSelected] = useState([1]);
  const actionCard = useRef(null);
  const resultCard = useRef(null);
  const tableCard = useRef(null);
  const table = device.device.soundTable;
  const originals = table?.originals || {};
  const labels = table?.labels || {};
  const version = table?.version;
  const map = device.device.memoryMap;
  const [audio, setAudio] = useState(null);
  const [gainDb, setGainDb] = useState(0);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [action, setAction] = useState(null);
  const [result, setResult] = useState(null);
  const { playing, stopPreview, preview: playAudio } = useAudioPreview();
  const localLock = useRef(false);
  const disabled = locked || loading || picking || !!action;
  // The backend refuses writes on firmware/tables it has not verified; mirror it here.
  const firmwareBlocked = device.device?.connected && device.device?.verified === false;

  useEffect(() => { if (!active || device.busy) stopPreview(); }, [active, device.busy, stopPreview]);
  async function loadFile(filename) {
    stopPreview();
    setLoading(true);
    setAudio(null);
    setGainDb(0);
    setResult(null);
    try { setAudio(await decodeAudio(await api.readFile(filename), filename)); }
    catch (error) {
      setResult({ ok: false, title: '无法读取这段音频', text: `${error.message || error}\n请尝试其他文件；实际格式支持取决于系统音频解码器。` });
    } finally { setLoading(false); }
  }

  function changeGain(nextDb) {
    if (disabled) return;
    stopPreview();
    setGainDb(nextDb);
    setAudio(current => current ? applyAudioGain(current, nextDb) : null);
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

  function preview() {
    if (!disabled) void playAudio(audio?.buffer, text => setResult({ ok: false, title: '无法试听', text }));
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
        ? '目标 RAM 区域已被占用，内存扫描缓存可能已过期；本项未写入，请重新扫描内存后再试。'
        : /^(unsupported firmware|sound table check failed)/.test(response.error || '')
          ? `这台相机的固件或音效表与已验证的不一致，已拒绝写入，相机未被修改。（${response.error}）`
          : response.error;
      const text = [
        response.ok ? '音效表已通过校验。' : `${errorText || '后端校验未通过。'}${response.address ? `（地址 ${response.address}）` : ''}`,
        response.failedIndex != null ? `失败编号：#${response.failedIndex}；已停止后续操作。` : '',
        `已成功：${succeeded.length ? succeeded.map(i => `#${i}`).join('、') : '无'}`,
        response.pending?.length ? `未执行：${response.pending.map(i => `#${i}`).join('、')}` : '',
      ].filter(Boolean).join('\n');
      const title = response.ok ? kind === 'apply' ? '写入成功' : '已恢复原厂音效' : kind === 'apply' ? '写入未完成' : '恢复未完成';
      const changed = response.ok || succeeded.length > 0;
      setResult({ ok: response.ok, title, text, changed, rescan: response.rescan || response.error === 'region not free' || response.code === 'insufficient-space' });
      notification[response.ok ? 'success' : 'error']({ key: 'sound-operation', title,
        description: changed ? `${text} 用电源键关机再开机，不要拔电池。` : text, duration: 0 });
    } catch (error) {
      setResult({ ok: false, title: '操作未完成', text: error.message || String(error) });
      notification.error({ key: 'sound-operation', title: '操作未完成', description: `${error.message || error} 完成后请用电源键热重启，不要拔电池。`, duration: 0 });
    }
    finally { localLock.current = false; setAction(null); }
  }

  async function rescanMemory() {
    try {
      const response = await device.runOperation({ tool: 'memory', label: '正在扫描内存（只读）', execute: () => api.scanMemory() });
      if (!response.ok) throw new Error(response.error || '内存扫描失败。');
      setResult(null);
      notification.success({ title: '扫描完成', description: '请核对新的写入地址，再次点击写入。' });
    } catch (error) { notification.error({ title: '扫描未完成', description: error.message || String(error) }); }
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

  const estimatedSeconds = audio ? (audio.samples + TAIL_BYTES / 2) * .002 * selected.length : 0;
  const stats = memoryStats(map, table?.entries);
  const plan = audio && selected.length ? planAllocation(map, table?.entries, selected, audio.samples) : null;
  const scanning = progress?.phase === 'scan';

  const percent = progress ? Math.min(100, Math.max(0, Math.round(progress.done / progress.total * 100))) : 0;
  return <div className="sound-workspace">
    {firmwareBlocked && <Alert id="firmwareBlocked" showIcon type="warning" title={`固件未经验证（机身版本 ${device.device.body_version || '未知'}），已禁用写入和恢复`}
      description={<>音效表地址、暂存区地址都是在松下 DC-S5 v2.9 固件（机身版本 0x0290）上实测确定的。其它固件上这些地址可能存放着别的数据，写入可能导致相机异常，因此只开放查看和内存扫描。{device.device.table_problem ? `音效表检查：${device.device.table_problem}。` : ''}</>} />}
    <div ref={actionCard} className="action-card sound-preparation">
      <Card className="sound-source-card" title="音频素材" extra={<Text type="secondary">最长 {MAX_SECONDS} 秒</Text>}>
        <Space orientation="vertical" size="large" className="full-width">
          <div id="audioDrop" className={!audio && !loading ? 'drop-empty' : undefined} aria-label="音频文件拖放区域" aria-disabled={disabled}>
            <Upload.Dragger accept=".wav,.mp3,.m4a,.aac,.flac,.ogg,.opus" multiple={false} showUploadList={false} openFileDialogOnClick={false} disabled={disabled} beforeUpload={beforeUpload}>
            {!audio && !loading && <div className="sound-drop-content">
                <span className="sound-drop-mark" aria-hidden="true"><SoundOutlined /></span>
                <strong>拖入音频文件</strong>
                <Button id="pickAudio" icon={<FolderOpenOutlined />} disabled={disabled} loading={picking} onClick={pickAudio}>选择音频文件</Button>
            </div>}
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
          {audio && <div className="sound-gain-control">
            <Flex align="center" justify="space-between" gap="small">
              <Text>导入音量调节</Text>
              <Space size="small">
                <Text code id="audioGainValue">{gainDb > 0 ? `+${gainDb}` : gainDb} dB</Text>
                {gainDb !== 0 && <Button size="small" type="link" style={{ padding: 0, height: 'auto' }} disabled={disabled} onClick={() => changeGain(0)}>重置</Button>}
              </Space>
            </Flex>
            <Slider id="audioGain" min={MIN_GAIN_DB} max={MAX_GAIN_DB} step={1} value={gainDb} disabled={disabled}
              marks={{ [MIN_GAIN_DB]: `${MIN_GAIN_DB}dB`, 0: '0dB', [MAX_GAIN_DB]: `+${MAX_GAIN_DB}dB` }}
              tooltip={{ formatter: value => `${value > 0 ? '+' : ''}${value} dB` }} onChange={changeGain} />
            {audio.clipped && gainDb > 0 && <Text type="warning" style={{ fontSize: 12 }}>当前增益下部分峰值已触及 0 dBFS 限幅，如试听有失真可适当调低。</Text>}
          </div>}
          <div className="sound-file-details">
            {!audio && <Text type="secondary">WAV / MP3 / M4A / AAC / FLAC / OGG / OPUS · 最大 100 MB</Text>}
            <Text type="secondary">输出为 44.1 kHz · 单声道 · 16-bit PCM</Text>
          </div>
        </Space>
      </Card>
      <Card className="sound-write-card" title="写入准备" extra={<Button size="small" type="text" onClick={() => tableCard.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>选择音效 ↓</Button>}>
        <div className="sound-target"><Text type="secondary">目标音效</Text>
          <strong>{selected.length === 1 ? `#${selected[0]} · ${soundName(selected[0], labels)}` : selected.length ? `已选 ${selected.length} 项` : '尚未选择'}</strong>
        </div>
        {selected.length > 1 && <p className="sound-target-ids">{selected.map(i => `#${i}`).join('、')}</p>}
        {audio && <div className="sound-estimate"><Text type="secondary">{audio.duration.toFixed(2)} 秒 · 预计写入约 {Math.ceil(estimatedSeconds)} 秒{env?.mock ? `（模拟约 ${selected.length * 3} 秒）` : ''}</Text></div>}
        <details className="sound-memory-details"><summary>内存分配详情</summary>
        <Descriptions column={1} size="small" items={[
          { key: 'location', label: '写入位置', children: '相机 RAM' },
          { key: 'free', label: '可用空间', children: map ? `${stats.totalFree / BLOCK} KiB / 最大连续 ${stats.largestFree / BLOCK} KiB` : '尚未扫描' },
          { key: 'plan', label: '预计地址 / 大小', children: plan?.ok ? <Space orientation="vertical" size={0}>{plan.allocations.map(item => <Text key={item.index}>#{item.index} → <Text code>{item.address}</Text>（{item.bytes / BLOCK} KiB{item.reused ? '，复用' : ''}）</Text>)}</Space> : plan?.code === 'insufficient-space' ? '空间不足，无法分配' : map ? '选择音频和目标后显示' : '扫描后分配' },
        ]} />
        {!map && <Paragraph type="secondary">首次写入会先扫描内存（约 {env?.mock ? 3 : 20} 秒，实际以进度为准）</Paragraph>}

        <Paragraph><Button type="link" style={{ padding: 0 }} onClick={() => navigate?.('memory')}>查看内存诊断</Button></Paragraph>
        {map && <Paragraph type="secondary">地址为当前计划，写入前会重新读取声表并检查目标字节。</Paragraph>}
        </details>
        {plan && !plan.ok && !plan.needsScan && <Alert type="error" showIcon title={plan.error} className="page-notice" />}
        {estimatedSeconds > 120 && <Alert id="timeWarning" className="page-notice" type="warning" showIcon title="预计操作超过 2 分钟" description="若相机开启了定时「自动休眠」，进入睡眠会断开 USB 连接（仅屏幕黑屏不会断联）。请提前关闭自动休眠或轻点相机触摸屏保持唤醒，并保持 USB 与电源连接。" />}
        <Button id="applyAudio" type="primary" size="large" block icon={<CloudUploadOutlined />} disabled={disabled || firmwareBlocked || !ready || !audio || !selected.length} loading={action === 'apply'} onClick={() => perform('apply')}>写入所选音效（{selected.length} 项）</Button>
        <Paragraph type="secondary" style={{ margin: '12px 0 0' }}>{action ? '操作中，请保持连接' : device.checking ? '正在检查相机连接' : !ready ? '连接相机后即可写入' : !audio ? '选择音频，开始准备' : !selected.length ? '请在音效表中选择目标' : '准备就绪，写入后需热重启'}</Paragraph>
      </Card>
    </div>
    {(action || device.busy?.tool === 'memory') && <Card id="operationProgress" title={scanning ? '正在扫描内存（只读）' : action === 'apply' ? '正在写入相机' : '正在恢复原厂音效'} role="status">
      {action === 'restore' && !env?.mock ? <Space><Spin size="small" /><Text>正在恢复并校验原厂音效表…</Text></Space>
        : <Progress percent={percent} status="active" strokeColor={token.colorPrimary} />}
      <Paragraph type="secondary">{scanning ? '首次分配或手动重新扫描 · ' : ''}{progress?.index != null ? `第 ${progress.position} / ${progress.count} 项 · #${progress.index} · ` : ''}{progress ? `${Math.min(progress.done, progress.total).toLocaleString()} / ${progress.total.toLocaleString()} ${scanning ? 'KiB' : action === 'apply' ? '采样' : '恢复单元'}${percent === 100 ? ' · 正在校验，尚未完成' : ''}` : action === 'apply' ? '准备传输 PCM 数据…' : '等待后端校验…'}</Paragraph>
      {progress?.overallTotal > 0 && <><Text>总体进度</Text><Progress id="overallProgress" percent={Math.min(100, Math.round(progress.overallDone / progress.overallTotal * 100))} status="active" /></>}
      <Alert type="info" showIcon title="请保持 USB 与电源连接，等待校验完成。" />
    </Card>}
    <div ref={resultCard}>{result && (result.ok ? <Card id="operationResult" role="status">
      <Result status="info" icon={<CheckCircleOutlined style={{ color: token.colorPrimary }} />} title={result.title} subTitle={result.text}
        extra={<Button onClick={() => setResult(null)}>收起结果</Button>} />
      <Alert showIcon type="info" icon={<PoweroffOutlined />} title="用电源键关机再开机，不要拔电池" description="电源键热重启后生效；拔电池会清除自定义音效。" />
    </Card> : <Alert id="operationResult" showIcon type="error" title={result.title} description={<span className="break-text">{result.text}</span>}
      action={result.rescan ? <Button disabled={disabled || !ready} onClick={rescanMemory}>重新扫描内存</Button> : null} closable={{ onClose: () => setResult(null) }} />)}
    {result && !result.ok && result.changed && <Alert showIcon type="info" title="用电源键关机再开机，不要拔电池" description="操作可能已部分完成，请热重启后检查；拔电池会清除全部替换。" />}
    </div>

    <div className="sound-table-section" ref={tableCard}>
      <SoundTable device={device} disabled={disabled} writeBlocked={firmwareBlocked} selected={selected} onSelect={setSelected}
        onReplace={index => { setSelected([index]); setResult(null); actionCard.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}
        onRestore={confirmRestore} />
    </div>
    <details className="sound-notes"><summary>写入与恢复说明</summary><Paragraph>音效保存在相机 RAM 中。电源键重启后保留，拔电池或恢复出厂后失效。</Paragraph><Text type="secondary">写入期间请保持 USB 与电源连接，并建议关闭机身「自动休眠」（进入睡眠会断联，单纯黑屏不影响）。批量写入会先分配空间，再逐项写入 PCM 与尾部静音保护区并校验。完成后用电源键热重启，再触发对应动作试听。</Text></details>
  </div>;
}
