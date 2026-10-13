import React, { useState, useMemo } from 'react';
import { PALETTE_CATEGORIES, type PaletteItem } from '../data/symbols';
import { renderSymbolPreviewHtml } from '../utils/latex';
import { useI18n } from '../i18n/context';

interface SymbolPaletteProps {
  onSelectItem: (item: PaletteItem) => void;
}

export const SymbolPalette: React.FC<SymbolPaletteProps> = ({ onSelectItem }) => {
  const { t, isZh } = useI18n();
  const [activeTab, setActiveTab] = useState<string>('algebra');

  const currentCategory = useMemo(() => {
    return PALETTE_CATEGORIES.find((cat) => cat.id === activeTab) || PALETTE_CATEGORIES[0];
  }, [activeTab]);

  return (
    <section className="card-panel palette-panel" aria-label={t.paletteTitle}>
      {/* 6 大 Tab 选项卡导航 */}
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
              onClick={() => setActiveTab(cat.id)}
            >
              <span className="palette-tab-icon">{cat.icon}</span>
              <span className="palette-tab-name">{categoryName}</span>
            </button>
          );
        })}
      </div>

      {/* 符号按钮网格：支持美化滚动条与弹性自适应 */}
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
    </section>
  );
};
