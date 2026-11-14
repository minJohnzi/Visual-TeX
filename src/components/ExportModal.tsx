import React, { useEffect, useState } from 'react';
import { Copy, Download, ImageDown, X } from 'lucide-react';
import { copyTextToClipboard } from '../core/export/clipboard';
import {
  deliverPngBlob,
  renderDomElementToPngBlob,
  triggerTextDownload,
} from '../core/export/domPng';
import {
  compileFormulaSvg,
  renderSvgToPngBlob,
  resolveExportTextColor,
  styleStandaloneSvg,
} from '../core/export/mathjaxClient';
import { CanvasBgMode, ExportPaddingMode, ExportSvgResult } from '../core/types';
import { useI18n } from '../i18n/context';
import { useAppStore } from '../store/useAppStore';

type ExportFormat = 'png' | 'svg' | 'mathml';
type ScaleOption = 1 | 2 | 3 | 4 | 5;

const INK_OPTIONS = ['default', '#000000', '#ffffff', '#1e3a8a'];
const SCALE_OPTIONS: ScaleOption[] = [1, 2, 3, 4, 5];
const PADDING_OPTIONS: Array<{
  mode: ExportPaddingMode;
  labelKey: 'paddingCompact' | 'paddingNormal' | 'paddingRelaxed';
}> = [
  { mode: 'compact', labelKey: 'paddingCompact' },
  { mode: 'normal', labelKey: 'paddingNormal' },
  { mode: 'relaxed', labelKey: 'paddingRelaxed' },
];

const ExportModalContent: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useI18n();
  const docMode = useAppStore((s) => s.docMode);
  const documentModel = useAppStore((s) => s.document);
  const compileResult = useAppStore((s) => s.compileResult);
  const initialBg = useAppStore((s) => s.previewBgMode);
  const initialColor = useAppStore((s) => s.previewColor);
  const pushToast = useAppStore((s) => s.pushToast);

  const [format, setFormat] = useState<ExportFormat>('png');
  const [scale, setScale] = useState<ScaleOption>(2);
  const [padding, setPadding] = useState<ExportPaddingMode>('normal');
  const [bgMode, setBgMode] = useState<CanvasBgMode>(initialBg);
  const [textColor, setTextColor] = useState<string>(initialColor);
  const [adaptiveHalo, setAdaptiveHalo] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [svgResult, setSvgResult] = useState<ExportSvgResult | null>(null);

  const activeSingleLatex = documentModel.singleLatex;

  // Fetch offline vector SVG from MathJax v4 Worker whenever modal opens in single mode
  useEffect(() => {
    if (docMode !== 'single') return;
    let cancelled = false;
    setBusy(true);
    compileFormulaSvg(activeSingleLatex)
      .then((res) => {
        if (!cancelled) {
          setSvgResult(res);
          setBusy(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSvgResult({
            ok: false,
            svg: '',
            widthEx: 0,
            heightEx: 0,
            viewBox: '0 0 0 0',
            error: 'Worker compile failed',
          });
          setBusy(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [docMode, activeSingleLatex]);

  const previewSvg =
    svgResult?.ok && svgResult.svg
      ? styleStandaloneSvg(svgResult.svg, {
          textColor,
          bgMode,
          includeBackground: false,
        })
      : '';

  const handleAction = async (action: 'copy' | 'download') => {
    setBusy(true);
    try {
      if (format === 'mathml') {
        const mathml = compileResult.mathml;
        if (!mathml) throw new Error('No MathML available');
        if (action === 'copy') {
          const ok = await copyTextToClipboard(mathml);
          pushToast(ok ? t.toastMathMlCopied : t.toastActionFailed, ok ? 'success' : 'error');
        } else {
          triggerTextDownload(mathml, 'formula.mml', 'application/mathml+xml;charset=utf-8');
          pushToast(t.toastSvgDownloaded, 'success');
        }
        return;
      }

      if (format === 'svg') {
        const result =
          svgResult?.ok ? svgResult : await compileFormulaSvg(activeSingleLatex);
        if (!result.ok || !result.svg) {
          throw new Error(result.error || 'SVG compilation failed');
        }
        const finalSvg = styleStandaloneSvg(result.svg, {
          textColor,
          bgMode,
          includeBackground: bgMode !== 'checker',
        });
        if (action === 'copy') {
          const ok = await copyTextToClipboard(finalSvg);
          pushToast(ok ? t.toastSvgCopied : t.toastActionFailed, ok ? 'success' : 'error');
        } else {
          triggerTextDownload(finalSvg, 'formula.svg', 'image/svg+xml;charset=utf-8');
          pushToast(t.toastSvgDownloaded, 'success');
        }
        return;
      }

      // PNG format
      let blob: Blob;
      if (docMode === 'single') {
        const result =
          svgResult?.ok ? svgResult : await compileFormulaSvg(activeSingleLatex);
        blob = await renderSvgToPngBlob(result, {
          scale,
          bgMode,
          textColor,
          adaptiveHalo,
          paddingMode: padding,
        });
      } else {
        const container = document.getElementById('mixed-export-capture-target');
        if (!container) throw new Error('Mixed capture target missing');
        blob = await renderDomElementToPngBlob(container, {
          scale,
          bgMode,
          paddingMode: padding,
        });
      }

      const status = await deliverPngBlob(blob, action, 'visual-tex-formula.png');
      if (status === 'copied') {
        pushToast(t.toastImageCopied, 'success');
      } else if (status === 'downloaded') {
        pushToast(t.toastImageDownloaded, 'success');
      } else {
        pushToast(t.toastActionFailed, 'error');
      }
    } catch {
      pushToast(t.toastActionFailed, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.exportModalTitle}>
      <div className="modal-card modal-card-lg">
        <div className="modal-header">
          <h3 className="modal-title">
            <ImageDown size={18} />
            <span>{t.exportModalTitle}</span>
          </h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label={t.closeModal}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="export-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={format === 'png'}
              className={`export-tab ${format === 'png' ? 'is-active' : ''}`}
              onClick={() => setFormat('png')}
            >
              PNG
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={format === 'svg'}
              disabled={docMode === 'mixed'}
              className={`export-tab ${format === 'svg' ? 'is-active' : ''}`}
              onClick={() => setFormat('svg')}
            >
              SVG
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={format === 'mathml'}
              className={`export-tab ${format === 'mathml' ? 'is-active' : ''}`}
              onClick={() => setFormat('mathml')}
            >
              MathML
            </button>
          </div>

          <div className="export-layout-grid">
            <div className="export-controls-col">
              {format === 'png' && (
                <>
                  <div className="export-field">
                    <span className="export-field-label">{t.exportScale}</span>
                    <div className="export-option-row">
                      {SCALE_OPTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`export-pill ${scale === s ? 'is-active' : ''}`}
                          onClick={() => setScale(s)}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="export-field">
                    <span className="export-field-label">{t.exportPadding}</span>
                    <div className="export-option-row">
                      {PADDING_OPTIONS.map((opt) => (
                        <button
                          key={opt.mode}
                          type="button"
                          className={`export-pill ${padding === opt.mode ? 'is-active' : ''}`}
                          onClick={() => setPadding(opt.mode)}
                        >
                          {t[opt.labelKey]}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {format !== 'mathml' && (
                <>
                  <div className="export-field">
                    <span className="export-field-label">{t.exportBg}</span>
                    <div className="export-option-row">
                      {(['checker', 'white', 'gray', 'dark'] as CanvasBgMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`export-pill ${bgMode === mode ? 'is-active' : ''}`}
                          onClick={() => setBgMode(mode)}
                        >
                          {mode === 'checker'
                            ? t.bgChecker
                            : mode === 'white'
                              ? t.bgWhite
                              : mode === 'gray'
                                ? t.bgGray
                                : t.bgDark}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="export-field">
                    <span className="export-field-label">{t.exportTextColor}</span>
                    <div className="export-option-row">
                      {INK_OPTIONS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`export-pill ${textColor === color ? 'is-active' : ''}`}
                          onClick={() => setTextColor(color)}
                        >
                          {color === 'default' ? t.colorDefault : color}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {format === 'png' && bgMode === 'checker' && docMode === 'single' && (
                <label className="export-checkbox-row">
                  <input
                    type="checkbox"
                    checked={adaptiveHalo}
                    onChange={(e) => setAdaptiveHalo(e.target.checked)}
                  />
                  <span>{t.exportAdaptiveHalo}</span>
                </label>
              )}

              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {docMode === 'mixed' ? t.exportMixedPngNotice : t.exportHaloHint}
              </p>
            </div>

            <div className="export-field">
              <span className="export-field-label">{t.exportPreviewLabel}</span>
              <div className={`export-preview-box canvas-bg-${bgMode}`}>
                {format === 'mathml' ? (
                  <pre
                    style={{
                      margin: 0,
                      width: '100%',
                      maxHeight: 200,
                      overflow: 'auto',
                      fontSize: '0.74rem',
                      color: resolveExportTextColor(textColor, bgMode),
                    }}
                  >
                    {compileResult.mathml || ''}
                  </pre>
                ) : docMode === 'mixed' ? (
                  <div
                    className="mixed-content-rendered"
                    style={{ color: resolveExportTextColor(textColor, bgMode) }}
                    dangerouslySetInnerHTML={{ __html: compileResult.html }}
                  />
                ) : busy && !previewSvg ? (
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {t.exportRendering}
                  </span>
                ) : previewSvg ? (
                  <div dangerouslySetInnerHTML={{ __html: previewSvg }} />
                ) : (
                  <div
                    style={{ color: resolveExportTextColor(textColor, bgMode) }}
                    dangerouslySetInnerHTML={{ __html: compileResult.html }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => handleAction('copy')}
          >
            <Copy size={14} />
            <span>{t.exportCopyBtn}</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => handleAction('download')}
          >
            <Download size={14} />
            <span>{t.exportDownloadBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const ExportModal: React.FC = () => {
  const isOpen = useAppStore((s) => s.modals.export);
  const setModalOpen = useAppStore((s) => s.setModalOpen);
  if (!isOpen) return null;
  return <ExportModalContent onClose={() => setModalOpen('export', false)} />;
};
