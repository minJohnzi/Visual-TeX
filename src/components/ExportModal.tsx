import React, { useState, useMemo } from 'react';
import {
  exportPng,
  exportSvg,
  copyMathMl,
  type CanvasBgMode,
  isColorLight,
} from '../utils/exportPng';
import { renderFormulaSafely } from '../utils/latex';
import { useI18n } from '../i18n/context';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  latex: string;
  currentBgMode: CanvasBgMode;
  currentColor: string;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  latex,
  currentBgMode,
  currentColor,
  onToast,
}) => {
  const { t } = useI18n();

  const [format, setFormat] = useState<'png' | 'svg' | 'mathml'>('png');
  const [scale, setScale] = useState<number>(3);
  const [bgMode, setBgMode] = useState<CanvasBgMode>(currentBgMode || 'checker');
  const [textColor, setTextColor] = useState<string>(
    currentColor !== 'default' ? currentColor : '#000000'
  );
  const [adaptiveHalo, setAdaptiveHalo] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const outcome = useMemo(() => renderFormulaSafely(latex), [latex]);
  const isEmpty = !latex.trim() || !outcome.cleanedLatex.trim();

  if (!isOpen) return null;

  // 动态计算微发光样式用于弹窗内实时预览
  const haloFilter = useMemo(() => {
    if (bgMode !== 'checker' || !adaptiveHalo) return undefined;
    let col = textColor;
    if (col === 'default') col = '#0f172a';
    const isLight = isColorLight(col);
    const halo = isLight ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)';
    return `drop-shadow(0 0 2px ${halo}) drop-shadow(0 0 1px ${halo})`;
  }, [bgMode, adaptiveHalo, textColor]);

  const handleCopy = async () => {
    if (isEmpty) {
      onToast(t.toastFormulaEmpty, 'error');
      return;
    }
    setIsProcessing(true);
    try {
      if (format === 'png') {
        const res = await exportPng(latex, bgMode, textColor, true, {
          scale,
          adaptiveHalo,
          textColor,
        });
        onToast(res.message || t.toastCopiedPng, 'success');
      } else if (format === 'svg') {
        await exportSvg(latex, true, textColor, { textColor });
        onToast(t.toastCopiedSvg, 'success');
      } else if (format === 'mathml') {
        copyMathMl(latex);
        onToast(t.toastCopiedMathMl, 'success');
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      onToast(msg, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (isEmpty) {
      onToast(t.toastFormulaEmpty, 'error');
      return;
    }
    setIsProcessing(true);
    try {
      if (format === 'png') {
        const res = await exportPng(latex, bgMode, textColor, false, {
          scale,
          adaptiveHalo,
          textColor,
        });
        onToast(res.message || t.toastDownloadedPng, 'success');
      } else if (format === 'svg') {
        await exportSvg(latex, false, textColor, { textColor });
        onToast(t.toastDownloadedSvg, 'success');
      } else if (format === 'mathml') {
        copyMathMl(latex);
        onToast(t.toastCopiedMathMl, 'success');
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      onToast(msg, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{ display: 'flex' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card export-settings-modal" style={{ maxWidth: '640px' }}>
        {/* 头部 */}
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <h3 style={{ margin: 0 }}>{t.exportModalTitle}</h3>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-icon"
            style={{ border: 'none' }}
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {/* 主体配置 */}
        <div className="modal-body custom-modern-scrollbar" style={{ maxHeight: '72vh', overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {/* 1. 导出格式选择 */}
          <div className="export-field-group mb-4">
            <label className="export-field-label">导出文件格式</label>
            <div className="export-format-pills">
              <button
                type="button"
                className={`export-format-pill ${format === 'png' ? 'active' : ''}`}
                onClick={() => setFormat('png')}
              >
                <strong>PNG</strong>
                <small>高分超清图片 (Word/PPT/微信)</small>
              </button>
              <button
                type="button"
                className={`export-format-pill ${format === 'svg' ? 'active' : ''}`}
                onClick={() => setFormat('svg')}
              >
                <strong>SVG</strong>
                <small>纯矢量代码 (无限放大无失真)</small>
              </button>
              <button
                type="button"
                className={`export-format-pill ${format === 'mathml' ? 'active' : ''}`}
                onClick={() => setFormat('mathml')}
              >
                <strong>MathML</strong>
                <small>Office 原生微软公式粘贴</small>
              </button>
            </div>
          </div>

          {/* 2. PNG 专属配置项 */}
          {format === 'png' && (
            <>
              {/* 分辨率倍率 */}
              <div className="export-field-group mb-4">
                <label className="export-field-label">{t.exportResolution}</label>
                <div className="export-scale-grid">
                  {[
                    { val: 1, label: t.exportScale1x },
                    { val: 2, label: t.exportScale2x },
                    { val: 3, label: t.exportScale3x },
                    { val: 4, label: t.exportScale4x },
                  ].map((item) => (
                    <label
                      key={item.val}
                      className={`export-radio-item ${scale === item.val ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="export-scale"
                        checked={scale === item.val}
                        onChange={() => setScale(item.val)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 背景底色 */}
              <div className="export-field-group mb-4">
                <label className="export-field-label">{t.exportBgLabel}</label>
                <div className="export-bg-options">
                  <button
                    type="button"
                    className={`export-bg-tile bg-opt-checker ${bgMode === 'checker' ? 'active' : ''}`}
                    onClick={() => setBgMode('checker')}
                  >
                    <span>透明棋盘底</span>
                  </button>
                  <button
                    type="button"
                    className={`export-bg-tile bg-opt-white ${bgMode === 'white' ? 'active' : ''}`}
                    onClick={() => setBgMode('white')}
                  >
                    <span>纯白底色</span>
                  </button>
                  <button
                    type="button"
                    className={`export-bg-tile bg-opt-gray ${bgMode === 'gray' ? 'active' : ''}`}
                    onClick={() => setBgMode('gray')}
                  >
                    <span>淡灰底色</span>
                  </button>
                  <button
                    type="button"
                    className={`export-bg-tile bg-opt-dark ${bgMode === 'dark' ? 'active' : ''}`}
                    onClick={() => setBgMode('dark')}
                  >
                    <span>暗夜深色</span>
                  </button>
                </div>
              </div>

              {/* 公式文字颜色控制 */}
              <div className="export-field-group mb-4">
                <label className="export-field-label">{t.exportTextColor}</label>
                <div className="export-color-pills">
                  {[
                    { id: '#000000', label: t.exportColorBlack, bg: '#000000' },
                    { id: '#ffffff', label: t.exportColorWhite, bg: '#ffffff' },
                    { id: '#1e3a8a', label: t.exportColorBlue, bg: '#1e3a8a' },
                    { id: 'default', label: t.exportColorDefault, bg: 'var(--text-main)' },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`export-color-pill ${textColor === c.id ? 'active' : ''}`}
                      onClick={() => setTextColor(c.id)}
                    >
                      <span className="color-swatch-dot" style={{ backgroundColor: c.bg }} />
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 透明背景微发光描边保护 (Adaptive Halo) */}
              {bgMode === 'checker' && (
                <div className="export-halo-box mb-4">
                  <label className="halo-checkbox-label">
                    <input
                      type="checkbox"
                      checked={adaptiveHalo}
                      onChange={(e) => setAdaptiveHalo(e.target.checked)}
                    />
                    <strong>{t.exportAdaptiveHalo}</strong>
                  </label>
                  <p className="halo-desc">{t.exportAdaptiveHaloDesc}</p>
                </div>
              )}
            </>
          )}

          {/* 实时效果预览卡片 */}
          <div className="export-preview-box">
            <span className="export-preview-badge">导出渲染模拟效果</span>
            <div
              className={`export-mini-canvas canvas-bg-${bgMode}`}
              style={{
                color: textColor === 'default' ? (bgMode === 'dark' ? '#f8fafc' : '#0f172a') : textColor,
              }}
            >
              <div
                className="export-mini-formula"
                style={{ filter: haloFilter }}
                dangerouslySetInnerHTML={{ __html: outcome.html || '<em>(公式内容为空)</em>' }}
              />
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" className="btn btn-sm" onClick={onClose} disabled={isProcessing}>
            {t.close}
          </button>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleCopy}
              disabled={isProcessing || isEmpty}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
              <span>{format === 'png' ? t.exportActionCopyPng : t.exportActionCopySvg}</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleDownload}
              disabled={isProcessing || isEmpty}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <strong>{format === 'png' ? t.exportActionDownloadPng : t.exportActionDownloadSvg}</strong>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
