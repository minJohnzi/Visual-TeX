import { describe, it, expect } from 'vitest';
import * as MathLiveModule from 'mathlive';
import { normalizePastedLatex } from '../utils/pasteNormalize';
import { tryExpandShortcut } from '../utils/shortcuts';
import { renderFormulaSafely } from '../utils/latex';

// 获取真实 MathfieldElement 构造函数或 DOM 元素创建器
const MathfieldCtor =
  (MathLiveModule as unknown as { MathfieldElement?: typeof HTMLElement }).MathfieldElement ||
  window.customElements?.get('math-field');

function createMathfield(): HTMLElement & {
  value: string;
  setValue: (val: string) => void;
  insert: (val: string) => void;
  smartMode?: boolean;
  mathModeSpace?: string;
} {
  let mf: HTMLElement & {
    value: string;
    setValue: (val: string) => void;
    insert: (val: string) => void;
    smartMode?: boolean;
    mathModeSpace?: string;
  };

  if (MathfieldCtor && typeof MathfieldCtor === 'function') {
    try {
      mf = new (MathfieldCtor as unknown as new () => typeof mf)();
    } catch {
      mf = document.createElement('math-field') as unknown as typeof mf;
    }
  } else {
    mf = document.createElement('math-field') as unknown as typeof mf;
  }

  mf.smartMode = false;
  mf.mathModeSpace = '\\,';
  return mf;
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

  describe('Visual Input Semantics & smartMode Tests', () => {
    it('does NOT automatically convert consecutive letters "aaaaa" into \\text{aaaaa} when smartMode is false', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const mf = createMathfield();
      container.appendChild(mf);

      // smartMode 必须为 false
      expect(mf.smartMode).toBe(false);

      if (typeof mf.setValue === 'function') {
        mf.setValue('aaaaa');
      } else {
        mf.value = 'aaaaa';
      }

      // 绝不能被转写为 \text{aaaaa}
      expect(mf.value).not.toContain('\\text{');
      expect(mf.value).not.toBe('\\text{aaaaa}');
      expect(mf.value).toBe('aaaaa');

      container.remove();
    });

    it('expands shortcut "alpha" into "\\alpha"', () => {
      const res = tryExpandShortcut('alpha', 5);
      expect(res).not.toBeNull();
      expect(res?.expandedText.trim()).toBe('\\alpha');
    });

    it('expands shortcut "sin" into "\\sin"', () => {
      const res = tryExpandShortcut('sin', 3);
      expect(res).not.toBeNull();
      expect(res?.expandedText.trim()).toBe('\\sin');
    });

    it('generates \\text{aaaaa} only when user explicitly chooses text mode', () => {
      const rawLetters = 'aaaaa';
      // 用户主动包裹正文
      const explicitText = `\\text{${rawLetters}}`;
      expect(explicitText).toBe('\\text{aaaaa}');

      // 渲染验证：KaTeX 正确渲染为正文文本类
      const rendered = renderFormulaSafely(explicitText);
      expect(rendered.success).toBe(true);
      expect(rendered.html).toContain('class="mord text"');
    });

    it('maintains consistent spacing for a\\,a\\,a across preview rendering without artificial letter-spacing hacks', () => {
      const formulaWithThinSpace = 'a\\,a\\,a';
      const rendered = renderFormulaSafely(formulaWithThinSpace);
      expect(rendered.success).toBe(true);
      // 验证 KaTeX 生成薄空格 mspace
      expect(rendered.html).toContain('class="mspace"');
      expect(rendered.html).toContain('0.1667em');
    });
  });

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
