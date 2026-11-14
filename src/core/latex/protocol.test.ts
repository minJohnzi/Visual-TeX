import { describe, expect, it } from 'vitest';
import {
  autoWrapNakedChinese,
  findNextPlaceholder,
  normalizeCjkAndPunctuation,
  normalizeFullwidthPunctuation,
  normalizePastedLatex,
  sanitizeMathForDisplay,
  stripOuterDelimitersIfEnclosed,
  stripPlaceholdersForExport,
  stripTrailingIsolatedBackslash,
  wrapWithDelimiter,
} from './protocol';

describe('protocol utilities', () => {
  it('strips invisible directional/zero-width chars and HTML whitespace entities', () => {
    const dirty = '\u200Bx&nbsp;+&#160;y&#x20;=&ensp;z\uFEFF';
    expect(normalizePastedLatex(dirty)).toBe('x + y = z');
  });

  it('unwraps single outer delimiters without stripping internal multi-inline expressions', () => {
    expect(normalizePastedLatex('$$\\frac{a}{b}$$')).toBe('\\frac{a}{b}');
    expect(normalizePastedLatex('\\[E = mc^2\\]')).toBe('E = mc^2');
    expect(normalizePastedLatex('\\(a + b\\)')).toBe('a + b');
    expect(normalizePastedLatex('\\begin{equation}\nx^2 + y^2 = r^2\n\\end{equation}')).toBe(
      'x^2 + y^2 = r^2'
    );
    expect(normalizePastedLatex('\\begin{equation*}x = 1\\end{equation*}')).toBe('x = 1');
    expect(normalizePastedLatex('$a + b$')).toBe('a + b');
    expect(stripOuterDelimitersIfEnclosed('$a$ + $b$')).toBe('$a$ + $b$');
  });

  it('normalizes pasted fullwidth math symbols while preserving line breaks', () => {
    expect(normalizePastedLatex('f（x） ＝ a ＋ b － c［i］')).toBe('f(x) = a + b - c[i]');
    expect(normalizePastedLatex('x ， y · z × 2 ÷ 3')).toBe('x , y \\cdot  z \\times  2 \\div  3');
  });

  it('strips trailing isolated odd backslash while preserving \\\\ and &', () => {
    expect(stripTrailingIsolatedBackslash('a + b \\')).toBe('a + b');
    expect(stripTrailingIsolatedBackslash('a \\\\')).toBe('a \\\\');
    expect(stripTrailingIsolatedBackslash('a & b \\\\')).toBe('a & b \\\\');
  });

  it('wraps LaTeX cleanly with configured delimiters', () => {
    expect(wrapWithDelimiter('E = mc^2', 'none')).toBe('E = mc^2');
    expect(wrapWithDelimiter('E = mc^2', 'inline')).toBe('$E = mc^2$');
    expect(wrapWithDelimiter('$E = mc^2$', 'display')).toBe('$$\nE = mc^2\n$$');
    expect(wrapWithDelimiter('\\[E = mc^2\\]', 'equation')).toBe(
      '\\begin{equation}\nE = mc^2\n\\end{equation}'
    );
  });

  it('navigates canonical \\placeholder{} slots and wraps around cleanly', () => {
    const tpl = '\\frac{\\placeholder{}}{\\placeholder{}}';
    const first = findNextPlaceholder(tpl, 0);
    expect(first).not.toBeNull();
    expect(tpl.slice(first!.start, first!.end)).toBe('\\placeholder{}');

    const second = findNextPlaceholder(tpl, first!.end);
    expect(second).not.toBeNull();
    expect(second!.start).toBeGreaterThan(first!.start);

    const wrapped = findNextPlaceholder(tpl, second!.end);
    expect(wrapped?.start).toBe(first!.start);
  });

  it('sanitizes placeholders differently for preview vs final export', () => {
    const src = '\\frac{\\placeholder{a}}{\\placeholder{}}';
    expect(stripPlaceholdersForExport(src)).toBe('\\frac{a}{}');
    expect(sanitizeMathForDisplay(src)).toContain('\\square');
    expect(sanitizeMathForDisplay(src)).toContain('\\frac{a}');
  });

  it('respects math-mode-only boundary in punctuation and Chinese wrapping', () => {
    const tex = 'x＝1 % 中文注释，不改\n + \\text{这里，保持原样} + 速度';
    const norm = normalizeFullwidthPunctuation(tex);
    expect(norm).toContain('x=1');
    expect(norm).toContain('% 中文注释，不改');
    expect(norm).toContain('\\text{这里，保持原样}');

    const wrapped = autoWrapNakedChinese(norm);
    expect(wrapped).toContain('\\text{速度}');
    expect(wrapped).not.toContain('\\text{\\text{这里，保持原样}}');
  });

  it('normalizes both fullwidth punctuation and naked CJK via normalizeCjkAndPunctuation', () => {
    const out = normalizeCjkAndPunctuation('x ＝ 1 ＋ 加速度（t）');
    expect(out).toBe('x = 1 + \\text{加速度}(t)');
  });
});
