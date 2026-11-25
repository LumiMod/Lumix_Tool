import { ExportOutlined, GithubOutlined, StarFilled } from '@ant-design/icons';
import { useI18n } from '../i18n';
import { settingsCopy } from './settingsCopy';
import './Settings.css';

export default function SupportCard({ id, onOpen, compact = false }) {
  const { lang, t } = useI18n();
  const copy = settingsCopy[lang];
  if (compact) {
    return <button id={id} type="button" className="project-star-link" title={copy.starHint} onClick={onOpen}>
      <StarFilled aria-hidden="true" />
      <span>{copy.star}</span>
      <ExportOutlined aria-hidden="true" />
    </button>;
  }
  return <button id={id} type="button" className="project-star-card" onClick={onOpen}>
    <span className="project-star-card__repo"><GithubOutlined /> USER-HFC / Lumix_Tool</span>
    <span className="project-star-card__title">{t('support.title')}</span>
    <span className="project-star-card__description">{copy.starHint}</span>
    <span className="project-star-card__action"><StarFilled aria-hidden="true" />{copy.star}<ExportOutlined aria-hidden="true" /></span>
  </button>;
}
