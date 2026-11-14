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

/**
 * 对齐 Symbolab (https://zs.symbolab.com/solver) 顶部双行 2×12 核心快捷输入面板
 */
export const SYMBOLAB_QUICK_PAD_ITEMS: PaletteItem[] = [
  // 第一行 (12 个)
  {
    label: '平方',
    labelEn: 'Square',
    tooltip: '平方 x²',
    tooltipEn: 'Square x²',
    latex: '^{2}',
    display: 'x^{2}',
    mathliveSnippet: '^{2}',
  },
  {
    label: '次幂',
    labelEn: 'Power',
    tooltip: '指数/上标 x^□',
    tooltipEn: 'Exponent x^□',
    latex: '^{\\square}',
    display: 'x^{\\Box}',
    mathliveSnippet: '^{#?}',
  },
  {
    label: '对数',
    labelEn: 'Log',
    tooltip: '任意底对数 log_□',
    tooltipEn: 'Logarithm log_□',
    latex: '\\log_{\\square}\\left(\\square\\right)',
    display: '\\log_{\\Box}',
    mathliveSnippet: '\\log_{#?}\\left(#?\\right)',
  },
  {
    label: '平方根',
    labelEn: 'Sqrt',
    tooltip: '算术平方根 √□',
    tooltipEn: 'Square Root √□',
    latex: '\\sqrt{\\square}',
    display: '\\sqrt{\\Box}',
    mathliveSnippet: '\\sqrt{#?}',
  },
  {
    label: 'n次根',
    labelEn: 'Nth Root',
    tooltip: 'n次根式 ⁿ√□',
    tooltipEn: 'Nth Root ⁿ√□',
    latex: '\\sqrt[\\square]{\\square}',
    display: '\\sqrt[\\Box]{\\Box}',
    mathliveSnippet: '\\sqrt[#?]{#?}',
  },
  {
    label: '小于等于',
    labelEn: 'Less/Equal',
    tooltip: '小于或等于 ≤',
    tooltipEn: 'Less than or equal ≤',
    latex: '\\le ',
    display: '\\le',
    mathliveSnippet: '\\le',
  },
  {
    label: '大于等于',
    labelEn: 'Greater/Equal',
    tooltip: '大于或等于 ≥',
    tooltipEn: 'Greater than or equal ≥',
    latex: '\\ge ',
    display: '\\ge',
    mathliveSnippet: '\\ge',
  },
  {
    label: '分式',
    labelEn: 'Fraction',
    tooltip: '标准分式 □/□',
    tooltipEn: 'Fraction □/□',
    latex: '\\frac{\\square}{\\square}',
    display: '\\frac{\\Box}{\\Box}',
    mathliveSnippet: '\\frac{#?}{#?}',
  },
  {
    label: '点乘',
    labelEn: 'Multiply Dot',
    tooltip: '中心乘点 ·',
    tooltipEn: 'Center Dot ·',
    latex: '\\cdot ',
    display: '\\cdot',
    mathliveSnippet: '\\cdot',
  },
  {
    label: '除号',
    labelEn: 'Divide',
    tooltip: '除法算子 ÷',
    tooltipEn: 'Division ÷',
    latex: '\\div ',
    display: '\\div',
    mathliveSnippet: '\\div',
  },
  {
    label: '角度',
    labelEn: 'Degree',
    tooltip: '角度符号 x°',
    tooltipEn: 'Degree x°',
    latex: '^{\\circ}',
    display: 'x^{\\circ}',
    mathliveSnippet: '^{\\circ}',
  },
  {
    label: '圆周率',
    labelEn: 'Pi',
    tooltip: '圆周率 π',
    tooltipEn: 'Pi π',
    latex: '\\pi ',
    display: '\\pi',
    mathliveSnippet: '\\pi',
  },
  // 第二行 (12 个)
  {
    label: '求导撇',
    labelEn: 'Prime',
    tooltip: '一阶导数 (□)\'',
    tooltipEn: 'Derivative Prime (□)\'',
    latex: '\\left(\\square\\right)^{\\prime}',
    display: '(\\Box)^{\\prime}',
    mathliveSnippet: '\\left(#?\\right)^{\\prime}',
  },
  {
    label: '全导数',
    labelEn: 'd/dx',
    tooltip: '微分算子 d/dx',
    tooltipEn: 'Derivative d/dx',
    latex: '\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(\\square\\right)',
    display: '\\frac{d}{dx}',
    mathliveSnippet: '\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(#?\\right)',
  },
  {
    label: '偏导数',
    labelEn: '∂/∂x',
    tooltip: '偏微分算子 ∂/∂x',
    tooltipEn: 'Partial Derivative ∂/∂x',
    latex: '\\frac{\\partial}{\\partial x}\\left(\\square\\right)',
    display: '\\frac{\\partial}{\\partial x}',
    mathliveSnippet: '\\frac{\\partial}{\\partial x}\\left(#?\\right)',
  },
  {
    label: '不定积分',
    labelEn: 'Integral',
    tooltip: '不定积分 ∫',
    tooltipEn: 'Indefinite Integral ∫',
    latex: '\\int \\square \\, \\mathrm{d}x',
    display: '\\int',
    mathliveSnippet: '\\int #? \\, \\mathrm{d}x',
  },
  {
    label: '定积分',
    labelEn: 'Def Integral',
    tooltip: '定积分 ∫_□^□',
    tooltipEn: 'Definite Integral ∫_□^□',
    latex: '\\int_{\\square}^{\\square} \\square \\, \\mathrm{d}x',
    display: '\\int_{\\Box}^{\\Box}',
    mathliveSnippet: '\\int_{#?}^{#?} #? \\, \\mathrm{d}x',
  },
  {
    label: '极限',
    labelEn: 'Limit',
    tooltip: '极限 lim',
    tooltipEn: 'Limit lim',
    latex: '\\lim_{x \\to \\square}\\left(\\square\\right)',
    display: '\\lim',
    mathliveSnippet: '\\lim_{x \\to #?}\\left(#?\\right)',
  },
  {
    label: '求和',
    labelEn: 'Sum',
    tooltip: '级数求和 ∑',
    tooltipEn: 'Summation ∑',
    latex: '\\sum_{k=0}^{n} \\square',
    display: '\\sum',
    mathliveSnippet: '\\sum_{#?}^{#?} #?',
  },
  {
    label: '无穷大',
    labelEn: 'Infinity',
    tooltip: '无穷大 ∞',
    tooltipEn: 'Infinity ∞',
    latex: '\\infty ',
    display: '\\infty',
    mathliveSnippet: '\\infty',
  },
  {
    label: 'Theta',
    labelEn: 'Theta',
    tooltip: '希腊字母 θ',
    tooltipEn: 'Greek Theta θ',
    latex: '\\theta ',
    display: '\\theta',
    mathliveSnippet: '\\theta',
  },
  {
    label: '复合函数',
    labelEn: 'Composition',
    tooltip: '复合函数 (f∘g)',
    tooltipEn: 'Function Composition (f∘g)',
    latex: '\\left(f \\circ g\\right)\\left(\\square\\right)',
    display: '(f\\circ g)',
    mathliveSnippet: '\\left(f \\circ g\\right)\\left(#?\\right)',
  },
  {
    label: '函数',
    labelEn: 'f(x)',
    tooltip: '函数 f(x)',
    tooltipEn: 'Function f(x)',
    latex: 'f\\left(x\\right)',
    display: 'f(x)',
    mathliveSnippet: 'f\\left(#?\\right)',
  },
  {
    label: '矩阵',
    labelEn: 'Matrix',
    tooltip: '2×2 矩阵',
    tooltipEn: '2×2 Matrix',
    latex: '\\begin{pmatrix} \\square & \\square \\\\ \\square & \\square \\end{pmatrix}',
    display: '\\begin{pmatrix} \\Box & \\Box \\\\ \\Box & \\Box \\end{pmatrix}',
    mathliveSnippet: '\\begin{pmatrix} #? & #? \\\\ #? & #? \\end{pmatrix}',
    isMatrix: true,
  },
];

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
    <section className="card-panel palette-panel symbolab-palette-card" aria-label={t.paletteTitle}>
      {/* Symbolab 风格顶部核心快捷区：右上角“全键盘”开关 + 2×12 高频快捷软键盘 + 底部展开箭头 */}
      <div className="symbolab-quickpad-section">
        <div className="symbolab-quickpad-topbar">
          <span className="symbolab-quickpad-brand-hint">
            {isZh ? 'Symbolab 快捷公式软键盘' : 'Symbolab Quick Math Pad'}
          </span>
          <label
            className="symbolab-fullkb-switch"
            title={t.paletteToggleTooltip}
            onMouseDown={(e) => e.preventDefault()}
          >
            <span className="symbolab-fullkb-label">
              {isZh ? '全键盘' : 'Full Keyboard'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={!isCollapsed}
              className={`symbolab-switch-track ${!isCollapsed ? 'checked' : ''}`}
              onClick={toggleCollapse}
              onMouseDown={(e) => e.preventDefault()}
            >
              <span className="symbolab-switch-thumb" />
            </button>
          </label>
        </div>

        <div className="symbolab-quickpad-well">
          <div className="symbolab-quickpad-grid">
            {SYMBOLAB_QUICK_PAD_ITEMS.map((item, idx) => {
              const previewHtml = renderSymbolPreviewHtml(
                item.display || item.latex.replace(/\\square/g, '\\Box')
              );
              const tooltipDesc = isZh
                ? item.tooltip || item.label
                : item.tooltipEn || item.labelEn || item.label;
              return (
                <button
                  key={`symbolab-quick-${idx}`}
                  type="button"
                  className={`symbolab-quick-btn ${item.isMatrix ? 'is-matrix-btn' : ''}`}
                  title={`${tooltipDesc} (${t.clickToInsert})`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    onSelectItem(item);
                  }}
                >
                  <span
                    className={`symbolab-quick-preview ${item.isMatrix ? 'symbol-preview-matrix' : ''}`}
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="symbolab-quickpad-chevron-row">
          <button
            type="button"
            className={`symbolab-chevron-btn ${!isCollapsed ? 'expanded' : ''}`}
            onClick={toggleCollapse}
            onMouseDown={(e) => e.preventDefault()}
            title={isCollapsed ? t.expandPalette : t.collapsePalette}
            aria-expanded={!isCollapsed}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              {isCollapsed ? <path d="m6 9 6 6 6-6" /> : <path d="m18 15-6-6-6 6" />}
            </svg>
          </button>
        </div>
      </div>

      {/* 选项卡导航与一键折叠/展开栏（当开启“全键盘”时显示完整分类标签栏） */}
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
