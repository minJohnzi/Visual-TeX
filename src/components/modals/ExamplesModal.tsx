import React, { useState } from 'react';
import { BookOpen, Star, X } from 'lucide-react';
import { renderSymbolPreviewHtml } from '../../core/latex/katexCompiler';
import { CLASSIC_FORMULAS } from '../../data/symbols';
import { useI18n } from '../../i18n/context';
import { useAppStore } from '../../store/useAppStore';

export const ExamplesModal: React.FC = () => {
  const { t } = useI18n();
  const isOpen = useAppStore((s) => s.modals.examples);
  const favorites = useAppStore((s) => s.favorites);
  const historyNotes = useAppStore((s) => s.historyNotes);
  const setModalOpen = useAppStore((s) => s.setModalOpen);
  const applyFormulaPreset = useAppStore((s) => s.applyFormulaPreset);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const pushToast = useAppStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<'classic' | 'favorites'>('classic');

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.examplesModalTitle}>
      <div className="modal-card modal-card-lg">
        <div className="modal-header">
          <h3 className="modal-title">
            <BookOpen size={18} />
            <span>{t.examplesModalTitle}</span>
          </h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setModalOpen('examples', false)}
            aria-label={t.closeModal}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'classic'}
              className={`export-tab ${activeTab === 'classic' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('classic')}
            >
              {t.tabClassic} ({CLASSIC_FORMULAS.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'favorites'}
              className={`export-tab ${activeTab === 'favorites' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('favorites')}
            >
              {t.tabFavorites} ({favorites.length})
            </button>
          </div>

          {activeTab === 'classic' ? (
            <div className="examples-grid">
              {CLASSIC_FORMULAS.map((item) => {
                const starred = favorites.includes(item.latex.trim());
                return (
                  <div key={item.id} className="example-card">
                    <button
                      type="button"
                      className="example-card-main"
                      onClick={() => {
                        applyFormulaPreset(item.latex);
                        setModalOpen('examples', false);
                      }}
                    >
                      <div className="example-card-meta">
                        <span className="example-card-title">{t.examples[item.nameKey]}</span>
                        <span className="example-card-cat">{t.examples[item.categoryKey]}</span>
                      </div>
                      <div
                        className="example-card-preview"
                        dangerouslySetInnerHTML={{
                          __html: renderSymbolPreviewHtml(item.latex),
                        }}
                      />
                    </button>
                    <button
                      type="button"
                      className={`example-star-btn ${starred ? 'is-starred' : ''}`}
                      aria-label={starred ? t.unfavoriteCurrent : t.favoriteCurrent}
                      title={starred ? t.unfavoriteCurrent : t.favoriteCurrent}
                      onClick={() => {
                        const added = toggleFavorite(item.latex);
                        pushToast(
                          added ? t.toastFavoriteAdded : t.toastFavoriteRemoved,
                          'info'
                        );
                      }}
                    >
                      <Star size={14} fill={starred ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : favorites.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.86rem' }}>
              {t.favoritesEmpty}
            </p>
          ) : (
            <div className="examples-grid">
              {favorites.map((favLatex, index) => {
                const note = historyNotes[favLatex];
                return (
                  <div key={`${favLatex}-${index}`} className="example-card">
                    <button
                      type="button"
                      className="example-card-main"
                      onClick={() => {
                        applyFormulaPreset(favLatex);
                        setModalOpen('examples', false);
                      }}
                    >
                      <div className="example-card-meta">
                        <span className="example-card-title">
                          {note || favLatex.slice(0, 28)}
                        </span>
                        <span className="example-card-cat">★</span>
                      </div>
                      <div
                        className="example-card-preview"
                        dangerouslySetInnerHTML={{
                          __html: renderSymbolPreviewHtml(favLatex),
                        }}
                      />
                    </button>
                    <button
                      type="button"
                      className="example-star-btn is-starred"
                      aria-label={t.unfavoriteCurrent}
                      title={t.unfavoriteCurrent}
                      onClick={() => {
                        toggleFavorite(favLatex);
                        pushToast(t.toastFavoriteRemoved, 'info');
                      }}
                    >
                      <Star size={14} fill="currentColor" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
