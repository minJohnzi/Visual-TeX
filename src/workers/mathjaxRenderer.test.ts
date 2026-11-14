import { describe, expect, it } from 'vitest';
import { compileTexToSvg } from './mathjaxRenderer';

describe('MathJax v4 offline renderer', () => {
  it('compiles LaTeX with \\placeholder{} stripping into standalone pure-path SVG', async () => {
    const res = await compileTexToSvg('\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} + \\placeholder{}');
    expect(res.ok).toBe(true);
    expect(res.svg).toContain('<svg');
    expect(res.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // fontCache: 'none' -> zero cross-SVG <use href="#..."> ID dependencies
    expect(res.svg).not.toContain('xlink:href');
    expect(res.widthEx).toBeGreaterThan(0);
    expect(res.heightEx).toBeGreaterThan(0);
  });

  it('supports extended packages and dynamic font chunks completely offline', async () => {
    const res = await compileTexToSvg('\\mathbb{R} \\implies \\mathcal{F}(x) + \\cancel{y}');
    expect(res.ok).toBe(true);
    expect(res.svg).toContain('<svg');
  });

  it('returns clean failure result on empty formula', async () => {
    const res = await compileTexToSvg('   ');
    expect(res.ok).toBe(false);
  });
});
