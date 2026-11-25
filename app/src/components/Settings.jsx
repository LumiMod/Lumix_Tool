import { useState } from 'react';
import { Alert, Button, Card, Descriptions, Flex, Input, Segmented, Space, Tag, Typography } from 'antd';
import { CloudSyncOutlined, FolderOpenOutlined, GithubOutlined, GlobalOutlined, StarOutlined } from '@ant-design/icons';
import { LANGUAGES, useI18n } from '../i18n';

export default function Settings({ device }) {
  const { lang, setLang, t } = useI18n();
  const [feedback, setFeedback] = useState(null);
  const [starError, setStarError] = useState('');
  const { env, locked } = device;
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.3.2';

  async function choosePython() {
    const result = await device.pickPython();
    if (result) setFeedback(result);
  }
  async function openGithub() {
    setStarError('');
    try {
      const result = await device.api?.openGithub?.();
      if (result && result.ok === false) setStarError(result.error || t('support.error'));
    } catch (error) {
      setStarError(error.message || String(error));
    }
  }
  return <Space orientation="vertical" size="large" className="full-width">
    <div><Typography.Title level={2}>{t('settings.title')}</Typography.Title><Typography.Text type="secondary">{t('settings.subtitle')}</Typography.Text></div>

    <Card title={t('settings.langTitle')} extra={<GlobalOutlined />}>
      <Space orientation="vertical" size="middle" className="full-width">
        <Typography.Text type="secondary">{t('settings.langDesc')}</Typography.Text>
        <div>
          <Segmented
            id="settingsLang"
            value={lang}
            onChange={setLang}
            options={LANGUAGES.map(item => ({ label: item.label, value: item.code }))}
          />
        </div>
      </Space>
    </Card>

    <Card title={t('settings.otaTitle')} extra={<Tag color="default">{t('settings.otaTag')}</Tag>}>
      <Space orientation="vertical" size="middle" className="full-width">
        <Typography.Text type="secondary">{t('settings.otaDesc', { version: appVersion })}</Typography.Text>
        <div>
          <Button id="btnCheckOta" icon={<CloudSyncOutlined />} disabled>{t('settings.otaBtn')}</Button>
        </div>
      </Space>
    </Card>

    <Card title={t('support.title')} extra={<Tag icon={<StarOutlined />} color="gold">GitHub Star</Tag>}>
      <Space orientation="vertical" size="middle" className="full-width">
        <Typography.Text type="secondary">{t('support.desc')}</Typography.Text>
        <div>
          <Button id="btnSettingsStar" type="primary" icon={<GithubOutlined />} onClick={openGithub}>{t('support.btn')}</Button>
        </div>
        {starError && <Alert showIcon type="error" title={starError} />}
      </Space>
    </Card>

    <Card title={t('settings.aboutTitle')} extra={<Tag>v{appVersion}</Tag>}>
      <Descriptions column={1} items={[
        { key: 'version', label: t('settings.versionLabel'), children: `v${appVersion}` },
        { key: 'camera', label: t('settings.supportCamera'), children: t('settings.supportCameraVal') },
        { key: 'mode', label: t('settings.runMode'), children: env?.mock ? t('settings.runModeMock') : t('settings.runModeLocal') },
        { key: 'platform', label: t('settings.platform'), children: 'Windows · WinUSB' },
        { key: 'theme', label: t('settings.theme'), children: t('settings.themeVal') },
        { key: 'data', label: t('settings.dataDir'), children: <Typography.Text className="break-text">{env?.userData || '…'}</Typography.Text> },
      ]} />
    </Card>

    <Card title={t('settings.pythonTitle')} extra={<Tag color={env?.python ? 'blue' : 'default'}>{env?.mock ? t('settings.pythonMock') : env?.python ? t('settings.pythonOk') : t('settings.pythonUnset')}</Tag>}>
      <Space orientation="vertical" size="middle" className="full-width">
        <Typography.Text type="secondary">{t('settings.pythonDesc')}</Typography.Text>
        <label htmlFor="pythonPath">{t('settings.pythonPath')}</label>
        <Flex gap="small"><Input id="pythonPath" readOnly value={env?.python || t('settings.pythonNotFound')} />
          <Button id="pickPython" icon={<FolderOpenOutlined />} disabled={locked || env?.mock} loading={device.configuring && !env?.mock} onClick={choosePython}>{t('settings.pythonPick')}</Button></Flex>
        <Typography.Text type="secondary">{t('settings.pythonHint')}</Typography.Text>
        {feedback && <Alert id="settingsFeedback" showIcon type={feedback.ok ? 'info' : 'error'} title={feedback.ok ? t('settings.pythonSaved') : feedback.error} />}
      </Space>
    </Card>
  </Space>;
}
