import { describe, expect, it } from 'vitest';
import { renderSymbolPreviewHtml } from '../core/latex/katexCompiler';
import { CLASSIC_FORMULAS, CORE_PINNED_SYMBOLS, PALETTE_CATEGORIES } from './symbols';

describe('symbols catalog & classics', () => {
  it('restores 150+ bilingual symbols across 6 categories and compiles every preview in KaTeX', () => {
    const allSymbols = PALETTE_CATEGORIES.flatMap((c) => c.symbols);
    expect(PALETTE_CATEGORIES).toHaveLength(6);
    expect(allSymbols.length).toBeGreaterThanOrEqual(185);

    for (const sym of allSymbols) {
      expect(sym.id).toBeTruthy();
      expect(sym.label.trim().length).toBeGreaterThan(0);
      expect(sym.labelZh?.trim().length).toBeGreaterThan(0);
      expect(sym.labelEn?.trim().length).toBeGreaterThan(0);
      expect(sym.latex.length).toBeGreaterThan(0);

      const previewHtml = renderSymbolPreviewHtml(sym.previewLatex ?? sym.latex);
      expect(previewHtml, `Symbol ${sym.id} failed KaTeX preview`).toContain('katex');
      expect(previewHtml, `Symbol ${sym.id} emitted katex-error`).not.toContain('katex-error');
    }
  });

  it('exposes Symbolab-style pinned core symbols and full-slot placeholders on multi-arg templates', () => {
    expect(CORE_PINNED_SYMBOLS).toHaveLength(16);
    for (const sym of CORE_PINNED_SYMBOLS) {
      const previewHtml = renderSymbolPreviewHtml(sym.previewLatex ?? sym.latex);
      expect(previewHtml, `Pinned ${sym.id} failed KaTeX preview`).toContain('katex');
      expect(previewHtml, `Pinned ${sym.id} emitted katex-error`).not.toContain('katex-error');
    }

    const allSymbols = PALETTE_CATEGORIES.flatMap((c) => c.symbols);
    const fullSlotIds = [
      'nth-root',
      'log10',
      'int-def',
      'sum',
      'prod',
      'deriv',
      'partial-deriv',
      'partial-second',
      'pmatrix-2x2',
      'bmatrix-2x2',
      'vmatrix-2x2',
      'cases',
    ];
    for (const id of fullSlotIds) {
      const found = allSymbols.find((s) => s.id === id);
      expect(found, `Missing symbol ${id}`).toBeDefined();
      expect(found?.latex, `Symbol ${id} should contain \\placeholder{}`).toContain(
        '\\placeholder{}'
      );
    }
  });

  it('includes energyMomentum and compiles all classic formulas cleanly', () => {
    expect(CLASSIC_FORMULAS.length).toBe(11);
    expect(CLASSIC_FORMULAS.some((c) => c.id === 'energyMomentum')).toBe(true);

    for (const formula of CLASSIC_FORMULAS) {
      const html = renderSymbolPreviewHtml(formula.latex);
      expect(html, `Classic ${formula.id} failed KaTeX`).toContain('katex');
      expect(html, `Classic ${formula.id} emitted katex-error`).not.toContain('katex-error');
    }
  });
});
