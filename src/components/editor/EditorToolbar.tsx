import React, { useMemo, useState } from 'react';
import {
  ArrowRightToLine,
  Check,
  Copy,
  CornerDownLeft,
  GitCommitHorizontal,
  History,
  Languages,
  Redo2,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Undo2,
  Wand2,
} from 'lucide-react';
import { commandBus } from '../../commands/commandBus';
import { copyTextToClipboard } from '../../core/export/clipboard';
import { encodeFormulaToUrlHash } from '../../core/export/urlShare';
import { parseMatrix } from '../../core/latex/matrix';
import { wrapWithDelimiter } from '../../core/latex/protocol';
import { useI18n } from '../../i18n/context';
import { useAppStore } from '../../store/useAppStore';

export const EditorToolbar: React.FC = () => {
  const { t } = useI18n();
  const [showMoreTools, setShowMoreTools] = useState(false);
  const editorMode = useAppStore((s) => s.editorMode);
  const docMode = useAppStore((s) => s.docMode);
  const documentModel = useAppStore((s) => s.document);
  const activeBlockId = useAppStore((s) => s.activeBlockId);
  const delimiterMode = useAppStore((s) => s.delimiterMode);
  const historyIndex = useAppStore((s) => s.historyIndex);
  const historyLen = useAppStore((s) => s.historyStack.length);
  const favorites = useAppStore((s) => s.favorites);
  const setActiveMathLatex = useAppStore((s) => s.setActiveMathLatex);
  const saveToHistoryList = useAppStore((s) => s.saveToHistoryList);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const pushToast = useAppStore((s) => s.pushToast);

  const activeLatex = useMemo(() => {
    if (docMode === 'single') return documentModel.singleLatex;
    const found = documentModel.blocks.find((b) => b.id === activeBlockId);
    if (found && found.type === 'math') return found.latex;
    const firstMath = documentModel.blocks.find((b) => b.type === 'math');
    return firstMath && firstMath.type === 'math' ? firstMath.latex : '';
  }, [docMode, documentModel, activeBlockId]);

  const insideMatrix = useMemo(() => Boolean(parseMatrix(activeLatex)), [activeLatex]);
  const isStarred = useMemo(
    () => activeLatex.trim().length > 0 && favorites.includes(activeLatex.trim()),
    [favorites, activeLatex]
  );

  const handleCopyLatex = async () => {
    const formatted = wrapWithDelimiter(activeLatex, delimiterMode);
    const ok = await copyTextToClipboard(formatted);
    pushToast(ok ? t.toastLatexCopied : t.toastActionFailed, ok ? 'success' : 'error');
  };

  const handleSaveHistory = () => {
    if (activeLatex.trim().length < 3) return;
    saveToHistoryList(activeLatex);
    pushToast(t.toastSavedToHistory, 'success');
  };

  const handleToggleFavorite = () => {
    if (!activeLatex.trim()) return;
    const added = toggleFavorite(activeLatex);
    pushToast(added ? t.toastFavoriteAdded : t.toastFavoriteRemoved, 'info');
  };

  const handleShareLink = async () => {
    const url = encodeFormulaToUrlHash(
      {
        mode: docMode,
        singleLatex: documentModel.singleLatex,
        blocks: documentModel.blocks,
        delimiterMode,
      },
      window.location.href
    );
    const ok = await copyTextToClipboard(url);
    pushToast(ok ? t.toastShareLinkCopied : t.toastActionFailed, ok ? 'success' : 'error');
  };

  const handleFormat = () => {
    commandBus.dispatch({ type: 'format-source' });
    pushToast(t.toastFormatted, 'info');
  };

  const handleAutoFix = () => {
    const changed = commandBus.dispatch({ type: 'auto-fix' });
    pushToast(changed ? t.toastAutoFixed : t.toastNoFixNeeded, changed ? 'success' : 'info');
  };

  const handleNormalizePunctuation = () => {
    const changed = commandBus.dispatch({ type: 'normalize-punctuation' });
    pushToast(
      changed ? t.toastNormalizedPunctuation : t.toastNoFixNeeded,
      changed ? 'success' : 'info'
    );
  };

  const handleDeriveNextStep = () => {
    if (commandBus.dispatch({ type: 'derive-next-step' })) {
      pushToast(t.toastDerivedStep, 'info');
    }
  };

  const handleClear = () => {
    setActiveMathLatex('', 'command');
    pushToast(t.toastCleared, 'info');
  };

  return (
    <div className="editor-toolbar" role="toolbar" aria-label={t.editorTitle}>
      <div className="toolbar-group">
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => commandBus.dispatch({ type: 'undo' })}
          disabled={historyIndex <= 0}
          title={t.undo}
          aria-label={t.undo}
        >
          <Undo2 size={14} />
          <span>{t.undo}</span>
        </button>
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => commandBus.dispatch({ type: 'redo' })}
          disabled={historyIndex >= historyLen - 1}
          title={t.redo}
          aria-label={t.redo}
        >
          <Redo2 size={14} />
          <span>{t.redo}</span>
        </button>

        <span className="toolbar-divider" aria-hidden="true" />

        <button
          type="button"
          className="toolbar-btn"
          onClick={() => commandBus.dispatch({ type: 'insert-newline' })}
          title={t.insertNewline}
        >
          <CornerDownLeft size={14} />
          <span>{t.insertNewline}</span>
        </button>
        <button
          type="button"
          className="toolbar-btn toolbar-btn-mono"
          onClick={handleDeriveNextStep}
          title={t.deriveNextStep}
          aria-label={t.deriveNextStep}
        >
          <GitCommitHorizontal size={14} />
          <span>\\ &amp;=</span>
        </button>
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => commandBus.dispatch({ type: 'jump-placeholder', direction: 'next' })}
          title={t.jumpPlaceholder}
        >
          <ArrowRightToLine size={14} />
          <span>{t.jumpPlaceholder}</span>
        </button>

        {editorMode !== 'source' && (
          <button
            type="button"
            className={`toolbar-btn is-more-toggle ${showMoreTools ? 'is-active' : ''}`}
            onClick={() => setShowMoreTools((prev) => !prev)}
            aria-expanded={showMoreTools}
            title={showMoreTools ? t.lessToolsBtn : t.moreToolsBtn}
          >
            <SlidersHorizontal size={13} />
            <span>{showMoreTools ? t.lessToolsBtn : t.moreToolsBtn}</span>
          </button>
        )}

        {(showMoreTools || editorMode === 'source') && (
          <>
            <span className="toolbar-divider" aria-hidden="true" />

            <button
              type="button"
              className="toolbar-btn toolbar-btn-mono"
              onClick={() => commandBus.dispatch({ type: 'insert-format-macro', macro: 'text' })}
            >
              {t.formatText}
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-btn-mono"
              onClick={() => commandBus.dispatch({ type: 'insert-format-macro', macro: 'mathrm' })}
            >
              {t.formatMathrm}
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-btn-mono"
              onClick={() => commandBus.dispatch({ type: 'insert-format-macro', macro: 'operatorname' })}
            >
              {t.formatOperatorname}
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => commandBus.dispatch({ type: 'insert-format-macro', macro: 'thinspace' })}
            >
              {t.formatThinspace}
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => commandBus.dispatch({ type: 'insert-format-macro', macro: 'cdot' })}
            >
              {t.formatCdot}
            </button>

            <span className="toolbar-divider" aria-hidden="true" />

            <button type="button" className="toolbar-btn" onClick={handleFormat} title={t.formatSource}>
              <Sparkles size={14} />
              <span>{t.formatSource}</span>
            </button>
            <button type="button" className="toolbar-btn" onClick={handleAutoFix} title={t.autoFix}>
              <Wand2 size={14} />
              <span>{t.autoFix}</span>
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={handleNormalizePunctuation}
              title={t.normalizePunctuation}
            >
              <Languages size={14} />
              <span>{t.normalizePunctuation}</span>
            </button>
          </>
        )}
      </div>

      <div className="toolbar-group">
        {insideMatrix && (
          <div className="matrix-context-bar" aria-label={t.matrixContext}>
            <span className="matrix-context-label">{t.matrixContext}:</span>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => commandBus.dispatch({ type: 'matrix-edit', op: 'append-row' })}
            >
              {t.appendRow}
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => commandBus.dispatch({ type: 'matrix-edit', op: 'append-col' })}
            >
              {t.appendCol}
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => commandBus.dispatch({ type: 'matrix-edit', op: 'delete-row' })}
            >
              {t.deleteRow}
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => commandBus.dispatch({ type: 'matrix-edit', op: 'delete-col' })}
            >
              {t.deleteCol}
            </button>
          </div>
        )}

        <button
          type="button"
          className={`toolbar-btn ${isStarred ? 'is-starred' : ''}`}
          onClick={handleToggleFavorite}
          disabled={!activeLatex.trim()}
          title={isStarred ? t.unfavoriteCurrent : t.favoriteCurrent}
          aria-label={isStarred ? t.unfavoriteCurrent : t.favoriteCurrent}
        >
          <Star size={14} fill={isStarred ? 'currentColor' : 'none'} />
        </button>

        <button
          type="button"
          className="toolbar-btn"
          onClick={handleSaveHistory}
          disabled={activeLatex.trim().length < 3}
          title={t.saveCurrentToHistory}
          aria-label={t.saveCurrentToHistory}
        >
          <History size={14} />
          <Check size={12} />
        </button>

        <button
          type="button"
          className="toolbar-btn"
          onClick={handleShareLink}
          title={t.shareLink}
          aria-label={t.shareLink}
        >
          <Share2 size={14} />
          <span>{t.shareLink}</span>
        </button>

        <button
          type="button"
          className="toolbar-btn"
          onClick={handleClear}
          disabled={activeLatex.length === 0}
          title={t.clearFormula}
          aria-label={t.clearFormula}
        >
          <Trash2 size={14} />
          <span>{t.clearFormula}</span>
        </button>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleCopyLatex}
          disabled={!activeLatex.trim()}
        >
          <Copy size={13} />
          <span>{t.copyLatex}</span>
        </button>
      </div>
    </div>
  );
};
