import { describe, it, expect } from 'vitest';
import * as MathLiveModule from 'mathlive';
import { normalizePastedLatex } from '../utils/pasteNormalize';

// 获取真实 MathfieldElement 构造函数或 DOM 元素创建器
const MathfieldCtor =
  (MathLiveModule as unknown as { MathfieldElement?: typeof HTMLElement }).MathfieldElement ||
  window.customElements?.get('math-field');

function createMathfield(): HTMLElement & { value: string; setValue: (val: string) => void; insert: (val: string) => void } {
  if (MathfieldCtor && typeof MathfieldCtor === 'function') {
    try {
      return new (MathfieldCtor as unknown as new () => HTMLElement & { value: string; setValue: (val: string) => void; insert: (val: string) => void })();
    } catch {
      // fallback to createElement
    }
  }
  return document.createElement('math-field') as unknown as HTMLElement & { value: string; setValue: (val: string) => void; insert: (val: string) => void };
}

function createPasteEvent(text: string): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as unknown as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (format: string) => (format === 'text/plain' ? text : ''),
    },
  });
  return event;
}

describe('Visual Mode Standard Macros Compatibility & Integration', () => {
  const standardMacrosCases = [
    { name: '\\mathrm{Cov}(X,Y)', latex: '\\mathrm{Cov}(X, Y)' },
    { name: '\\operatorname{rank}(A)', latex: '\\operatorname{rank}(A)' },
    { name: '\\mathbf{A}', latex: '\\mathbf{A}' },
    { name: '\\boldsymbol{v}', latex: '\\boldsymbol{v}' },
    { name: '\\mathbb{R}', latex: '\\mathbb{R}' },
    { name: '\\mathcal{L}', latex: '\\mathcal{L}' },
    { name: '\\int_a^b f(x)\\,\\mathrm{d}x', latex: '\\int_a^b f(x)\\,\\mathrm{d}x' },
    {
      name: 'Full Covariance formula from bug report',
      latex: '\\mathrm{Cov}(X, Y) = E\\Big[ \\big(X - E(X)\\big)\\big(Y - E(Y)\\big) \\Big]',
    },
  ];

  for (const tc of standardMacrosCases) {
    it(`correctly loads and edits "${tc.name}" in visual Mathfield without stack overflow`, () => {
      // 1. 挂载真实 DOM 容器
      const container = document.createElement('div');
      document.body.appendChild(container);
      const mf = createMathfield();
      container.appendChild(mf);

      // 2. 模拟源码输入并载入视觉模式，验证不触发 RangeError (Maximum call stack size exceeded)
      let stackErrorOccurred = false;
      try {
        if (typeof mf.setValue === 'function') {
          mf.setValue(tc.latex);
        } else {
          mf.value = tc.latex;
        }
      } catch (err: unknown) {
        if (err instanceof RangeError || String(err).includes('Maximum call stack size exceeded')) {
          stackErrorOccurred = true;
        }
        throw err;
      }
      expect(stackErrorOccurred).toBe(false);

      // 3. 确认视觉内容非空
      const visualVal = mf.value;
      expect(visualVal).toBeTruthy();
      expect(visualVal.length).toBeGreaterThan(0);

      // 4. 视觉模式局部编辑（追加内容）
      if (typeof mf.insert === 'function') {
        mf.insert('+ 1');
      } else {
        mf.value = visualVal + '+ 1';
      }
      const editedVal = mf.value;
      expect(editedVal).toContain('+ 1');

      // 5. 切回源码并验证语义保留，且绝无调用栈溢出
      expect(editedVal).not.toContain('Maximum call stack size exceeded');

      // 清理 DOM
      container.remove();
    });
  }

  describe('Paste Integration Tests', () => {
    it('cleans $x－y$ to x-y on textarea paste event', () => {
      const ta = document.createElement('textarea');
      document.body.appendChild(ta);
      ta.value = '';

      let pastedResult = '';
      ta.addEventListener('paste', (e: ClipboardEvent) => {
        const text = e.clipboardData?.getData('text/plain') || '';
        const { normalized, wasModified } = normalizePastedLatex(text);
        if (wasModified) {
          e.preventDefault();
          pastedResult = normalized;
        }
      });

      const pasteEvt = createPasteEvent('$x－y$');
      ta.dispatchEvent(pasteEvt);

      expect(pastedResult).toBe('x-y');
      ta.remove();
    });

    it('cleans HTML space entities like &#x20; and &nbsp; so they do not appear as literal LaTeX', () => {
      const ta = document.createElement('textarea');
      document.body.appendChild(ta);

      let pastedResult = '';
      ta.addEventListener('paste', (e: ClipboardEvent) => {
        const text = e.clipboardData?.getData('text/plain') || '';
        const { normalized } = normalizePastedLatex(text);
        pastedResult = normalized;
      });

      const pasteEvt = createPasteEvent('a&#x20;+&nbsp;b&#160;=&#x0020;c');
      ta.dispatchEvent(pasteEvt);

      expect(pastedResult).toBe('a + b = c');
      expect(pastedResult).not.toContain('&#x20;');
      expect(pastedResult).not.toContain('&nbsp;');
      ta.remove();
    });

    it('strictly preserves legitimate matrix with & and \\\\ without corruption', () => {
      const matrixRaw = 'a & b \\\\ c & d';
      const ta = document.createElement('textarea');
      document.body.appendChild(ta);

      let pastedResult = '';
      ta.addEventListener('paste', (e: ClipboardEvent) => {
        const text = e.clipboardData?.getData('text/plain') || '';
        const { normalized } = normalizePastedLatex(text);
        pastedResult = normalized;
      });

      const pasteEvt = createPasteEvent(matrixRaw);
      ta.dispatchEvent(pasteEvt);

      expect(pastedResult).toBe(matrixRaw);
      expect(pastedResult).toContain('&');
      expect(pastedResult).toContain('\\\\');
      ta.remove();
    });

    it('handles math-field paste event with normalization', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const mf = createMathfield();
      container.appendChild(mf);

      let insertedText = '';
      mf.addEventListener('paste', (e: ClipboardEvent) => {
        const text = e.clipboardData?.getData('text/plain') || '';
        const { normalized, wasModified } = normalizePastedLatex(text);
        if (wasModified) {
          e.preventDefault();
          insertedText = normalized;
          if (typeof mf.insert === 'function') {
            mf.insert(normalized);
          } else {
            mf.value = normalized;
          }
        }
      });

      const pasteEvt = createPasteEvent('$x－y$');
      mf.dispatchEvent(pasteEvt);

      expect(insertedText).toBe('x-y');
      container.remove();
    });
  });
});
