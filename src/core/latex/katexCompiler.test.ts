import { describe, expect, it } from 'vitest';
import { compileDocument, compileSingleFormula, renderSymbolPreviewHtml } from './katexCompiler';

describe('single-pass KaTeX compiler', () => {
  it('outputs both rendered HTML and extracted MathML in a single compile call', () => {
    const out = compileSingleFormula('\\frac{1}{2}');
    expect(out.error).toBeNull();
    expect(out.html).toContain('katex-html');
    expect(out.mathml).toContain('<math');
    expect(out.mathml).toContain('</math>');
  });

  it('maps ParseError position accurately even after \\placeholder{} tokens', () => {
    const bad = '\\placeholder{} + \\badcmdxyz';
    const out = compileSingleFormula(bad);
    expect(out.error).not.toBeNull();
    const expectedIdx = bad.indexOf('\\badcmdxyz');
    expect(out.error!.index).toBe(expectedIdx);
    expect(out.error!.tokenLength).toBe('\\badcmdxyz'.length);
  });

  it('compiles mixed TextBlock + MathBlock documents cleanly and escapes raw text HTML', () => {
    const res = compileDocument({
      mode: 'mixed',
      singleLatex: '',
      blocks: [
        { id: 't1', type: 'text', content: '## Proof <script>alert(1)</script>\nConsider $x^2 + 1$.' },
        { id: 'm1', type: 'math', latex: '\\int_0^1 x^2\\,dx = \\frac{1}{3}' },
      ],
    });
    expect(res.hasError).toBe(false);
    expect(res.html).toContain('<h2>');
    expect(res.html).not.toContain('<script>');
    expect(res.html).toContain('&lt;script&gt;');
    expect(res.blockResults).toHaveLength(2);
  });

  it('caches repeated symbol previews', () => {
    const a = renderSymbolPreviewHtml('\\alpha');
    const b = renderSymbolPreviewHtml('\\alpha');
    expect(a).toBe(b);
    expect(a).toContain('katex');
  });
});
