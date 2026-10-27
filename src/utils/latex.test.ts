import { describe, it, expect, vi } from 'vitest';
import {
  unwrapDisplaylines,
  sourceToMathfieldLatex,
  mathfieldToSourceLatex,
  formatMultilineLatex,
  renderFormulaSafely,
  estimateFormulaLineCount,
} from './latex';
import { insertVisualLineBreak, insertSourceLineBreak } from './insertHandler';

describe('Multi-line Formula & Line Break Optimization', () => {
  it('unwraps MathLive \\displaylines{...} into clean multi-line LaTeX source', () => {
    const rawFromMathLive = '\\displaylines{La = G_1G_2G_3G_4 \\\\ Lb}';
    const unwrapped = unwrapDisplaylines(rawFromMathLive);
    expect(unwrapped).toBe('La = G_1G_2G_3G_4 \\\\\nLb');
    expect(mathfieldToSourceLatex(rawFromMathLive)).toBe('La = G_1G_2G_3G_4 \\\\\nLb');
  });

  it('renders \\displaylines{La = G_1G_2G_3G_4 \\\\ Lb} in KaTeX without errors and left-aligns lines', () => {
    const rawFromMathLive = '\\displaylines{La = G_1G_2G_3G_4 \\\\ Lb}';
    const res = renderFormulaSafely(rawFromMathLive);
    expect(res.success).toBe(true);
    expect(res.errorMessage).toBeUndefined();
    expect(res.html).not.toContain('\\displaylines');
    expect(res.html).toContain('katex');
  });

  it('converts multi-line source LaTeX (with \\\\ or newline) to \\displaylines{...} for MathLive visual display', () => {
    const sourceWithBackslashes = 'La = G_1G_2G_3G_4 \\\\\nLb';
    expect(sourceToMathfieldLatex(sourceWithBackslashes)).toBe('\\displaylines{La = G_1G_2G_3G_4 \\\\ Lb}');

    const sourceWithPlainNewline = 'La = G_1G_2G_3G_4\nLb';
    expect(sourceToMathfieldLatex(sourceWithPlainNewline)).toBe('\\displaylines{La = G_1G_2G_3G_4 \\\\ Lb}');
  });

  it('converts top-level & aligned lines to \\begin{aligned}...\\end{aligned} for MathLive', () => {
    const alignedSource = 'f(x) &= x^2 + 1 \\\\\n&= (x-1)(x+1) + 2';
    expect(sourceToMathfieldLatex(alignedSource)).toBe(
      '\\begin{aligned}f(x) &= x^2 + 1 \\\\ &= (x-1)(x+1) + 2\\end{aligned}'
    );
  });

  it('does not wrap single-line or matrix environments in \\displaylines', () => {
    const matrixLatex = '\\begin{pmatrix}\n  a & b \\\\\n  c & d\n\\end{pmatrix}';
    expect(sourceToMathfieldLatex(matrixLatex)).toBe(matrixLatex);
  });

  it('formats multi-line plain newline formulas by adding explicit \\\\ line breaks', () => {
    const raw = 'La = G_1G_2G_3G_4\nLb = H_1H_2';
    expect(formatMultilineLatex(raw)).toBe('La = G_1G_2G_3G_4 \\\\\nLb = H_1H_2');
  });

  it('estimates line count accurately for \\displaylines and multi-line formulas', () => {
    const stats = estimateFormulaLineCount('\\displaylines{La = G_1G_2G_3G_4 \\\\ Lb}');
    expect(stats.estimatedLines).toBe(2);
    expect(stats.latexBreakCount).toBe(1);
    expect(stats.isMultiLine).toBe(true);
  });

  it('insertVisualLineBreak steps out of nested subscripts before calling addRowAfter', () => {
    let depth = 1; // Simulate cursor inside subscript _4 of G_4
    let currentVal = 'La = G_1G_2G_3G_4';

    const mockMf = {
      get value() {
        return currentVal;
      },
      set value(v: string) {
        currentVal = v;
      },
      focus: vi.fn(),
      executeCommand: vi.fn((cmd: string) => {
        if (cmd === 'addRowAfter') {
          if (depth > 0) return false; // Fails when inside subscript!
          currentVal = '\\displaylines{La = G_1G_2G_3G_4 \\\\ }';
          return true;
        }
        if (cmd === 'moveAfterParent') {
          if (depth > 0) {
            depth--;
            return true;
          }
          return false;
        }
        return false;
      }),
    } as unknown as import('mathlive').MathfieldElement;

    const resultSourceLatex = insertVisualLineBreak(mockMf);
    expect(mockMf.executeCommand).toHaveBeenCalledWith('moveAfterParent');
    expect(mockMf.executeCommand).toHaveBeenCalledWith('addRowAfter');
    expect(resultSourceLatex).toBe('La = G_1G_2G_3G_4 \\\\\n');
  });

  it('insertSourceLineBreak inserts explicit \\\\ on Shift+Enter and clean newline on Enter', () => {
    const fakeTa = {
      value: 'La = G_1G_2G_3G_4',
      selectionStart: 17,
      selectionEnd: 17,
    } as HTMLTextAreaElement;

    const shiftEnterRes = insertSourceLineBreak(fakeTa, true);
    expect(shiftEnterRes.nextValue).toBe('La = G_1G_2G_3G_4 \\\\\n');

    const plainEnterRes = insertSourceLineBreak(fakeTa, false);
    expect(plainEnterRes.nextValue).toBe('La = G_1G_2G_3G_4\n');
  });
});
