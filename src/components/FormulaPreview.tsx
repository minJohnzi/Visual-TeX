import React, { useCallback, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Copy,
  FileCode2,
  Image,
  ImageDown,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { copyTextToClipboard } from '../core/export/clipboard';
import {
  deliverPngBlob,
  renderDomElementToPngBlob,
  triggerTextDownload,
} from '../core/export/domPng';
import {
  compileFormulaSvg,
  exportDocumentToOfflineHtml,
  renderSvgToPngBlob,
  styleStandaloneSvg,
} from '../core/export/mathjaxClient';
import { sanitizeFilename } from '../core/export/offlineHtml';
import { CanvasBgMode } from '../core/types';
import { useI18n } from '../i18n/context';
import { useAppStore } from '../store/useAppStore';

const INK_SWATCHES = ['default', '#2563eb', '#059669', '#7c3aed', '#d97706', '#dc2626'];

const BG_OPTIONS: Array<{
  mode: CanvasBgMode;
  className: string;
  labelKey: 'bgChecker' | 'bgWhite' | 'bgGray' | 'bgDark';
}> = [
  { mode: 'checker', className: 'bg-opt-checker', labelKey: 'bgChecker' },
  { mode: 'white', className: 'bg-opt-white', labelKey: 'bgWhite' },
  { mode: 'gray', className: 'bg-opt-gray', labelKey: 'bgGray' },
  { mode: 'dark', className: 'bg-opt-dark', labelKey: 'bgDark' },
];

export const FormulaPreview: React.FC = () => {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const formulaRef = useRef<HTMLDivElement | null>(null);

  const compileResult = useAppStore((s) => s.compileResult);
  const docMode = useAppStore((s) => s.docMode);
  const documentModel = useAppStore((s) => s.document);
  const delimiterMode = useAppStore((s) => s.delimiterMode);
  const previewBgMode = useAppStore((s) => s.previewBgMode);
  const previewColor = useAppStore((s) => s.previewColor);
  const previewZoom = useAppStore((s) => s.previewZoom);

  const setPreviewBgMode = useAppStore((s) => s.setPreviewBgMode);
  const setPreviewColor = useAppStore((s) => s.setPreviewColor);
  const setPreviewZoom = useAppStore((s) => s.setPreviewZoom);
  const setEditorMode = useAppStore((s) => s.setEditorMode);
  const setActiveBlockId = useAppStore((s) => s.setActiveBlockId);
  const setModalOpen = useAppStore((s) => s.setModalOpen);
  const pushToast = useAppStore((s) => s.pushToast);

  const handleFitToWidth = useCallback(() => {
    const stage = stageRef.current;
    const formula = formulaRef.current;
    if (!stage || !formula) return;
    const available = stage.clientWidth - 40;
    const naturalWidth = formula.scrollWidth;
    if (naturalWidth > available && available > 80) {
      setPreviewZoom(Math.max(0.5, available / naturalWidth));
    } else {
      setPreviewZoom(1);
    }
  }, [setPreviewZoom]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      // Keep layout measurements crisp on mobile/resize without forcing unwanted zoom shifts
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const handleLocateError = () => {
    const err = compileResult.error;
    if (!err) return;
    if (err.blockId && err.blockId !== 'single') {
      setActiveBlockId(err.blockId);
    }
    // Store focusOffset on lastTransaction and switch to Source mode
    useAppStore.setState((s) => ({
      editorMode: 'source',
      lastTransaction: {
        seq: s.lastTransaction.seq + 1,
        origin: 'external',
        blockId: err.blockId ?? s.activeBlockId,
        focusOffset: err.index,
      },
    }));
    setEditorMode('source');
  };

  const handleCopyMathMl = async () => {
    if (!compileResult.mathml) return;
    const ok = await copyTextToClipboard(compileResult.mathml);
    pushToast(ok ? t.toastMathMlCopied : t.toastActionFailed, ok ? 'success' : 'error');
  };

  const handleExportHtml = async () => {
    try {
      const html = await exportDocumentToOfflineHtml(
        documentModel,
        delimiterMode,
        'Visual-TeX Formula Snapshot'
      );
      const name = sanitizeFilename(
        docMode === 'mixed' ? 'visual-tex-notes' : 'visual-tex-formula',
        'formula'
      );
      triggerTextDownload(html, `${name}.html`, 'text/html;charset=utf-8');
      pushToast(t.toastHtmlDownloaded, 'success');
    } catch {
      pushToast(t.toastActionFailed, 'error');
    }
  };

  const handleQuickCopyPng = async () => {
    if (compileResult.isEmpty || (docMode === 'single' && compileResult.hasError)) return;
    try {
      let blob: Blob;
      if (docMode === 'single') {
        const result = await compileFormulaSvg(documentModel.singleLatex);
        if (!result.ok || !result.svg) throw new Error(result.error || 'SVG failed');
        blob = await renderSvgToPngBlob(result, {
          scale: 3,
          bgMode: previewBgMode,
          textColor: previewColor,
          adaptiveHalo: true,
          paddingMode: 'normal',
        });
      } else {
        if (!formulaRef.current) throw new Error('Preview target missing');
        blob = await renderDomElementToPngBlob(formulaRef.current, {
          scale: 3,
          bgMode: previewBgMode,
          paddingMode: 'normal',
        });
      }
      const status = await deliverPngBlob(blob, 'copy', 'visual-tex-formula.png');
      if (status === 'copied') {
        pushToast(t.toastImageCopied, 'success');
      } else if (status === 'downloaded') {
        pushToast(t.toastImageDownloaded, 'success');
      } else {
        pushToast(t.toastActionFailed, 'error');
      }
    } catch {
      pushToast(t.toastActionFailed, 'error');
    }
  };

  const handleQuickCopySvg = async () => {
    if (docMode !== 'single' || compileResult.isEmpty || compileResult.hasError) return;
    try {
      const result = await compileFormulaSvg(documentModel.singleLatex);
      if (!result.ok || !result.svg) throw new Error(result.error || 'SVG failed');
      const finalSvg = styleStandaloneSvg(result.svg, {
        textColor: previewColor,
        bgMode: previewBgMode,
        includeBackground: previewBgMode !== 'checker',
      });
      const ok = await copyTextToClipboard(finalSvg);
      pushToast(ok ? t.toastSvgCopied : t.toastActionFailed, ok ? 'success' : 'error');
    } catch {
      pushToast(t.toastActionFailed, 'error');
    }
  };

  const canvasClass = `preview-canvas-stage canvas-bg-${previewBgMode}`;

  return (
    <section className="preview-panel" aria-label={t.previewTitle}>
      <div className="panel-header">
        <div className="panel-title-group">
          <h2 className="panel-title">{t.previewTitle}</h2>
        </div>

        <div className="zoom-control-group">
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => setPreviewZoom(previewZoom - 0.15)}
            title={t.zoomOut}
            aria-label={t.zoomOut}
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => setPreviewZoom(1)}
            title={t.zoomReset}
          >
            <span className="zoom-value">{Math.round(previewZoom * 100)}%</span>
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => setPreviewZoom(previewZoom + 0.15)}
            title={t.zoomIn}
            aria-label={t.zoomIn}
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={handleFitToWidth}
            title={t.fitToWidth}
            aria-label={t.fitToWidth}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      <div className="preview-controls-bar">
        <div className="preview-control-group">
          <div className="bg-selector-group" role="group" aria-label={t.exportBg}>
            {BG_OPTIONS.map((opt) => (
              <button
                key={opt.mode}
                type="button"
                className={`bg-opt-btn ${opt.className} ${
                  previewBgMode === opt.mode ? 'is-active' : ''
                }`}
                onClick={() => setPreviewBgMode(opt.mode)}
                title={t[opt.labelKey]}
                aria-label={t[opt.labelKey]}
              />
            ))}
          </div>

          <span className="toolbar-divider" aria-hidden="true" />

          <div className="color-swatch-group" role="group" aria-label={t.exportTextColor}>
            {INK_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`color-swatch-btn ${
                  swatch === 'default' ? 'color-swatch-default' : ''
                } ${previewColor === swatch ? 'is-active' : ''}`}
                style={swatch !== 'default' ? { backgroundColor: swatch } : undefined}
                onClick={() => setPreviewColor(swatch)}
                title={swatch === 'default' ? t.colorDefault : swatch}
                aria-label={swatch === 'default' ? t.colorDefault : swatch}
              />
            ))}
          </div>
        </div>
      </div>

      <div ref={stageRef} className={canvasClass}>
        {compileResult.isEmpty ? (
          <div className="preview-empty-hint">{t.previewEmpty}</div>
        ) : compileResult.hasError && docMode === 'single' ? (
          <div className="preview-empty-hint">{t.syntaxErrorTitle}</div>
        ) : (
          <div
            id="mixed-export-capture-target"
            ref={formulaRef}
            className="preview-formula-scaled"
            style={{
              transform: `scale(${previewZoom})`,
              color: previewColor !== 'default' ? previewColor : undefined,
            }}
            dangerouslySetInnerHTML={{ __html: compileResult.html }}
          />
        )}
      </div>

      {compileResult.error && (
        <div className="syntax-error-banner" role="alert">
          <div className="syntax-error-header">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={15} />
              <span>
                {t.syntaxErrorTitle} (L{compileResult.error.line}:C{compileResult.error.column})
              </span>
            </span>
            <button
              type="button"
              className="syntax-error-jump-btn"
              onClick={handleLocateError}
            >
              <span>{t.jumpToError}</span>
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="syntax-error-detail" onClick={handleLocateError}>
            {compileResult.error.message}
          </div>
        </div>
      )}

      <div className="preview-actions-footer">
        <div className="preview-action-buttons">
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleQuickCopyPng}
            disabled={compileResult.isEmpty || (docMode === 'single' && compileResult.hasError)}
          >
            <Image size={13} />
            <span>{t.quickCopyPng}</span>
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleQuickCopySvg}
            disabled={
              docMode !== 'single' || compileResult.isEmpty || compileResult.hasError
            }
          >
            <Copy size={13} />
            <span>{t.quickCopySvg}</span>
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleCopyMathMl}
            disabled={!compileResult.mathml}
          >
            <Copy size={13} />
            <span>{t.copyMathMl}</span>
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleExportHtml}
            disabled={compileResult.isEmpty}
          >
            <FileCode2 size={13} />
            <span>{t.exportOfflineHtml}</span>
          </button>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setModalOpen('export', true)}
          disabled={compileResult.isEmpty || (docMode === 'single' && compileResult.hasError)}
        >
          <ImageDown size={14} />
          <span>{t.openExportModal}</span>
        </button>
      </div>
    </section>
  );
};
