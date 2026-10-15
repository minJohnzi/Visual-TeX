/**
 * 确定性 LaTeX 快捷键扩展模块
 * 支持词边界扩展与字符转换，杜绝因速度或 MathLive 状态造成的转换不一致
 */

export const SYMBOL_SHORTCUTS: Array<{ from: string; to: string }> = [
  { from: '>=', to: '\\ge' },
  { from: '<=', to: '\\le' },
  { from: '!=', to: '\\ne' },
  { from: '->', to: '\\to' },
  { from: '<-', to: '\\leftarrow' },
  { from: 'oo', to: '\\infty' },
];

export const WORD_SHORTCUTS: Array<{ from: string; to: string }> = [
  { from: 'approx', to: '\\approx' },
  { from: 'alpha', to: '\\alpha' },
  { from: 'beta', to: '\\beta' },
  { from: 'gamma', to: '\\gamma' },
  { from: 'sinh', to: '\\sinh' },
  { from: 'sin', to: '\\sin' },
  { from: 'cosh', to: '\\cosh' },
  { from: 'cos', to: '\\cos' },
  { from: 'tanh', to: '\\tanh' },
  { from: 'tan', to: '\\tan' },
  { from: 'infty', to: '\\infty' },
];

/**
 * 判断当前光标是否处于 \text{...} 或 \mbox{...} 内部
 */
export function isInsideTextCommand(text: string, offset: number): boolean {
  let depth = 0;
  let inText = false;

  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\\') {
      const rest = text.slice(i);
      if (rest.startsWith('\\text{') || rest.startsWith('\\mbox{') || rest.startsWith('\\mathrm{')) {
        inText = true;
        depth = 0;
      }
    }
    if (inText) {
      if (text[i] === '{' && (i === 0 || text[i - 1] !== '\\')) {
        depth++;
      } else if (text[i] === '}' && (i === 0 || text[i - 1] !== '\\')) {
        depth--;
        if (depth <= 0) {
          inText = false;
        }
      }
    }
  }

  return inText && depth > 0;
}

/**
 * 在用户输入特定字符（或空格/词尾）时进行确定性快捷键扩展
 */
export function tryExpandShortcut(
  text: string,
  cursor: number
): { expandedText: string; newCursor: number } | null {
  if (isInsideTextCommand(text, cursor)) {
    return null;
  }

  // 1. 优先尝试多字符符号匹配 (>=, <=, !=, ->, <-, oo)
  for (const { from, to } of SYMBOL_SHORTCUTS) {
    const len = from.length;
    if (cursor >= len && text.slice(cursor - len, cursor) === from) {
      // 避免前缀已经是转义字符
      if (cursor > len && text[cursor - len - 1] === '\\') {
        continue;
      }
      const before = text.slice(0, cursor - len);
      const after = text.slice(cursor);
      const replacement = to + (after.startsWith(' ') ? '' : ' ');
      return {
        expandedText: before + replacement + after,
        newCursor: before.length + replacement.length,
      };
    }
  }

  // 2. 单词匹配：向前寻找完整单词
  let wordStart = cursor - 1;
  while (wordStart >= 0 && /[a-zA-Z]/.test(text[wordStart])) {
    wordStart--;
  }
  wordStart++; // 单词起点

  if (wordStart < cursor) {
    const word = text.slice(wordStart, cursor);
    // 如果已经带有前导反斜杠，例如 \sin 后面输入 h -> 扩展为 \sinh
    if (wordStart > 0 && text[wordStart - 1] === '\\') {
      if (word === 'sinh') return null; // 已经是完整命令
      if (word === 'cosh') return null;
      if (word === 'tanh') return null;
      return null;
    }

    // 检查词前是否为词边界（空格、标点、开头）
    for (const { from, to } of WORD_SHORTCUTS) {
      if (word === from) {
        const before = text.slice(0, wordStart);
        const after = text.slice(cursor);
        const replacement = to + (after.startsWith(' ') ? '' : ' ');
        return {
          expandedText: before + replacement + after,
          newCursor: before.length + replacement.length,
        };
      }
    }
  }

  return null;
}
