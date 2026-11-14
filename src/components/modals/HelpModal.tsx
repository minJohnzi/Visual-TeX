import React from 'react';
import { Keyboard, X } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { useAppStore } from '../../store/useAppStore';

export const HelpModal: React.FC = () => {
  const { t } = useI18n();
  const isOpen = useAppStore((s) => s.modals.help);
  const setModalOpen = useAppStore((s) => s.setModalOpen);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.helpModalTitle}>
      <div className="modal-card modal-card-lg">
        <div className="modal-header">
          <h3 className="modal-title">
            <Keyboard size={18} />
            <span>{t.helpModalTitle}</span>
          </h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setModalOpen('help', false)}
            aria-label={t.closeModal}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <h4 style={{ margin: '0 0 6px', fontSize: '0.88rem' }}>{t.helpShortcutsTitle}</h4>
          <div className="shortcuts-grid">
            {t.shortcuts.map((row) => (
              <div key={row.keys} className="shortcut-row">
                <kbd>{row.keys}</kbd>
                <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
                  {row.desc}
                </span>
              </div>
            ))}
          </div>

          <h4 style={{ margin: '10px 0 4px', fontSize: '0.88rem' }}>{t.helpTipsTitle}</h4>
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.65 }}>
            {t.tips.map((tip, idx) => (
              <li key={idx}>{tip}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
