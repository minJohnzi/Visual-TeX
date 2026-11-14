import React, { useMemo, useState } from 'react';
import { FileText, History, Plus, Star, Trash2, X } from 'lucide-react';
import { renderSymbolPreviewHtml } from '../../core/latex/katexCompiler';
import { useI18n } from '../../i18n/context';
import { useAppStore } from '../../store/useAppStore';

export const HistoryModal: React.FC = () => {
  const { t } = useI18n();
  const isOpen = useAppStore((s) => s.modals.history);
  const savedHistory = useAppStore((s) => s.savedHistory);
  const favorites = useAppStore((s) => s.favorites);
  const historyNotes = useAppStore((s) => s.historyNotes);
  const getActiveMathLatex = useAppStore((s) => s.getActiveMathLatex);
  const saveToHistoryList = useAppStore((s) => s.saveToHistoryList);
  const removeFromHistoryList = useAppStore((s) => s.removeFromHistoryList);
  const clearSavedHistory = useAppStore((s) => s.clearSavedHistory);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const setHistoryNote = useAppStore((s) => s.setHistoryNote);
  const applyFormulaPreset = useAppStore((s) => s.applyFormulaPreset);
  const setModalOpen = useAppStore((s) => s.setModalOpen);
  const pushToast = useAppStore((s) => s.pushToast);

  const [filter, setFilter] = useState<'all' | 'starred'>('all');
  const [editingLatex, setEditingLatex] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const filteredItems = useMemo(() => {
    if (filter === 'all') return savedHistory;
    const favSet = new Set(favorites);
    return savedHistory.filter((item) => favSet.has(item));
  }, [filter, savedHistory, favorites]);

  const hasClearableItems = useMemo(() => {
    const favSet = new Set(favorites);
    return savedHistory.some((item) => !favSet.has(item));
  }, [savedHistory, favorites]);

  if (!isOpen) return null;

  const activeLatex = getActiveMathLatex();

  const beginEditNote = (item: string) => {
    setEditingLatex(item);
    setNoteDraft(historyNotes[item] ?? '');
  };

  const handleSaveNote = (item: string) => {
    setHistoryNote(item, noteDraft);
    setEditingLatex(null);
    setNoteDraft('');
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.historyModalTitle}>
      <div className="modal-card">
        <div className="modal-header">
          <h3 className="modal-title">
            <History size={18} />
            <span>{t.historyModalTitle}</span>
          </h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setModalOpen('history', false)}
            aria-label={t.closeModal}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {savedHistory.length > 0 && (
            <div className="modal-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'all'}
                className={`export-tab ${filter === 'all' ? 'is-active' : ''}`}
                onClick={() => setFilter('all')}
              >
                {t.allHistory} ({savedHistory.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'starred'}
                className={`export-tab ${filter === 'starred' ? 'is-active' : ''}`}
                onClick={() => setFilter('starred')}
              >
                {t.starredOnly} (
                {savedHistory.filter((item) => favorites.includes(item)).length})
              </button>
            </div>
          )}

          {filteredItems.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.86rem' }}>
              {filter === 'starred' && savedHistory.length > 0
                ? t.favoritesEmpty
                : t.historyEmpty}
            </p>
          ) : (
            <div className="history-list">
              {filteredItems.map((item) => {
                const starred = favorites.includes(item);
                const note = historyNotes[item];
                const isEditing = editingLatex === item;
                return (
                  <div key={item} className="history-item-wrap">
                    <div className="history-item">
                      <div
                        className="history-item-content"
                        onClick={() => {
                          applyFormulaPreset(item);
                          setModalOpen('history', false);
                        }}
                      >
                        {note && <div className="history-note-badge">{note}</div>}
                        <div
                          dangerouslySetInnerHTML={{
                            __html: renderSymbolPreviewHtml(item),
                          }}
                        />
                        <div className="history-item-latex">{item}</div>
                      </div>

                      <div className="history-item-actions">
                        <button
                          type="button"
                          className={`block-action-btn ${starred ? 'is-starred' : ''}`}
                          onClick={() => {
                            const added = toggleFavorite(item);
                            pushToast(
                              added ? t.toastFavoriteAdded : t.toastFavoriteRemoved,
                              'info'
                            );
                          }}
                          aria-label={starred ? t.unfavoriteCurrent : t.favoriteCurrent}
                          title={starred ? t.unfavoriteCurrent : t.favoriteCurrent}
                        >
                          <Star size={14} fill={starred ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          type="button"
                          className="block-action-btn"
                          onClick={() => beginEditNote(item)}
                          aria-label={note ? t.editNote : t.addNote}
                          title={note ? t.editNote : t.addNote}
                        >
                          <FileText size={14} />
                        </button>
                        <button
                          type="button"
                          className="block-action-btn is-danger"
                          onClick={() => removeFromHistoryList(item)}
                          aria-label={t.deleteItem}
                          title={t.deleteItem}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="history-note-editor">
                        <input
                          type="text"
                          className="history-note-input"
                          value={noteDraft}
                          placeholder={t.notePlaceholder}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveNote(item);
                            } else if (e.key === 'Escape') {
                              setEditingLatex(null);
                            }
                          }}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleSaveNote(item)}
                        >
                          {t.saveNote}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setEditingLatex(null)}
                        >
                          {t.cancelNote}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {hasClearableItems && (
            <button type="button" className="btn btn-sm" onClick={clearSavedHistory}>
              <Trash2 size={14} />
              <span>{t.clearHistory}</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={activeLatex.trim().length < 3}
            onClick={() => {
              saveToHistoryList(activeLatex);
              pushToast(t.toastSavedToHistory, 'success');
            }}
          >
            <Plus size={14} />
            <span>{t.saveCurrentToHistory}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
