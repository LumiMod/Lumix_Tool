import { useState } from 'react';
import { Alert, App, Button, Card, Flex, Input, Segmented, Space, Table, Tag, Typography } from 'antd';
import { EditOutlined, UndoOutlined } from '@ant-design/icons';
import { catalog, COMMON_PRESETS, orderedCatalog, soundName } from './catalog';
import { originalSamples, slotState } from './state.mjs';

function sameSelection(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export default function SoundTable({ device, disabled, writeBlocked = false, selected, onSelect, onReplace, onRestore }) {
  const { modal, message } = App.useApp();
  const [renaming, setRenaming] = useState(false);
  const [viewMode, setViewMode] = useState('common'); // 'common' | 'all'
  const table = device.device.soundTable;
  const originals = table?.originals || {};
  const labels = table?.labels || {};
  const entries = new Map((table?.entries || []).map(entry => [entry.index, entry]));
  const visibleCatalog = viewMode === 'common' ? orderedCatalog.filter(entry => entry.common) : orderedCatalog;
  const rows = visibleCatalog.map(entry => ({ ...entry, ...entries.get(entry.index) }));
  const sortedSelected = [...selected].sort((a, b) => a - b);

  function rename(index) {
    let label = labels[index] || '';
    modal.confirm({
      title: `为 #${index} 命名`, okText: '保存名称', cancelText: '取消',
      content: <Space orientation="vertical" className="full-width">
        <Typography.Text type="secondary">自定义备注名称；留空可恢复默认名称。</Typography.Text>
        <Input id="soundLabel" aria-label="音效名称" autoFocus maxLength={80} defaultValue={label} placeholder={catalog[index].name} onChange={event => { label = event.target.value; }} />
      </Space>,
      onOk: async () => {
        setRenaming(true);
        try {
          const result = await device.api.renameSound(table.version, index, label);
          if (!result.ok) throw new Error(result.error);
          await device.refreshDevice();
        } catch (error) { message.error(error.message || String(error)); throw error; }
        finally { setRenaming(false); }
      },
    });
  }

  return <Card title="相机音效 · 28 项" extra={<Space size="small">
    <Segmented size="small" value={viewMode} onChange={setViewMode} options={[
      { label: `常用 (${orderedCatalog.filter(e => e.common).length})`, value: 'common' },
      { label: '全部 28 项', value: 'all' },
    ]} />
    <Button id="restoreAll" icon={<UndoOutlined />} disabled={disabled || writeBlocked || renaming || !device.ready || !Object.keys(originals).length} onClick={() => onRestore(null)}>全部恢复</Button>
  </Space>}>
    <Space orientation="vertical" size="middle" className="full-width">
      <Flex wrap="wrap" gap={8} align="center">
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>快捷选择：</Typography.Text>
        {COMMON_PRESETS.map(preset => {
          const active = sameSelection(sortedSelected, [...preset.indices].sort((a, b) => a - b));
          return <Button
            key={preset.id}
            size="small"
            type={active ? 'primary' : 'default'}
            disabled={disabled || renaming}
            onClick={() => onSelect([...preset.indices])}
          >
            {preset.shortLabel}
          </Button>;
        })}
        {selected.length > 0 && <Button size="small" type="text" disabled={disabled || renaming} onClick={() => onSelect([])}>清空</Button>}
      </Flex>
      <Typography.Text type="secondary">常用音效已置顶，勾选多项可批量写入同一段声音。电子快门音（#20–22 / #11–13）需在相机中切至电子快门并开启音量。</Typography.Text>
      {table && !table.ok && <Alert type="error" showIcon title={table.error} />}
      <Table id="soundTable" size="small" rowKey="index" dataSource={rows} pagination={false} scroll={{ y: 420 }}
        onRow={record => ({ 'data-slot': record.index })}
        rowSelection={{ selectedRowKeys: selected, onChange: onSelect, getCheckboxProps: record => ({ disabled: disabled || renaming, 'aria-label': `选择音效 #${record.index}` }) }}
        columns={[
          { title: '编号', dataIndex: 'index', width: 65, render: index => `#${index}` },
          { title: '名称 / 动作', key: 'name', render: (_, row) => <div>
            <Space size={6} wrap>
              <Typography.Text strong={row.common}>{soundName(row.index, labels)}</Typography.Text>
              {row.common && <Tag color="blue" style={{ marginInlineEnd: 0 }}>常用</Tag>}
              <Button size="small" type="text" data-action="rename" aria-label={`重命名 #${row.index}`} icon={<EditOutlined />} disabled={disabled || renaming || !device.ready} onClick={() => rename(row.index)} />
            </Space>
            {row.note && <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.note}</Typography.Text></div>}
            {row.hex && !originals[row.index] && <div><Typography.Text type="warning">无法单独恢复（拔电池可恢复）</Typography.Text></div>}
          </div> },
          { title: '原始时长', key: 'duration', width: 100, render: (_, row) => {
            const samples = originalSamples(originals[row.index]);
            return samples == null ? '—' : `${(samples / 44100).toFixed(2)} 秒`;
          } },
          { title: '当前状态', key: 'state', width: 95, render: (_, row) => {
            const state = slotState(row, originals[row.index]);
            return <Tag color={state === '已替换' ? 'blue' : state === '未知' ? 'default' : 'green'}>{state}</Tag>;
          } },
          { title: '操作', key: 'actions', width: 140, render: (_, row) => <Space size="small">
            <Button size="small" data-action="replace" disabled={disabled || renaming || !device.ready} onClick={() => onReplace(row.index)}>替换</Button>
            <Button size="small" data-action="restore" disabled={disabled || writeBlocked || renaming || !device.ready || !originals[row.index]} onClick={() => onRestore(row.index)}>恢复</Button>
          </Space> },
        ]} />
      <Typography.Text>已选 {selected.length} 项{selected.length > 0 ? `：${selected.map(index => `#${index}`).join('、')}` : '，请勾选要替换的音效'}</Typography.Text>
    </Space>
  </Card>;
}
