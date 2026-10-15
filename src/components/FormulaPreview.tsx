import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  exportPng,
  exportSvg,
  copyMathMl,
  copyPlainText,
  type CanvasBgMode,
} from '../utils/exportPng';
import { renderFormulaSafely, autoFixLatexSyntax } from '../utils/latex';
import { useI18n } from '../i18n/context';
import { ExportModal } from './ExportModal';

interface FormulaPreviewProps {
  latex: string;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onJumpToError?: (pos: number, length?: number) => void;
  onAutoFix?: (fixedLatex: string) => void;
}

export const FormulaPreview: React.FC<FormulaPreviewProps> = ({
  latex,
  onToast,
  onJumpToError,
  onAutoFix,
}) => {
  const { t } = useI18n();

  const [scale, setScale] = useState<number>(1.5);
  const [isFitToWidth, setIsFitToWidth] = useState<boolean>(false);
  const [fitScale, setFitScale] = useState<number>(1.0);

  const [bgMode, setBgMode] = useState<CanvasBgMode>('checker');
  const [color, setColor] = useState<string>('default');
  const [showErrorDetail, setShowErrorDetail] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);

  const canvasAreaRef = useRef<HTMLDivElement | null>(null);
  const renderTargetRef = useRef<HTMLDivElement | null>(null);

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

  const outcome = useMemo(() => renderFormulaSafely(latex), [latex]);
  const isEmpty = !latex.trim() || !outcome.cleanedLatex.trim();
  const isOk = outcome.success || isEmpty;

  // 自适应宽度 (Fit to Width) 计算逻辑
  const recomputeFitScale = useCallback(() => {
    if (!isFitToWidth) return;
    const container = canvasAreaRef.current;
    const target = renderTargetRef.current;
    if (!container || !target) return;

    const availableWidth = Math.max(container.clientWidth - 56, 120);
    // 获取公式实际未缩放内容宽度
    const child = target.firstElementChild as HTMLElement | null;
    const contentWidth = child ? child.scrollWidth : target.scrollWidth;

    if (contentWidth > availableWidth && availableWidth > 0) {
      const calculated = availableWidth / contentWidth;
      const bounded = Math.min(1.0, Math.max(0.4, Number(calculated.toFixed(2))));
      setFitScale(bounded);
    } else {
      setFitScale(1.0);
    }
  }, [isFitToWidth]);

  // 监听容器与公式内容尺寸变化
  useEffect(() => {
    if (!isFitToWidth) return;

    recomputeFitScale();

    const container = canvasAreaRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      recomputeFitScale();
    });

    observer.observe(container);
    if (renderTargetRef.current) {
      observer.observe(renderTargetRef.current);
    }

    return () => observer.disconnect();
  }, [isFitToWidth, outcome.html, recomputeFitScale]);

  // 快捷缩放操作
  const handleZoomIn = () => {
    setIsFitToWidth(false);
    setScale((prev) => Math.min(3.0, Number((prev + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setIsFitToWidth(false);
    setScale((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))));
  };

  const handleZoomReset = () => {
    setIsFitToWidth(false);
    setScale(1.0);
  };

  const toggleFitToWidth = () => {
    setIsFitToWidth((prev) => {
      const next = !prev;
      if (next) {
        window.requestAnimationFrame(() => recomputeFitScale());
      }
      return next;
    });
  };

  // 当前有效应用的缩放倍率
  const activeScale = isFitToWidth ? fitScale : scale;

  // 快速复制 PNG (默认 3.5x 高清)
  const handleCopyPng = async () => {
    if (isEmpty) {
      onToast(t.toastFormulaEmpty, 'error');
      return;
    }
    setIsExporting(true);
    onToast(t.toastGeneratingPng, 'info');
    try {
      const res = await exportPng(latex, bgMode, color, true, {
        scale: 3,
        adaptiveHalo: bgMode === 'checker',
      });
      onToast(res.message || t.toastCopiedPng, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t.toastClipboardUnavailable;
      onToast(msg, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // 快速下载 PNG
  const handleDownloadPng = async () => {
    if (isEmpty) {
      onToast(t.toastFormulaEmpty, 'error');
      return;
    }
    setIsExporting(true);
    try {
      const res = await exportPng(latex, bgMode, color, false, {
        scale: 3,
        adaptiveHalo: bgMode === 'checker',
      });
      onToast(res.message || t.toastDownloadedPng, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      onToast(msg, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // 快速复制 SVG
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

  // 快速下载 SVG
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

  // 快速复制 MathML
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

  // 快速复制 LaTeX
  const handleCopyLatex = async () => {
    if (isEmpty) {
      onToast(t.toastFormulaEmpty, 'error');
      return;
    }
    await copyPlainText(latex);
    onToast(t.toastCopiedLatex, 'success');
  };

  return (
    <>
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
            {/* 缩放比例与自适应宽度按钮组 */}
            <div className="ctrl-item">
              <span>{t.zoom}:</span>
              <div className="zoom-action-group">
                <button
                  type="button"
                  className="btn btn-sm btn-icon zoom-step-btn"
                  onClick={handleZoomOut}
                  title={t.zoomOut}
                  aria-label={t.zoomOut}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={`btn btn-sm zoom-value-btn ${!isFitToWidth && scale === 1 ? 'active' : ''}`}
                  onClick={handleZoomReset}
                  title={t.zoomReset}
                >
                  {isFitToWidth ? `${Math.round(fitScale * 100)}%` : `${Math.round(scale * 100)}%`}
                </button>

                <button
                  type="button"
                  className="btn btn-sm btn-icon zoom-step-btn"
                  onClick={handleZoomIn}
                  title={t.zoomIn}
                  aria-label={t.zoomIn}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                {/* 自适应宽度切换按钮 */}
                <button
                  type="button"
                  className={`btn btn-sm btn-fit-width ${isFitToWidth ? 'active' : ''}`}
                  onClick={toggleFitToWidth}
                  title={t.fitToWidthTooltip}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                  </svg>
                  <span>{t.fitToWidth}</span>
                </button>
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
        <div ref={canvasAreaRef} className={`preview-canvas-area canvas-bg-${bgMode}`}>
          {/* 角落语法状态角标 */}
          <div
            className={`syntax-status-badge ${
              isOk
                ? outcome.isMixed
                  ? 'badge-mixed'
                  : outcome.wasAutoAligned
                  ? 'badge-aligned'
                  : outcome.wasAutoFixed
                  ? 'badge-fixed'
                  : 'ok'
                : 'error'
            }`}
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
                : outcome.wasAutoFixed
                ? t.autoFixedBadge
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
              ) : outcome.wasAutoFixed ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
                  </svg>
                  <span>{t.autoFixedBadge}</span>
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

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.45rem' }}>
              {typeof outcome.errorPosition === 'number' && onJumpToError && (
                <button
                  type="button"
                  className="btn-jump-error-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpToError(outcome.errorPosition!, outcome.errorLength || 1);
                  }}
                  title={t.jumpToError}
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

              {onAutoFix && (
                <button
                  type="button"
                  className="btn-jump-error-action btn-autofix-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    const { fixed, wasModified } = autoFixLatexSyntax(latex);
                    if (wasModified) {
                      onAutoFix(fixed);
                      onToast(t.toastAutoFixed, 'success');
                    } else {
                      onToast(t.toastAutoFixed, 'info');
                    }
                  }}
                  title={t.autoFixTooltip}
                  style={{
                    backgroundColor: 'rgba(234, 179, 8, 0.15)',
                    color: '#ca8a04',
                    borderColor: 'rgba(234, 179, 8, 0.3)',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span>{t.autoFixAction}</span>
                </button>
              )}
            </div>
          </div>

          {/* 渲染公式目标 */}
          <div
            ref={renderTargetRef}
            className={`formula-render-target ${outcome.isMixed ? 'is-mixed-mode' : ''}`}
            style={{
              transform: `scale(${activeScale})`,
              transformOrigin: 'center center',
              color: color === 'default' ? undefined : color,
              transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
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

            {/* 高级导出配置面板按钮 */}
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => setShowExportModal(true)}
              title={t.exportAdvancedTooltip}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>{t.exportAdvancedBtn}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 高级导出弹窗 */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        latex={latex}
        currentBgMode={bgMode}
        currentColor={color}
        onToast={onToast}
      />
    </>
  );
};
