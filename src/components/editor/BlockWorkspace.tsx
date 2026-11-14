import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Code2,
  Copy,
  Download,
  Eye,
  FileText,
  Layers,
  Plus,
  Sigma,
  Trash2,
  Upload,
} from 'lucide-react';
import { copyTextToClipboard } from '../../core/export/clipboard';
import { triggerTextDownload } from '../../core/export/domPng';
import { estimateFormulaLineCount, hasEnclosingEnvironment } from '../../core/latex/bridge';
import { renderSymbolPreviewHtml } from '../../core/latex/katexCompiler';
import { analyzeTopLevelMultiline } from '../../core/latex/scanner';
import {
  parseMarkdownToBlocks,
  serializeBlocksToMarkdown,
} from '../../core/markdown/mixedRenderer';
import { DelimiterMode } from '../../core/types';
import { useI18n } from '../../i18n/context';
import { createBlockId } from '../../store/persistence';
import { useAppStore } from '../../store/useAppStore';
import { EditorToolbar } from './EditorToolbar';
import { SourceEditor } from './SourceEditor';
import { VisualEditor } from './VisualEditor';

const DELIMITER_OPTIONS: Array<{
  mode: DelimiterMode;
  labelKey: 'delimiterNone' | 'delimiterInline' | 'delimiterDisplay' | 'delimiterEquation';
}> = [
  { mode: 'none', labelKey: 'delimiterNone' },
  { mode: 'inline', labelKey: 'delimiterInline' },
  { mode: 'display', labelKey: 'delimiterDisplay' },
  { mode: 'equation', labelKey: 'delimiterEquation' },
];

export const BlockWorkspace: React.FC = () => {
  const { t } = useI18n();
  const docMode = useAppStore((s) => s.docMode);
  const documentModel = useAppStore((s) => s.document);
  const activeBlockId = useAppStore((s) => s.activeBlockId);
  const editorMode = useAppStore((s) => s.editorMode);
  const delimiterMode = useAppStore((s) => s.delimiterMode);
  const recentVersions = useAppStore((s) => s.recentVersions);
  const compileResult = useAppStore((s) => s.compileResult);

  const setEditorMode = useAppStore((s) => s.setEditorMode);
  const setDocMode = useAppStore((s) => s.setDocMode);
  const setActiveBlockId = useAppStore((s) => s.setActiveBlockId);
  const setDelimiterMode = useAppStore((s) => s.setDelimiterMode);
  const setSingleLatex = useAppStore((s) => s.setSingleLatex);
  const updateBlockContent = useAppStore((s) => s.updateBlockContent);
  const addBlock = useAppStore((s) => s.addBlock);
  const deleteBlock = useAppStore((s) => s.deleteBlock);
  const moveBlock = useAppStore((s) => s.moveBlock);
  const restoreVersion = useAppStore((s) => s.restoreVersion);
  const importMarkdownBlocks = useAppStore((s) => s.importMarkdownBlocks);
  const pushToast = useAppStore((s) => s.pushToast);

  const [showMdImport, setShowMdImport] = useState(false);
  const [mdDraft, setMdDraft] = useState('');
  const mdFileInputRef = useRef<HTMLInputElement | null>(null);

  const activeLatex = useMemo(() => {
    if (docMode === 'single') return documentModel.singleLatex;
    const active = documentModel.blocks.find((b) => b.id === activeBlockId);
    if (active && active.type === 'math') return active.latex;
    const firstMath = documentModel.blocks.find((b) => b.type === 'math');
    return firstMath && firstMath.type === 'math' ? firstMath.latex : '';
  }, [docMode, documentModel, activeBlockId]);

  const statusInfo = useMemo(() => {
    if (compileResult.hasError) {
      return { kind: 'error' as const, label: t.statusError };
    }
    const analysis = analyzeTopLevelMultiline(activeLatex);
    if (analysis.isTopLevelMultiline && !hasEnclosingEnvironment(activeLatex)) {
      return { kind: 'aligned' as const, label: t.statusAutoAligned };
    }
    return { kind: 'ready' as const, label: t.statusReady };
  }, [compileResult.hasError, activeLatex, t.statusAutoAligned, t.statusError, t.statusReady]);

  const charCount = activeLatex.length;
  const lineCount = estimateFormulaLineCount(activeLatex);

  const handleSingleChange = (nextLatex: string) => {
    setSingleLatex(nextLatex, editorMode === 'visual' ? 'visual' : 'source');
  };

  const handleApplyMarkdownImport = () => {
    const parsed = parseMarkdownToBlocks(mdDraft, (index, type) =>
      `${createBlockId(type === 'text' ? 'txt' : 'math')}-${index}`
    );
    if (parsed.length === 0) return;
    importMarkdownBlocks(parsed, true);
    setMdDraft('');
    setShowMdImport(false);
    pushToast(t.toastMarkdownImported, 'success');
  };

  const handleUploadMarkdownFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      setMdDraft(content);
    } finally {
      e.target.value = '';
    }
  };

  const handleCopyMarkdown = async () => {
    const md = serializeBlocksToMarkdown(documentModel.blocks, delimiterMode);
    if (!md) return;
    const ok = await copyTextToClipboard(md);
    pushToast(ok ? t.toastMarkdownCopied : t.toastActionFailed, ok ? 'success' : 'error');
  };

  const handleExportMarkdown = () => {
    const md = serializeBlocksToMarkdown(documentModel.blocks, delimiterMode);
    if (!md) return;
    triggerTextDownload(md, 'visual-tex-notes.md', 'text/markdown;charset=utf-8');
    pushToast(t.toastMarkdownDownloaded, 'success');
  };

  return (
    <section className="editor-panel" aria-label={t.editorTitle}>
      <div className="panel-header">
        <div className="panel-title-group">
          <h2 className="panel-title">
            <Sigma size={16} />
            <span>{t.editorTitle}</span>
          </h2>

          <div className="mode-switch-group" role="tablist" aria-label="Editor Mode">
            <button
              type="button"
              role="tab"
              aria-selected={editorMode === 'visual'}
              className={`mode-tab ${editorMode === 'visual' ? 'is-active' : ''}`}
              onClick={() => setEditorMode('visual')}
            >
              <Eye size={13} />
              <span>{t.modeVisual}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={editorMode === 'source'}
              className={`mode-tab ${editorMode === 'source' ? 'is-active' : ''}`}
              onClick={() => setEditorMode('source')}
            >
              <Code2 size={13} />
              <span>{t.modeSource}</span>
            </button>
          </div>
        </div>

        <div className="doc-mode-switch-group" role="tablist" aria-label="Document Mode">
          <button
            type="button"
            role="tab"
            aria-selected={docMode === 'single'}
            className={`mode-tab ${docMode === 'single' ? 'is-active' : ''}`}
            onClick={() => setDocMode('single')}
          >
            <Sigma size={13} />
            <span>{t.docModeSingle}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={docMode === 'mixed'}
            className={`mode-tab ${docMode === 'mixed' ? 'is-active' : ''}`}
            onClick={() => setDocMode('mixed')}
          >
            <Layers size={13} />
            <span>{t.docModeMixed}</span>
          </button>
        </div>
      </div>

      <EditorToolbar />

      <div className="editor-surface-wrap">
        {docMode === 'single' ? (
          editorMode === 'visual' ? (
            <VisualEditor
              blockId="single"
              value={documentModel.singleLatex}
              onChange={handleSingleChange}
            />
          ) : (
            <SourceEditor
              blockId="single"
              value={documentModel.singleLatex}
              onChange={handleSingleChange}
            />
          )
        ) : (
          <div className="block-workspace">
            <div className="block-list">
              {documentModel.blocks.map((block, index) => {
                const isActive = block.id === activeBlockId;
                return (
                  <div
                    key={block.id}
                    className={`block-card ${isActive ? 'is-active' : ''}`}
                    data-block-id={block.id}
                  >
                    <div className="block-card-header">
                      <span className="block-badge">
                        {block.type === 'text' ? <FileText size={13} /> : <Sigma size={13} />}
                        <span>
                          {block.type === 'text' ? t.blockTextBadge : t.blockMathBadge} #
                          {index + 1}
                        </span>
                      </span>
                      <div className="block-card-actions">
                        <button
                          type="button"
                          className="block-action-btn"
                          onClick={() => moveBlock(block.id, 'up')}
                          disabled={index === 0}
                          title={t.moveUp}
                          aria-label={t.moveUp}
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          className="block-action-btn"
                          onClick={() => moveBlock(block.id, 'down')}
                          disabled={index === documentModel.blocks.length - 1}
                          title={t.moveDown}
                          aria-label={t.moveDown}
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          type="button"
                          className="block-action-btn is-danger"
                          onClick={() => deleteBlock(block.id)}
                          disabled={documentModel.blocks.length <= 1}
                          title={t.deleteBlock}
                          aria-label={t.deleteBlock}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="block-card-body">
                      {isActive ? (
                        block.type === 'text' ? (
                          <textarea
                            className="text-block-textarea"
                            value={block.content}
                            placeholder={t.textBlockPlaceholder}
                            aria-label={t.blockTextBadge}
                            onChange={(e) =>
                              updateBlockContent(
                                block.id,
                                { content: e.target.value },
                                'source'
                              )
                            }
                          />
                        ) : editorMode === 'visual' ? (
                          <VisualEditor
                            blockId={block.id}
                            value={block.latex}
                            onChange={(nextLatex) =>
                              updateBlockContent(block.id, { latex: nextLatex }, 'visual')
                            }
                          />
                        ) : (
                          <SourceEditor
                            blockId={block.id}
                            value={block.latex}
                            onChange={(nextLatex) =>
                              updateBlockContent(block.id, { latex: nextLatex }, 'source')
                            }
                          />
                        )
                      ) : (
                        <button
                          type="button"
                          className="block-summary-trigger"
                          onClick={() => setActiveBlockId(block.id)}
                        >
                          {block.type === 'text' ? (
                            block.content.trim() ? (
                              <span>{block.content}</span>
                            ) : (
                              <span className="block-summary-placeholder">
                                {t.emptyTextBlock}
                              </span>
                            )
                          ) : block.latex.trim() ? (
                            <span
                              dangerouslySetInnerHTML={{
                                __html: renderSymbolPreviewHtml(block.latex),
                              }}
                            />
                          ) : (
                            <span className="block-summary-placeholder">
                              {t.emptyMathBlock}
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="block-add-bar">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => addBlock('text', activeBlockId)}
              >
                <Plus size={14} />
                <span>{t.addTextBlock}</span>
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => addBlock('math', activeBlockId)}
              >
                <Plus size={14} />
                <span>{t.addMathBlock}</span>
              </button>

              <span className="toolbar-divider" aria-hidden="true" />

              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowMdImport((prev) => !prev)}
                aria-expanded={showMdImport}
              >
                <Upload size={14} />
                <span>{t.importMarkdownBtn}</span>
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={handleCopyMarkdown}
                disabled={documentModel.blocks.length === 0}
              >
                <Copy size={14} />
                <span>{t.copyMarkdownBtn}</span>
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={handleExportMarkdown}
                disabled={documentModel.blocks.length === 0}
              >
                <Download size={14} />
                <span>{t.exportMarkdownBtn}</span>
              </button>
            </div>

            {showMdImport && (
              <div className="md-import-panel">
                <div className="md-import-header">
                  <span className="md-import-title">{t.importMarkdownTitle}</span>
                  <div>
                    <input
                      ref={mdFileInputRef}
                      type="file"
                      accept=".md,.markdown,.tex,.txt"
                      style={{ display: 'none' }}
                      onChange={handleUploadMarkdownFile}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => mdFileInputRef.current?.click()}
                    >
                      <Upload size={13} />
                      <span>{t.importMarkdownUpload}</span>
                    </button>
                  </div>
                </div>
                <textarea
                  className="md-import-textarea"
                  value={mdDraft}
                  placeholder={t.importMarkdownPlaceholder}
                  onChange={(e) => setMdDraft(e.target.value)}
                />
                <div className="md-import-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setShowMdImport(false)}
                  >
                    {t.importMarkdownCancel}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!mdDraft.trim()}
                    onClick={handleApplyMarkdownImport}
                  >
                    {t.importMarkdownApply}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="editor-bottom-meta">
        <div className="editor-meta-top">
          <div className="delimiter-pills" role="group" aria-label={t.delimiterLabel}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginRight: 4 }}>
              {t.delimiterLabel}:
            </span>
            {DELIMITER_OPTIONS.map((opt) => (
              <button
                key={opt.mode}
                type="button"
                className={`delimiter-pill ${delimiterMode === opt.mode ? 'is-active' : ''}`}
                onClick={() => setDelimiterMode(opt.mode)}
              >
                {t[opt.labelKey]}
              </button>
            ))}
          </div>

          <div className="editor-status-bar" aria-live="polite">
            <span className={`status-badge is-${statusInfo.kind}`}>
              <span className="status-dot" aria-hidden="true" />
              <span>{statusInfo.label}</span>
            </span>
            <span className="status-metric">
              {charCount} {t.charCountLabel}
            </span>
            <span className="status-metric">
              {lineCount} {t.lineCountLabel}
            </span>
          </div>
        </div>

        {recentVersions.length > 0 && (
          <div className="versions-strip" aria-label={t.recentVersions}>
            <Clock size={13} color="var(--text-muted)" />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {t.recentVersions}:
            </span>
            {recentVersions.map((ver) => (
              <button
                key={ver.id}
                type="button"
                className="version-chip"
                title={ver.latex}
                onClick={() => restoreVersion(ver.id)}
              >
                <span>
                  {new Date(ver.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span>({ver.charCount})</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
