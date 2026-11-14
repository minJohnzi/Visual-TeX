import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Grid3X3, Search, Star, Tag, X } from 'lucide-react';
import { commandBus } from '../commands/commandBus';
import { renderSymbolPreviewHtml } from '../core/latex/katexCompiler';
import { MatrixEnv, SymbolCategoryId, SymbolTemplate } from '../core/types';
import { CORE_PINNED_SYMBOLS, MATRIX_ENV_OPTIONS, PALETTE_CATEGORIES } from '../data/symbols';
import { useI18n } from '../i18n/context';
import { useAppStore } from '../store/useAppStore';

export const SymbolPalette: React.FC = () => {
  const { lang, t } = useI18n();
  const paletteCollapsed = useAppStore((s) => s.paletteCollapsed);
  const setPaletteCollapsed = useAppStore((s) => s.setPaletteCollapsed);
  const favorites = useAppStore((s) => s.favorites);
  const historyNotes = useAppStore((s) => s.historyNotes);

  const [activeCategory, setActiveCategory] = useState<SymbolCategoryId>(PALETTE_CATEGORIES[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [compactKeycaps, setCompactKeycaps] = useState(true);
  const [showAllRows, setShowAllRows] = useState(false);
  const [showMatrixPicker, setShowMatrixPicker] = useState(false);
  const [matrixEnv, setMatrixEnv] = useState<MatrixEnv>('pmatrix');
  const [hoverRows, setHoverRows] = useState(2);
  const [hoverCols, setHoverCols] = useState(2);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const displayedSymbols = useMemo<SymbolTemplate[]>(() => {
    if (!normalizedQuery) {
      if (activeCategory === 'favorites') {
        return favorites.map((favLatex, index) => {
          const note = historyNotes[favLatex];
          const compactLabel =
            note ||
            (favLatex.length > 22 ? `${favLatex.slice(0, 20)}…` : favLatex);
          return {
            id: `fav-${index}`,
            label: compactLabel,
            labelZh: compactLabel,
            labelEn: compactLabel,
            tooltipZh: note ? `${note}\n${favLatex}` : favLatex,
            tooltipEn: note ? `${note}\n${favLatex}` : favLatex,
            latex: favLatex,
            previewLatex: favLatex,
            isWide: favLatex.length > 14,
          };
        });
      }
      const cat = PALETTE_CATEGORIES.find((c) => c.id === activeCategory);
      return cat?.symbols ?? [];
    }

    const seen = new Set<string>();
    const matches: SymbolTemplate[] = [];
    for (const category of PALETTE_CATEGORIES) {
      for (const sym of category.symbols) {
        const key = sym.id ?? sym.latex;
        if (seen.has(key)) continue;
        const haystack = [
          sym.label,
          sym.labelZh ?? '',
          sym.labelEn ?? '',
          sym.tooltipZh ?? '',
          sym.tooltipEn ?? '',
          sym.latex,
          ...(sym.keywords ?? []),
        ]
          .join(' ')
          .toLowerCase();
        if (haystack.includes(normalizedQuery)) {
          seen.add(key);
          matches.push(sym);
        }
      }
    }
    return matches;
  }, [activeCategory, favorites, historyNotes, normalizedQuery]);

  const handleInsertSymbol = (symbol: SymbolTemplate) => {
    commandBus.dispatch({
      type: 'insert-template',
      latex: symbol.latex,
      wrapLatex: symbol.wrapLatex,
      mode: 'wrap-or-insert',
    });
  };

  const handlePickMatrix = (rows: number, cols: number) => {
    commandBus.dispatch({
      type: 'insert-matrix',
      env: matrixEnv,
      rows,
      cols,
    });
    setShowMatrixPicker(false);
  };

  return (
    <section className="palette-card" aria-label={t.paletteTitle}>
      <div className="palette-header">
        <div className="palette-tabs" role="tablist" aria-label={t.paletteTitle}>
          <button
            type="button"
            role="tab"
            aria-selected={!normalizedQuery && activeCategory === 'favorites'}
            className={`palette-tab palette-tab-star ${
              !normalizedQuery && activeCategory === 'favorites' ? 'is-active' : ''
            }`}
            onClick={() => {
              setSearchQuery('');
              setActiveCategory('favorites');
              setShowAllRows(false);
              if (paletteCollapsed) setPaletteCollapsed(false);
            }}
          >
            <Star size={12} fill={favorites.length > 0 ? 'currentColor' : 'none'} />
            <span>
              {t.categories.favorites} ({favorites.length})
            </span>
          </button>

          {PALETTE_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={!normalizedQuery && activeCategory === category.id}
              className={`palette-tab ${
                !normalizedQuery && activeCategory === category.id ? 'is-active' : ''
              }`}
              onClick={() => {
                setSearchQuery('');
                setActiveCategory(category.id);
                setShowAllRows(false);
                if (paletteCollapsed) setPaletteCollapsed(false);
              }}
            >
              {t.categories[category.id]}
            </button>
          ))}
        </div>

        <div className="palette-controls">
          <div className="palette-search-wrap">
            <Search size={13} className="palette-search-icon" />
            <input
              type="text"
              className="palette-search-input"
              value={searchQuery}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchPlaceholder}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (paletteCollapsed) setPaletteCollapsed(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && displayedSymbols.length > 0) {
                  e.preventDefault();
                  handleInsertSymbol(displayedSymbols[0]);
                }
              }}
            />
            {searchQuery && (
              <button
                type="button"
                className="palette-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label={t.clearSearch}
                title={t.clearSearch}
              >
                <X size={13} />
              </button>
            )}
          </div>

            <div className="matrix-picker-anchor">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowMatrixPicker((prev) => !prev)}
                aria-expanded={showMatrixPicker}
              >
                <Grid3X3 size={14} />
                <span>{t.customMatrixBtn}</span>
              </button>

              {showMatrixPicker && (
                <div className="matrix-picker-popover" role="dialog" aria-label={t.customMatrixBtn}>
                  <div className="matrix-env-pills">
                    {MATRIX_ENV_OPTIONS.map((opt) => (
                      <button
                        key={opt.env}
                        type="button"
                        className={`matrix-env-pill ${matrixEnv === opt.env ? 'is-active' : ''}`}
                        onClick={() => setMatrixEnv(opt.env)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="matrix-grid-cells">
                    {Array.from({ length: 36 }).map((_, index) => {
                      const row = Math.floor(index / 6) + 1;
                      const col = (index % 6) + 1;
                      const maxCol = matrixEnv === 'cases' ? 1 : col;
                      const isHighlighted =
                        row <= hoverRows && col <= (matrixEnv === 'cases' ? 1 : hoverCols);
                      return (
                        <button
                          key={index}
                          type="button"
                          className={`matrix-cell-btn ${isHighlighted ? 'is-highlighted' : ''}`}
                          onMouseEnter={() => {
                            setHoverRows(row);
                            setHoverCols(maxCol);
                          }}
                          onClick={() => handlePickMatrix(row, maxCol)}
                          aria-label={`${row} x ${maxCol} ${t.matrixDimensions}`}
                        />
                      );
                    })}
                  </div>

                  <div className="matrix-dim-caption">
                    {hoverRows} × {matrixEnv === 'cases' ? 1 : hoverCols} {t.matrixDimensions} ({matrixEnv})
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              className={`btn btn-sm ${!compactKeycaps ? 'is-active-toggle' : ''}`}
              onClick={() => setCompactKeycaps((prev) => !prev)}
              aria-pressed={!compactKeycaps}
              title={compactKeycaps ? t.labeledKeycapsBtn : t.compactKeycapsBtn}
            >
              <Tag size={13} />
              <span>{compactKeycaps ? t.compactKeycapsBtn : t.labeledKeycapsBtn}</span>
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPaletteCollapsed(!paletteCollapsed)}
              aria-expanded={!paletteCollapsed}
            >
              {paletteCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              <span>{paletteCollapsed ? t.paletteExpand : t.paletteCollapse}</span>
            </button>
        </div>
      </div>

      {!paletteCollapsed && (() => {
        const defaultVisibleCount = activeCategory === 'matrix' ? 10 : 14;
        const canTruncate = !normalizedQuery && displayedSymbols.length > defaultVisibleCount;
        const visibleSymbols =
          canTruncate && !showAllRows
            ? displayedSymbols.slice(0, defaultVisibleCount)
            : displayedSymbols;
        const hiddenCount =
          canTruncate && !showAllRows ? displayedSymbols.length - visibleSymbols.length : 0;

        return (
          <div className="palette-body">
            {!normalizedQuery && (
              <div className="palette-core-strip" aria-label={t.pinnedCoreLabel}>
                {CORE_PINNED_SYMBOLS.map((symbol) => {
                  const tileLabel =
                    lang === 'en'
                      ? (symbol.labelEn ?? symbol.label)
                      : (symbol.labelZh ?? symbol.label);
                  const readableCmd = symbol.latex.replace(/\\placeholder\{\}/g, '□');
                  return (
                    <button
                      key={symbol.id}
                      type="button"
                      className="symbol-btn is-core-key"
                      title={`${t.pinnedCoreLabel} · ${tileLabel} — ${readableCmd}`}
                      aria-label={tileLabel}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleInsertSymbol(symbol)}
                    >
                      <span
                        className="symbol-preview"
                        dangerouslySetInnerHTML={{
                          __html: renderSymbolPreviewHtml(symbol.previewLatex ?? symbol.latex),
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {normalizedQuery && (
              <div className="palette-search-meta">
                <span className="palette-search-count">
                  {t.searchResultsCount.replace('{count}', String(displayedSymbols.length))}
                </span>
                {displayedSymbols.length > 0 && (
                  <span className="search-enter-hint">{t.pressEnterToInsert}</span>
                )}
              </div>
            )}

            {displayedSymbols.length === 0 ? (
              <div className="palette-search-empty">
                {!normalizedQuery && activeCategory === 'favorites'
                  ? t.favoritesEmpty
                  : t.noSearchResults}
              </div>
            ) : (
              <div
                className={`palette-grid ${
                  compactKeycaps && (normalizedQuery || activeCategory !== 'favorites')
                    ? 'is-compact'
                    : ''
                }`}
              >
                {visibleSymbols.map((symbol, idx) => {
                  const tileLabel =
                    lang === 'en' ? (symbol.labelEn ?? symbol.label) : symbol.label;
                  const tooltipText =
                    lang === 'en'
                      ? (symbol.tooltipEn ?? symbol.labelEn ?? symbol.latex)
                      : (symbol.tooltipZh ?? symbol.labelZh ?? symbol.latex);
                  const readableCmd = symbol.latex.replace(/\\placeholder\{\}/g, '□');
                  const showLabel =
                    !compactKeycaps || (!normalizedQuery && activeCategory === 'favorites');
                  return (
                    <button
                      key={`${symbol.id ?? symbol.label}-${idx}`}
                      type="button"
                      className={`symbol-btn ${symbol.isWide ? 'is-wide' : ''}`}
                      title={`${tooltipText} — ${readableCmd}`}
                      aria-label={tileLabel}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleInsertSymbol(symbol)}
                    >
                      <span
                        className="symbol-preview"
                        dangerouslySetInnerHTML={{
                          __html: renderSymbolPreviewHtml(symbol.previewLatex ?? symbol.latex),
                        }}
                      />
                      {showLabel && <span className="symbol-label">{tileLabel}</span>}
                    </button>
                  );
                })}

                {canTruncate && (
                  <button
                    type="button"
                    className="symbol-btn is-more-key"
                    onClick={() => setShowAllRows((prev) => !prev)}
                    aria-expanded={showAllRows}
                  >
                    {hiddenCount > 0 ? (
                      <>
                        <span>+{hiddenCount} {t.paletteMoreSymbols}</span>
                        <ChevronDown size={12} />
                      </>
                    ) : (
                      <>
                        <span>{t.paletteLessSymbols}</span>
                        <ChevronUp size={12} />
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </section>
  );
};
