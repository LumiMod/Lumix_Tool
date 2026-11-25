import { useState } from 'react';
import { Alert, App, Button, Card, Flex, Input, Segmented, Space, Table, Tag, Typography } from 'antd';
import { EditOutlined, UndoOutlined } from '@ant-design/icons';
import { catalog, COMMON_PRESETS, localizePreset, orderedCatalog, soundName, soundNote } from './catalog';
import { originalSamples, slotState } from './state.mjs';
import { useI18n } from '../../i18n';

function sameSelection(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export default function SoundTable({ device, disabled, writeBlocked = false, selected, onSelect, onReplace, onRestore }) {
  const { lang, t } = useI18n();
  const { modal, message } = App.useApp();
  const [renaming, setRenaming] = useState(false);
  const [viewMode, setViewMode] = useState('common');
  const table = device.device.soundTable;
  const originals = table?.originals || {};
  const labels = table?.labels || {};
  const entries = new Map((table?.entries || []).map(entry => [entry.index, entry]));
  const commonCount = orderedCatalog.filter(e => e.common).length;
  const visibleCatalog = viewMode === 'common' ? orderedCatalog.filter(entry => entry.common) : orderedCatalog;
  const rows = visibleCatalog.map(entry => ({ ...entry, ...entries.get(entry.index) }));
  const sortedSelected = [...selected].sort((a, b) => a - b);

  function rename(index) {
    let label = labels[index] || '';
    modal.confirm({
      title: `#${index}`, okText: t('mobile.audio.save'), cancelText: t('mobile.audio.cancel'),
      content: <Space orientation="vertical" className="full-width">
        <Input id="soundLabel" aria-label="音效名称" autoFocus maxLength={80} defaultValue={label} placeholder={soundName(index, {}, lang)} onChange={event => { label = event.target.value; }} />
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

  return <Card title={t('sounds.tableTitle')} extra={<Space size="small">
    <Segmented size="small" value={viewMode} onChange={setViewMode} options={[
      { label: t('sounds.viewCommon', { count: commonCount }), value: 'common' },
      { label: t('sounds.viewAll'), value: 'all' },
    ]} />
    <Button id="restoreAll" icon={<UndoOutlined />} disabled={disabled || writeBlocked || renaming || !device.ready || !Object.keys(originals).length} onClick={() => onRestore(null)}>{t('sounds.restoreAll')}</Button>
  </Space>}>
    <Space orientation="vertical" size="middle" className="full-width">
      <Flex wrap="wrap" gap={8} align="center">
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>{t('sounds.quickPick')}</Typography.Text>
        {COMMON_PRESETS.map(rawPreset => {
          const preset = localizePreset(rawPreset, lang);
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
        {selected.length > 0 && <Button size="small" type="text" disabled={disabled || renaming} onClick={() => onSelect([])}>{t('mobile.audio.clear')}</Button>}
      </Flex>
      <Typography.Text type="secondary">{t('sounds.tip')}</Typography.Text>
      {table && !table.ok && <Alert type="error" showIcon title={table.error} />}
      <Table id="soundTable" size="small" rowKey="index" dataSource={rows} pagination={false} scroll={{ y: 420 }}
        onRow={record => ({ 'data-slot': record.index })}
        rowSelection={{ selectedRowKeys: selected, onChange: onSelect, getCheckboxProps: record => ({ disabled: disabled || renaming, 'aria-label': `#${record.index}` }) }}
        columns={[
          { title: t('sounds.colId'), dataIndex: 'index', width: 65, render: index => `#${index}` },
          { title: t('sounds.colName'), key: 'name', render: (_, row) => <div>
            <Space size={6} wrap>
              <Typography.Text strong={row.common}>{soundName(row.index, labels, lang)}</Typography.Text>
              {row.common && <Tag color="blue" style={{ marginInlineEnd: 0 }}>{t('sounds.commonTag')}</Tag>}
              <Button size="small" type="text" data-action="rename" aria-label={`#${row.index}`} icon={<EditOutlined />} disabled={disabled || renaming || !device.ready} onClick={() => rename(row.index)} />
            </Space>
            {soundNote(row.index, lang) && <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{soundNote(row.index, lang)}</Typography.Text></div>}
            {row.hex && !originals[row.index] && <div><Typography.Text type="warning">无法单独恢复（拔电池可恢复）</Typography.Text></div>}
          </div> },
          { title: t('sounds.colDur'), key: 'duration', width: 100, render: (_, row) => {
            const samples = originalSamples(originals[row.index]);
            return samples == null ? '—' : `${(samples / 44100).toFixed(2)}s`;
          } },
          { title: t('sounds.colState'), key: 'state', width: 95, render: (_, row) => {
            const state = slotState(row, originals[row.index]);
            return <Tag color={state === '已替换' ? 'blue' : state === '未知' ? 'default' : 'green'}>{state}</Tag>;
          } },
          { title: t('sounds.colAct'), key: 'actions', width: 140, render: (_, row) => <Space size="small">
            <Button size="small" data-action="replace" disabled={disabled || renaming || !device.ready} onClick={() => onReplace(row.index)}>{t('sounds.replace')}</Button>
            <Button size="small" data-action="restore" disabled={disabled || writeBlocked || renaming || !device.ready || !originals[row.index]} onClick={() => onRestore(row.index)}>{t('sounds.restore')}</Button>
          </Space> },
        ]} />
      <Typography.Text>{t('sounds.selectedSummary', { count: selected.length })}{selected.length > 0 ? `: ${selected.map(index => `#${index}`).join(', ')}` : t('sounds.selectedEmpty')}</Typography.Text>
    </Space>
  </Card>;
}
