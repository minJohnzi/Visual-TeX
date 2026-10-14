import React, { useState, useMemo } from 'react';
import { PALETTE_CATEGORIES, type PaletteItem } from '../data/symbols';
import { renderSymbolPreviewHtml } from '../utils/latex';
import { useI18n } from '../i18n/context';

interface SymbolPaletteProps {
  onSelectItem: (item: PaletteItem) => void;
}

const STORAGE_PALETTE_COLLAPSED_KEY = 'latex_formula_palette_collapsed';

export const SymbolPalette: React.FC<SymbolPaletteProps> = ({ onSelectItem }) => {
  const { t, isZh } = useI18n();
  const [activeTab, setActiveTab] = useState<string>('algebra');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_PALETTE_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

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
                  // 防止切换分类选项卡时输入框失去焦点与光标位置
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
                    // 防止按钮点击抢夺输入框焦点，确保选区不丢失
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
