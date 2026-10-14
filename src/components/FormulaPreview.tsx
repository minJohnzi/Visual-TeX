import React, { useState, useMemo } from 'react';
import {
  exportPng,
  exportSvg,
  copyMathMl,
  copyPlainText,
  type CanvasBgMode,
} from '../utils/exportPng';
import { renderFormulaSafely } from '../utils/latex';
import { useI18n } from '../i18n/context';

interface FormulaPreviewProps {
  latex: string;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onJumpToError?: (pos: number, length?: number) => void;
}

const SCALE_LIST = [
  { scale: 1, label: '100%' },
  { scale: 1.5, label: '150%' },
  { scale: 2, label: '200%' },
  { scale: 2.5, label: '250%' },
  { scale: 3, label: '300%' },
];

export const FormulaPreview: React.FC<FormulaPreviewProps> = ({
  latex,
  onToast,
  onJumpToError,
}) => {
  const { t } = useI18n();
  const [scale, setScale] = useState<number>(1.5);
  const [bgMode, setBgMode] = useState<CanvasBgMode>('checker');
  const [color, setColor] = useState<string>('default');
  const [showErrorDetail, setShowErrorDetail] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const colorList = useMemo(
    () => [
      { color: 'default', title: t.colorDefault },
      { color: '#2563eb', title: t.colorBlue },
      { color: '#059669', title: t.colorGreen },
      { color: '#7c3aed', title: t.colorPurple },
      { color: '#d97706', title: t.colorAmber },
      { color: '#dc2626', title: t.colorRed },
    ],
    [t]
  );

  const outcome = renderFormulaSafely(latex);
  const isEmpty = !latex.trim() || !outcome.cleanedLatex.trim();
  const isOk = outcome.success || isEmpty;

  const handleCopyPng = async () => {
    if (isEmpty) {
      onToast(t.toastFormulaEmpty, 'error');
      return;
    }
    setIsExporting(true);
    onToast(t.toastGeneratingPng, 'info');
    try {
      const res = await exportPng(latex, bgMode, color, true);
      onToast(res.message || t.toastCopiedPng, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t.toastClipboardUnavailable;
      onToast(msg, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPng = async () => {
    if (isEmpty) {
      onToast(t.toastFormulaEmpty, 'error');
      return;
    }
    setIsExporting(true);
    try {
      const res = await exportPng(latex, bgMode, color, false);
      onToast(res.message || t.toastDownloadedPng, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      onToast(msg, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopySvg = async () => {
    if (isEmpty) {
      onToast(t.toastFormulaEmpty, 'error');
      return;
    }
    try {
      await exportSvg(latex, true, color);
      onToast(t.toastCopiedSvg, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t.toastClipboardUnavailable;
      onToast(msg, 'error');
    }
  };

  const handleDownloadSvg = async () => {
    if (isEmpty) {
      onToast(t.toastFormulaEmpty, 'error');
      return;
    }
    try {
      await exportSvg(latex, false, color);
      onToast(t.toastDownloadedSvg, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      onToast(msg, 'error');
    }
  };

  const handleCopyMathMl = () => {
    if (isEmpty) {
      onToast(t.toastFormulaEmpty, 'error');
      return;
    }
    try {
      copyMathMl(latex);
      onToast(t.toastCopiedMathMl, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate MathML';
      onToast(msg, 'error');
    }
  };

  const handleCopyLatex = async () => {
    if (isEmpty) {
      onToast(t.toastFormulaEmpty, 'error');
      return;
    }
    await copyPlainText(latex);
    onToast(t.toastCopiedLatex, 'success');
  };

  return (
    <section className="card-panel preview-panel" aria-label={t.previewTitle}>
      {/* 预览区顶部控制栏 */}
      <div className="card-header">
        <span className="card-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>{t.previewTitle}</span>
        </span>

        <div className="preview-controls">
          {/* 缩放比例 */}
          <div className="ctrl-item">
            <span>{t.zoom}:</span>
            <div className="zoom-pills">
              {SCALE_LIST.map((item) => (
                <button
                  key={item.scale}
                  type="button"
                  className={`zoom-pill-btn ${scale === item.scale ? 'active' : ''}`}
                  onClick={() => setScale(item.scale)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 背景选择器 */}
          <div className="ctrl-item">
            <span>{t.bgLabel}:</span>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <button
                type="button"
                className={`bg-select-btn bg-opt-checker ${bgMode === 'checker' ? 'active' : ''}`}
                title={t.bgCheckerTitle}
                onClick={() => setBgMode('checker')}
              />
              <button
                type="button"
                className={`bg-select-btn bg-opt-white ${bgMode === 'white' ? 'active' : ''}`}
                title={t.bgWhiteTitle}
                onClick={() => setBgMode('white')}
              />
              <button
                type="button"
                className={`bg-select-btn bg-opt-gray ${bgMode === 'gray' ? 'active' : ''}`}
                title={t.bgGrayTitle}
                onClick={() => setBgMode('gray')}
              />
              <button
                type="button"
                className={`bg-select-btn bg-opt-dark ${bgMode === 'dark' ? 'active' : ''}`}
                title={t.bgDarkTitle}
                onClick={() => setBgMode('dark')}
              />
            </div>
          </div>

          {/* 公式字体颜色 */}
          <div className="ctrl-item">
            <span>{t.colorLabel}:</span>
            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              {colorList.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  className={`color-swatch-btn ${color === c.color ? 'active' : ''}`}
                  style={{ background: c.color === 'default' ? 'currentColor' : c.color }}
                  title={c.title}
                  onClick={() => setColor(c.color)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 画布预览屏幕 */}
      <div className={`preview-canvas-area canvas-bg-${bgMode}`}>
        {/* 角落语法状态角标 */}
        <div
          className={`syntax-status-badge ${isOk ? (outcome.isMixed ? 'badge-mixed' : outcome.wasAutoAligned ? 'badge-aligned' : 'ok') : 'error'}`}
          onClick={() => {
            if (!isOk) {
              setShowErrorDetail((prev) => !prev);
              if (onJumpToError && typeof outcome.errorPosition === 'number') {
                onJumpToError(outcome.errorPosition, outcome.errorLength || 1);
              }
            }
          }}
          title={
            !isOk
              ? `${t.syntaxWarning} (${t.clickToJumpError})`
              : outcome.isMixed
              ? t.mixedModeBadge
              : outcome.wasAutoAligned
              ? t.autoAlignedBadge
              : t.syntaxValid
          }
        >
          {isOk ? (
            outcome.isMixed ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span>{t.mixedModeBadge}</span>
              </>
            ) : outcome.wasAutoAligned ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="21" y1="6" x2="3" y2="6" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                  <line x1="17" y1="18" x2="3" y2="18" />
                </svg>
                <span>{t.autoAlignedBadge}</span>
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{t.syntaxValid}</span>
              </>
            )
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{t.syntaxWarning}</span>
            </>
          )}
        </div>

        {/* 语法错误详情气泡 */}
        <div className={`syntax-error-detail ${showErrorDetail && !isOk ? 'show' : ''}`}>
          <div className="syntax-error-header">
            <span className="error-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{t.syntaxWarning}</span>
            </span>
            {typeof outcome.errorLine === 'number' && typeof outcome.errorColumn === 'number' && (
              <span className="error-pos-pill">
                {t.lineColLabel
                  .replace('{line}', String(outcome.errorLine))
                  .replace('{col}', String(outcome.errorColumn))}
              </span>
            )}
          </div>

          <div className="syntax-error-msg">
            {outcome.errorMessage || 'Syntax issue detected; lenient fallback rendering applied.'}
          </div>

          {typeof outcome.errorPosition === 'number' && onJumpToError && (
            <button
              type="button"
              className="btn-jump-error-action"
              onClick={(e) => {
                e.stopPropagation();
                onJumpToError(outcome.errorPosition!, outcome.errorLength || 1);
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="22" y1="12" x2="18" y2="12" />
                <line x1="6" y1="12" x2="2" y2="12" />
                <line x1="12" y1="6" x2="12" y2="2" />
                <line x1="12" y1="22" x2="12" y2="18" />
              </svg>
              <span>{t.clickToJumpError}</span>
            </button>
          )}
        </div>

        {/* 渲染公式目标 */}
        <div
          className={`formula-render-target ${outcome.isMixed ? 'is-mixed-mode' : ''}`}
          style={{
            transform: `scale(${scale})`,
            color: color === 'default' ? undefined : color,
          }}
        >
          {isEmpty ? (
            <span style={{ color: 'var(--text-light)', fontStyle: 'italic' }}>
              {t.previewEmptyPlaceholder}
            </span>
          ) : outcome.html ? (
            <div dangerouslySetInnerHTML={{ __html: outcome.html }} />
          ) : (
            <span style={{ color: 'var(--text-light)', fontStyle: 'italic' }}>
              {t.previewEmptyPlaceholder}
            </span>
          )}
        </div>
      </div>

      {/* 导出工具栏 */}
      <div className="export-toolbar">
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m19 11-4-7-4 7" />
            <path d="M15 4v16" />
          </svg>
          <span>{t.exportToolbarLabel}:</span>
        </div>

        <div className="export-buttons-group">
          {/* 复制高清 PNG */}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleCopyPng}
            disabled={isExporting}
            title={t.copyPngTooltip}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
            <strong>{t.copyPng}</strong>
          </button>

          {/* 下载 PNG */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleDownloadPng}
            disabled={isExporting}
            title={t.downloadPngTooltip}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{t.downloadPng}</span>
          </button>

          {/* 复制 SVG */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleCopySvg}
            title={t.copySvgTooltip}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <span>{t.copySvg}</span>
          </button>

          {/* 下载 SVG */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleDownloadSvg}
            title={t.downloadSvgTooltip}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{t.downloadSvg}</span>
          </button>

          {/* 复制 MathML (Word) */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleCopyMathMl}
            title={t.copyMathMlTooltip}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
            </svg>
            <span>{t.copyMathMl}</span>
          </button>

          {/* 复制 LaTeX */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleCopyLatex}
            title={t.copyLatexTooltip}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
            <span>{t.copyLatex}</span>
          </button>
        </div>
      </div>
    </section>
  );
};
