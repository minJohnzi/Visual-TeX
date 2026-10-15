/**
 * 源码编辑器的状态与击键处理纯函数集合
 * 保证快速连续输入、光标与选区维护、中文 IME composition 期间无竞态
 */

export interface SourceEditorState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface KeyPressResult {
  handled: boolean;
  nextState?: SourceEditorState;
  preventAction?: boolean;
}

const BRACKET_PAIRS: Record<string, string> = {
  '{': '}',
  '(': ')',
  '[': ']',
};

const CLOSING_BRACKETS = new Set(['}', ')', ']']);

/**
 * 处理符号自动补全与跳过已有右括号逻辑：
 * 1. 输入 '{'，插入 '{}'，光标位于中间
 * 2. 光标紧邻已有 '}' 时再输入 '}'，直接跳过现有右括号，避免 '{a}}'
 * 3. 选中文本时输入配对括号，将选中文本包裹在括号中
 */
export function handleBracketAutoPair(
  key: string,
  currentState: SourceEditorState
): KeyPressResult {
  const { value, selectionStart, selectionEnd } = currentState;

  // 1. 选区包裹
  if (selectionStart !== selectionEnd && BRACKET_PAIRS[key]) {
    const selected = value.slice(selectionStart, selectionEnd);
    const open = key;
    const close = BRACKET_PAIRS[key];
    const nextVal = value.slice(0, selectionStart) + open + selected + close + value.slice(selectionEnd);
    return {
      handled: true,
      nextState: {
        value: nextVal,
        selectionStart: selectionStart + 1,
        selectionEnd: selectionEnd + 1,
      },
    };
  }

  // 2. 光标已在匹配的右括号前，用户键入相同的右括号 -> 跳过
  if (selectionStart === selectionEnd && CLOSING_BRACKETS.has(key)) {
    if (value[selectionStart] === key) {
      return {
        handled: true,
        nextState: {
          value,
          selectionStart: selectionStart + 1,
          selectionEnd: selectionStart + 1,
        },
      };
    }
  }

  // 3. 空白位置输入左括号 -> 自动补齐成对闭合
  if (selectionStart === selectionEnd && BRACKET_PAIRS[key]) {
    const open = key;
    const close = BRACKET_PAIRS[key];
    const nextVal = value.slice(0, selectionStart) + open + close + value.slice(selectionEnd);
    return {
      handled: true,
      nextState: {
        value: nextVal,
        selectionStart: selectionStart + 1,
        selectionEnd: selectionStart + 1,
      },
    };
  }

  // 4. Backspace 键：光标两侧刚好为配对括号时，同时删除成对括号
  if (key === 'Backspace' && selectionStart === selectionEnd && selectionStart > 0) {
    const prevChar = value[selectionStart - 1];
    const nextChar = value[selectionStart];
    if (BRACKET_PAIRS[prevChar] === nextChar) {
      const nextVal = value.slice(0, selectionStart - 1) + value.slice(selectionStart + 1);
      return {
        handled: true,
        nextState: {
          value: nextVal,
          selectionStart: selectionStart - 1,
          selectionEnd: selectionStart - 1,
        },
      };
    }
  }

  return { handled: false };
}

/**
 * 命令快捷槽位补全规则定义
 */
export const COMMAND_COMPLETIONS: Record<string, { snippet: string; focusOffset: number; focusLength: number }> = {
  '\\frac': { snippet: '\\frac{\\placeholder{}}{\\placeholder{}}', focusOffset: 6, focusLength: 15 },
  '\\dfrac': { snippet: '\\dfrac{\\placeholder{}}{\\placeholder{}}', focusOffset: 7, focusLength: 15 },
  '\\sqrt': { snippet: '\\sqrt{\\placeholder{}}', focusOffset: 6, focusLength: 15 },
  '\\sum': { snippet: '\\sum_{\\placeholder{}}^{\\placeholder{}}', focusOffset: 6, focusLength: 15 },
  '\\int': { snippet: '\\int_{\\placeholder{}}^{\\placeholder{}}', focusOffset: 6, focusLength: 15 },
  '\\iint': { snippet: '\\iint_{\\placeholder{}}', focusOffset: 7, focusLength: 15 },
  '\\prod': { snippet: '\\prod_{\\placeholder{}}^{\\placeholder{}}', focusOffset: 7, focusLength: 15 },
  '\\lim': { snippet: '\\lim_{\\placeholder{}}', focusOffset: 6, focusLength: 15 },
  '\\pmatrix': { snippet: '\\begin{pmatrix}\n  \\placeholder{} & \\placeholder{} \\\\\n  \\placeholder{} & \\placeholder{}\n\\end{pmatrix}', focusOffset: 19, focusLength: 15 },
  '\\bmatrix': { snippet: '\\begin{bmatrix}\n  \\placeholder{} & \\placeholder{} \\\\\n  \\placeholder{} & \\placeholder{}\n\\end{bmatrix}', focusOffset: 19, focusLength: 15 },
};

/**
 * 触发命令补全检测（在空格、Tab 或右大括号时）
 */
export function checkCommandCompletion(
  currentState: SourceEditorState
): KeyPressResult {
  const { value, selectionStart } = currentState;
  // 向前查找当前单词
  let wordStart = selectionStart - 1;
  while (wordStart >= 0 && /[a-zA-Z\\]/.test(value[wordStart])) {
    if (value[wordStart] === '\\') {
      break;
    }
    wordStart--;
  }

  if (wordStart >= 0 && value[wordStart] === '\\') {
    const cmd = value.slice(wordStart, selectionStart);
    const rule = COMMAND_COMPLETIONS[cmd];
    if (rule) {
      const nextVal = value.slice(0, wordStart) + rule.snippet + value.slice(selectionStart);
      const targetPos = wordStart + rule.focusOffset;
      return {
        handled: true,
        nextState: {
          value: nextVal,
          selectionStart: targetPos,
          selectionEnd: targetPos + rule.focusLength,
        },
      };
    }
  }

  return { handled: false };
}
