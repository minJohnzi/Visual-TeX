import { describe, it, expect } from 'vitest';
import {
  normalizePastedLatex,
  stripOuterDelimitersIfEnclosed,
  stripTrailingIsolatedBackslash,
} from './pasteNormalize';

describe('normalizePastedLatex', () => {
  it('removes zero-width characters (U+200B, U+200C, U+FEFF, etc.)', () => {
    const dirty = 'x\u200B^2\u200C + \uFEFFy^2 = z^2';
    const result = normalizePastedLatex(dirty);
    expect(result.normalized).toBe('x^2 + y^2 = z^2');
    expect(result.hasZeroWidthRemoved).toBe(true);
    expect(result.wasModified).toBe(true);
  });

  it('normalizes full-width math punctuation (－, ＋, ＝, （, ）, ［, ］)', () => {
    const fullwidth = 'f（x） ＝ a ＋ b － c［i］';
    const result = normalizePastedLatex(fullwidth);
    expect(result.normalized).toBe('f(x) = a + b - c[i]');
    expect(result.hasPunctuationFixed).toBe(true);
  });

  it('cleans $x－y$ into x-y', () => {
    const input = '$x－y$';
    const result = normalizePastedLatex(input);
    expect(result.normalized).toBe('x-y');
    expect(result.hasOuterStripped).toBe(true);
    expect(result.hasPunctuationFixed).toBe(true);
  });

  it('replaces HTML space entities (&#x20;, &nbsp;, etc.) so they do not appear as literal LaTeX', () => {
    const input = 'a&#x20;+&nbsp;b&#160;=&#x0020;c';
    const result = normalizePastedLatex(input);
    expect(result.normalized).toBe('a + b = c');
    expect(result.hasHtmlEntitiesReplaced).toBe(true);
    expect(result.normalized).not.toContain('&#x20;');
    expect(result.normalized).not.toContain('&nbsp;');
  });

  it('removes trailing isolated single backslash from web copy', () => {
    const input = 'x + y \\';
    const result = normalizePastedLatex(input);
    expect(result.normalized).toBe('x + y ');
    expect(result.hasTrailingSlashFixed).toBe(true);
  });

  it('strictly preserves legitimate matrix with & and \\\\', () => {
    const matrix = 'a & b \\\\ c & d';
    const result = normalizePastedLatex(matrix);
    expect(result.normalized).toBe('a & b \\\\ c & d');
    expect(result.normalized).toContain('&');
    expect(result.normalized).toContain('\\\\');

    const matrixTrailingBreak = 'a & b \\\\ c & d \\\\';
    const resultTrailing = normalizePastedLatex(matrixTrailingBreak);
    expect(resultTrailing.normalized).toBe('a & b \\\\ c & d \\\\');
  });

  it('strips single outer delimiters ($...$, $$...$$, \\(...\\), \\[...\\])', () => {
    expect(normalizePastedLatex('$E = mc^2$').normalized).toBe('E = mc^2');
    expect(normalizePastedLatex('$$\\int_0^1 x dx$$').normalized).toBe('\\int_0^1 x dx');
    expect(normalizePastedLatex('\\(a + b\\)').normalized).toBe('a + b');
    expect(normalizePastedLatex('\\[x^2\\]').normalized).toBe('x^2');
    expect(
      normalizePastedLatex('\\begin{equation}\nx = 1\n\\end{equation}').normalized
    ).toBe('x = 1');
  });

  it('does NOT strip internal dollar signs in mixed text or expressions', () => {
    const mixed = '$a$ + $b$';
    const result = stripOuterDelimitersIfEnclosed(mixed);
    expect(result.hadOuter).toBe(false);
    expect(result.stripped).toBe('$a$ + $b$');
  });

  it('preserves user macros like \\boldsymbol, \\mathcal without altering', () => {
    const raw = '\\boldsymbol{v} \\times \\mathcal{F}';
    const result = normalizePastedLatex(raw);
    expect(result.normalized).toBe(raw);
  });
});
