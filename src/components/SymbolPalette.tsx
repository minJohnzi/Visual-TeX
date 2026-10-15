import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PALETTE_CATEGORIES, type PaletteItem } from '../data/symbols';
import { renderSymbolPreviewHtml } from '../utils/latex';
import {
  generateMatrixTemplate,
  type MatrixType,
} from '../utils/insertHandler';
import { useI18n } from '../i18n/context';

interface SymbolPaletteProps {
  onSelectItem: (item: PaletteItem) => void;
  onAppendRow?: () => void;
  onAppendColumn?: () => void;
}

const STORAGE_PALETTE_COLLAPSED_KEY = 'latex_formula_palette_collapsed';

export const SymbolPalette: React.FC<SymbolPaletteProps> = ({
  onSelectItem,
  onAppendRow,
  onAppendColumn,
}) => {
  const { t, isZh } = useI18n();
  const [activeTab, setActiveTab] = useState<string>('algebra');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_PALETTE_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // 动态矩阵生成器状态
  const [showMatrixPicker, setShowMatrixPicker] = useState<boolean>(false);
  const [matrixType, setMatrixType] = useState<MatrixType>('pmatrix');
  const [hoverRow, setHoverRow] = useState<number>(3);
  const [hoverCol, setHoverCol] = useState<number>(3);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // 点击外部收起矩阵选择弹窗
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowMatrixPicker(false);
      }
    };
    if (showMatrixPicker) {
      document.addEventListener('pointerdown', handlePointerDown);
    }
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showMatrixPicker]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_PALETTE_COLLAPSED_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const currentCategory = useMemo(() => {
    return PALETTE_CATEGORIES.find((cat) => cat.id === activeTab) || PALETTE_CATEGORIES[0];
  }, [activeTab]);

  const handleInsertDynamicMatrix = (rows: number, cols: number) => {
    const { latex, display, mathliveSnippet } = generateMatrixTemplate(matrixType, rows, cols);
    const typeLabel =
      matrixType === 'pmatrix'
        ? '( )'
        : matrixType === 'bmatrix'
        ? '[ ]'
        : matrixType === 'vmatrix'
        ? '| |'
        : '{';

    const newItem: PaletteItem = {
      label: `${rows}×${cols} ${typeLabel}`,
      labelEn: `${rows}×${cols} ${typeLabel}`,
      tooltip: `${rows}行${cols}列矩阵 (${matrixType})`,
      tooltipEn: `${rows}x${cols} Matrix (${matrixType})`,
      isMatrix: true,
      isWide: true,
      latex,
      display,
      mathliveSnippet,
    };

    onSelectItem(newItem);
    setShowMatrixPicker(false);
  };

  return (
    <section className="card-panel palette-panel" aria-label={t.paletteTitle}>
      {/* 选项卡导航与一键折叠/展开栏 */}
      <div className="palette-header-bar">
        {/* 6 大 Tab 选项卡导航 (支持移动端自然横向手势滑动) */}
        <div className="palette-tabs-nav" role="tablist">
          {PALETTE_CATEGORIES.map((cat) => {
            const isActive = cat.id === activeTab;
            const categoryName = isZh ? cat.name : cat.nameEn;
            return (
              <button
                key={cat.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                className={`palette-tab-btn ${isActive ? 'active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  setActiveTab(cat.id);
                  if (isCollapsed) {
                    setIsCollapsed(false);
                    try {
                      localStorage.setItem(STORAGE_PALETTE_COLLAPSED_KEY, 'false');
                    } catch {
                      // ignore
                    }
                  }
                }}
              >
                <span className="palette-tab-icon">{cat.icon}</span>
                <span className="palette-tab-name">{categoryName}</span>
              </button>
            );
          })}
        </div>

        {/* 一键折叠 / 展开面板按钮 (移动端空间释放核心体验) */}
        <button
          type="button"
          className="palette-collapse-toggle-btn"
          onClick={toggleCollapse}
          title={t.paletteToggleTooltip}
          aria-expanded={!isCollapsed}
          onMouseDown={(e) => e.preventDefault()}
        >
          {isCollapsed ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
              <span className="collapse-text">{t.expandPalette}</span>
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m18 15-6-6-6 6" />
              </svg>
              <span className="collapse-text">{t.collapsePalette}</span>
            </>
          )}
        </button>
      </div>

      {/* 矩阵分类专属控制条（动态网格维度选择器 + 快捷加行加列） */}
      {!isCollapsed && activeTab === 'matrix' && (
        <div className="matrix-tools-bar">
          <div className="matrix-tools-left" ref={pickerRef}>
            <button
              type="button"
              className={`btn btn-sm ${showMatrixPicker ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setShowMatrixPicker((prev) => !prev)}
              onMouseDown={(e) => e.preventDefault()}
              title={t.matrixDimensionHint}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M3 9h18" />
                <path d="M3 15h18" />
                <path d="M9 3v18" />
                <path d="M15 3v18" />
              </svg>
              <strong>{t.matrixDimensionSelector}</strong>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {/* 动态 1×1 ~ 6×6 矩阵维度悬浮面板 */}
            {showMatrixPicker && (
              <div className="matrix-picker-popover">
                <div className="matrix-picker-types">
                  {[
                    { id: 'pmatrix' as MatrixType, label: '( ) 圆括号' },
                    { id: 'bmatrix' as MatrixType, label: '[ ] 方括号' },
                    { id: 'vmatrix' as MatrixType, label: '| | 行列式' },
                    { id: 'cases' as MatrixType, label: '{ 方程组' },
                  ].map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      className={`matrix-type-btn ${matrixType === type.id ? 'active' : ''}`}
                      onClick={() => setMatrixType(type.id)}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>

                {/* 6x6 交互式网格 */}
                <div
                  className="matrix-grid-cells"
                  onMouseLeave={() => {
                    setHoverRow(hoverRow || 3);
                    setHoverCol(hoverCol || 3);
                  }}
                >
                  {Array.from({ length: 6 }).map((_, rIdx) => {
                    const row = rIdx + 1;
                    return (
                      <div key={`row-${row}`} className="matrix-grid-row">
                        {Array.from({ length: 6 }).map((_, cIdx) => {
                          const col = cIdx + 1;
                          const isHovered = row <= hoverRow && col <= hoverCol;
                          return (
                            <button
                              key={`cell-${row}-${col}`}
                              type="button"
                              className={`matrix-grid-cell ${isHovered ? 'hovered' : ''}`}
                              onMouseEnter={() => {
                                setHoverRow(row);
                                setHoverCol(col);
                              }}
                              onClick={() => handleInsertDynamicMatrix(row, col)}
                              onMouseDown={(e) => e.preventDefault()}
                              title={`${row} 行 × ${col} 列`}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                <div className="matrix-picker-footer">
                  <span className="matrix-dim-text">
                    {hoverRow} × {hoverCol} {matrixType}
                  </span>
                  <small style={{ color: 'var(--text-muted)' }}>点击即可插入</small>
                </div>
              </div>
            )}
          </div>

          <div className="matrix-tools-right">
            {onAppendRow && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={onAppendRow}
                onMouseDown={(e) => e.preventDefault()}
                title={t.matrixAddRowTooltip}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>{t.matrixAddRow}</span>
              </button>
            )}

            {onAppendColumn && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={onAppendColumn}
                onMouseDown={(e) => e.preventDefault()}
                title={t.matrixAddColTooltip}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>{t.matrixAddCol}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 符号按钮网格：支持一键折叠/展开、自适应栅格与流畅滚动 */}
      {!isCollapsed && (
        <div className="palette-grid-wrapper scroll-smooth custom-modern-scrollbar">
          <div className={`palette-grid ${activeTab === 'matrix' ? 'palette-grid-matrix' : 'palette-grid-standard'}`}>
            {currentCategory.items.map((item, index) => {
              const previewHtml = renderSymbolPreviewHtml(item.display || item.latex.replace(/\\square/g, '\\Box'));
              const itemLabel = isZh ? item.label : (item.labelEn || item.label);
              const tooltipDesc = isZh
                ? (item.tooltip || item.label)
                : (item.tooltipEn || item.labelEn || item.label);

              const isMatrix =
                item.isMatrix ||
                Boolean(item.display && (
                  item.display.includes('matrix') ||
                  item.display.includes('cases') ||
                  item.display.includes('aligned')
                ));

              const isWide = item.isWide || isMatrix;

              return (
                <button
                  key={`${item.label}-${index}`}
                  type="button"
                  className={`symbol-btn relative overflow-hidden ${isWide ? 'symbol-btn-wide' : 'symbol-btn-compact'}`}
                  title={`${tooltipDesc} (${t.clickToInsert})`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    onSelectItem(item);
                  }}
                >
                  <div
                    className={`symbol-preview ${isMatrix ? 'symbol-preview-matrix' : ''}`}
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                  <div className="symbol-label" title={tooltipDesc}>
                    {itemLabel}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
