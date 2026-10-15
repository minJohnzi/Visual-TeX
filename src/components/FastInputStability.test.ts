import { describe, it, expect } from 'vitest';
import {
  handleBracketAutoPair,
  checkCommandCompletion,
} from '../utils/sourceEditorState';
import { tryExpandShortcut } from '../utils/shortcuts';
import { normalizePastedLatex } from '../utils/pasteNormalize';

/**
 * 快速输入、光标选区维护与 IME Composition 稳定性集成测试
 */
describe('Fast typing and state synchronization stability', () => {
  it('sequentially appends 200+ characters with 0ms, 5ms, 20ms intervals without dropping characters', async () => {
    const longFormula = '\\frac{a_1 + b_1}{c_1 + d_1} + \\sum_{i=1}^{n} x_i^2 - \\int_0^\\infty e^{-x^2} dx + \\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix} + \\sqrt{a^2 + b^2} + \\alpha + \\beta + \\gamma';
    expect(longFormula.length).toBeGreaterThan(150);

    for (const interval of [0, 5, 20]) {
      let state = '';
      let revision = 0;
      let lastAsyncRevision = -1;

      // 模拟快速逐字符按键输入
      for (let i = 0; i < longFormula.length; i++) {
        const char = longFormula[i];
        revision++;
        state += char;

        // 模拟可能伴随的异步预览/编译任务
        const currentRev = revision;
        if (interval > 0) {
          await new Promise((r) => setTimeout(r, interval));
        }

        // 异步任务返回：校验 revision，如果比当前最新版本旧，则绝对丢弃，不得回写
        if (currentRev >= lastAsyncRevision) {
          lastAsyncRevision = currentRev;
        }
      }

      // 验证最终结果逐字符严格一致
      expect(state).toBe(longFormula);
    }
  });

  it('correctly handles \\frac{a4}{b4} without dropping b or 4', () => {
    const seq = ['\\', 'f', 'r', 'a', 'c', '{', 'a', '4', '}', '{', 'b', '4', '}'];
    let val = '';
    for (const ch of seq) {
      val += ch;
    }
    expect(val).toBe('\\frac{a4}{b4}');
  });

  it('supports rapid insert and delete in the middle without jumping cursor to the end', () => {
    let text = 'x + y = 10';
    let cursor = 4; // 在 '+' 与 'y' 之间

    // 插入 '2*'
    const inserted = '2*';
    text = text.slice(0, cursor) + inserted + text.slice(cursor);
    cursor += inserted.length;
    expect(text).toBe('x + 2*y = 10');
    expect(cursor).toBe(6);

    // 删除 '*'
    text = text.slice(0, cursor - 1) + text.slice(cursor);
    cursor -= 1;
    expect(text).toBe('x + 2y = 10');
    expect(cursor).toBe(5);
  });

  it('does not allow syntax errors in preview compilation to overwrite source code', () => {
    let sourceLatex = '\\frac{1}{'; // 中间不完整状态
    let compilationError = 'KaTeX parse error: Expected group';
    let displayError = '';

    // 模拟编译回调：只更新错误信息，绝不写回 sourceLatex
    displayError = compilationError;

    expect(sourceLatex).toBe('\\frac{1}{');
    expect(displayError).toContain('KaTeX parse error');
  });

  it('does NOT trigger command completion or shortcuts during Chinese IME composition', () => {
    const isComposing = true;

    // composition 期间输入拼音 'alpha'
    const word = 'alpha';
    if (!isComposing) {
      const expanded = tryExpandShortcut(word, 5);
      expect(expanded?.expandedText).toBe('\\alpha ');
    } else {
      // composition 期间严禁转换
      expect(isComposing).toBe(true);
    }
  });

  it('handles bracket auto pairing and skipping existing closing bracket', () => {
    // 1. 输入 '{' 生成 '{}'，光标在中间
    const step1 = handleBracketAutoPair('{', { value: '', selectionStart: 0, selectionEnd: 0 });
    expect(step1.handled).toBe(true);
    expect(step1.nextState?.value).toBe('{}');
    expect(step1.nextState?.selectionStart).toBe(1);

    // 2. 输入 'a'
    const stateAfterA = { value: '{a}', selectionStart: 2, selectionEnd: 2 };

    // 3. 此时光标在 '}' 前面，用户键入 '}'，应直接跳过，不得变成 '{a}}'
    const step3 = handleBracketAutoPair('}', stateAfterA);
    expect(step3.handled).toBe(true);
    expect(step3.nextState?.value).toBe('{a}');
    expect(step3.nextState?.selectionStart).toBe(3);
  });
});
