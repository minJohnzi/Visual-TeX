import { describe, expect, it } from 'vitest';
import {
  autoFixLatexSyntax,
  deriveNextStepLatex,
  detectFormulaMode,
  estimateFormulaLineCount,
  formatMultilineLatex,
  mathfieldToSourceLatex,
  sourceToMathfieldLatex,
  unwrapDisplaylines,
} from './bridge';
import { splitTopLevelLineBreaks } from './scanner';

describe('bridge and structural multiline conversions', () => {
  it('unwraps balanced \\displaylines{...} containing nested braces', () => {
    expect(unwrapDisplaylines('\\displaylines{\\frac{a}{b} \\\\ c + d}')).toBe(
      '\\frac{a}{b} \\\\ c + d'
    );
  });

  it('splits top-level line breaks without touching nested environments', () => {
    const expr =
      'f(x) = \\begin{cases} x^2, & x \\ge 0 \\\\ -x, & x < 0 \\end{cases} \\\\ g(x) = 1';
    const topParts = splitTopLevelLineBreaks(expr);
    expect(topParts).toHaveLength(2);
    expect(topParts[0]).toContain('\\begin{cases}');
    expect(topParts[1].trim()).toBe('g(x) = 1');
  });

  it('converts multiline source formulas cleanly to and from Mathfield representation', () => {
    const src = 'a = 1 \\\\\nb = 2';
    const mf = sourceToMathfieldLatex(src);
    expect(mf).toContain('\\displaylines{');

    const back = mathfieldToSourceLatex(mf);
    expect(back).toBe('a = 1 \\\\\nb = 2');

    const alignedSrc = 'x &= 1 \\\\\ny &= 2';
    expect(sourceToMathfieldLatex(alignedSrc)).toContain('\\begin{aligned}');
  });

  it('normalizes legacy #? placeholders emitted by MathLive to \\placeholder{}', () => {
    expect(mathfieldToSourceLatex('\\frac{#?}{#?}')).toBe(
      '\\frac{\\placeholder{}}{\\placeholder{}}'
    );
  });

  it('formats enclosing environment lines cleanly', () => {
    const formatted = formatMultilineLatex('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}');
    expect(formatted).toBe('\\begin{pmatrix}\n  a & b \\\\\n  c & d\n\\end{pmatrix}');
  });

  it('conservatively fixes missing closing braces and punctuation via autoFixLatexSyntax', () => {
    expect(autoFixLatexSyntax('$\\frac{a}{b$')).toBe('\\frac{a}{b}');
    expect(autoFixLatexSyntax('a ＋ b \\left( x')).toBe('a + b \\left( x \\right.');
  });

  it('detects display vs inline mode and estimates line counts', () => {
    expect(detectFormulaMode('x^2 + 1')).toBe('inline');
    expect(detectFormulaMode('\\sum_{i=1}^{n} i^2')).toBe('display');
    expect(estimateFormulaLineCount('a \\\\ b \\\\ c')).toBe(3);
  });

  it('derives next alignment step from single, multiline, matrix-LHS, and aligned equations', () => {
    expect(deriveNextStepLatex('')).toBe(
      '\\begin{aligned}\n\\placeholder{} &= \\placeholder{}\n\\end{aligned}'
    );

    expect(deriveNextStepLatex('f(x) = x^2 + 2x + 1')).toBe(
      '\\begin{aligned}\nf(x) &= x^2 + 2x + 1 \\\\\n&= x^2 + 2x + 1\n\\end{aligned}'
    );

    const chained = deriveNextStepLatex(
      '\\begin{aligned}\nf(x) &= (x + 1)^2 \\\\\n&= x^2 + 2x + 1\n\\end{aligned}'
    );
    expect(chained).toBe(
      '\\begin{aligned}\nf(x) &= (x + 1)^2 \\\\\n&= x^2 + 2x + 1 \\\\\n&= x^2 + 2x + 1\n\\end{aligned}'
    );

    const matrixLhs = deriveNextStepLatex(
      '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = I'
    );
    expect(matrixLhs).toContain('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} &= I');
    expect(matrixLhs).toContain('\\\\\n&= I');
  });
});
