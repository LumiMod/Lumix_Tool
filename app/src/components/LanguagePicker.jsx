import { GlobalOutlined } from '@ant-design/icons';
import { LANGUAGES, useI18n } from '../i18n';

export default function LanguagePicker() {
  const { needsLanguageChoice, setLang } = useI18n();
  if (!needsLanguageChoice) return null;

  return <div className="lang-overlay" role="dialog" aria-modal="true" aria-labelledby="langPickerTitle">
    <div className="lang-dialog">
      <div className="lang-dialog__icon" aria-hidden="true"><GlobalOutlined /></div>
      <h2 id="langPickerTitle">选择语言 / Language / 言語</h2>
      <p>可在设置中随时更改 · Change anytime in Settings · 設定から変更可能</p>
      <div className="lang-dialog__list">
        {LANGUAGES.map(item => (
          <button
            key={item.code}
            type="button"
            data-lang={item.code}
            className="lang-choice-btn"
            onClick={() => setLang(item.code)}
          >
            <strong>{item.label}</strong>
            <span>{item.code.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  </div>;
}
