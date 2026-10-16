/**
 * 剪贴板粘贴与 LaTeX 符号规范化工具
 * 清洗不可见零宽字符、智能归一化中文全角标点、处理 HTML 空格实体、
 * 清除网页复制产生的末尾孤立单反斜杠，并剥离外层唯一包裹定界符。
 *
 * 绝对保障：
 * 1. 绝不删除矩阵或多行环境中合法的 \\
 * 2. 绝不破坏矩阵及环境中的 &
 */

/**
 * 不可见零宽字符匹配正则
 * U+200B (Zero-width space)
 * U+200C (Zero-width non-joiner)
 * U+200D (Zero-width joiner)
 * U+FEFF (Zero-width no-break space / BOM)
 * U+200E (LRM), U+200F (RLM)
 * U+202A - U+202E (Directional formatting)
 */
const ZERO_WIDTH_REGEX = /[\u200B-\u200F\u202A-\u202E\uFEFF]/g;

/**
 * HTML 明确空格实体匹配正则
 * &#x20;, &#32;, &nbsp;, &#160;, &#xA0;, &ensp;, &emsp;, &thinsp;
 */
const HTML_SPACE_ENTITIES_REGEX = /&(?:#x0*20|#0*32|nbsp|#0*160|#x0*a0|ensp|emsp|thinsp);/gi;

/**
 * 全角数学标点归一化映射表
 */
const FULLWIDTH_PUNCTUATION_MAP: Record<string, string> = {
  '（': '(',
  '）': ')',
  '［': '[',
  '］': ']',
  '【': '[',
  '】': ']',
  '｛': '{',
  '｝': '}',
  '，': ',',
  '；': ';',
  '：': ':',
  '－': '-',
  '＋': '+',
  '＝': '=',
  '＜': '<',
  '＞': '>',
  '／': '/',
  '＼': '\\',
  '～': '~',
  '｜': '|',
  '·': '\\cdot ',
  '×': '\\times ',
  '÷': '\\div ',
};

/**
 * 剥离外层唯一的一组数学定界符（如 $...$, $$...$$, \(...\), \[...\], \begin{equation}...\end{equation}）
 * 注意：必须保证定界符包裹的是整个字符串，不能误删内部独立公式中的 $
 */
export function stripOuterDelimitersIfEnclosed(text: string): { stripped: string; hadOuter: boolean } {
  const trimmed = text.trim();
  if (trimmed.length < 2) return { stripped: trimmed, hadOuter: false };

  // 1. $$ ... $$
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
    const inner = trimmed.slice(2, -2).trim();
    // 检查内部是否有多余的未转义 $$
    if (!inner.includes('$$')) {
      return { stripped: inner, hadOuter: true };
    }
  }

  // 2. \[ ... \]
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length >= 4) {
    const inner = trimmed.slice(2, -2).trim();
    return { stripped: inner, hadOuter: true };
  }

  // 3. \( ... \)
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)') && trimmed.length >= 4) {
    const inner = trimmed.slice(2, -2).trim();
    return { stripped: inner, hadOuter: true };
  }

  // 4. \begin{equation} ... \end{equation} (或 equation*)
  const eqMatch = trimmed.match(/^\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}$/);
  if (eqMatch) {
    return { stripped: eqMatch[1].trim(), hadOuter: true };
  }

  // 5. $ ... $ （需确保首尾是唯一闭合区间，而不是 $a$ + $b$）
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && !trimmed.startsWith('$$')) {
    const inner = trimmed.slice(1, -1).trim();
    // 检查内部是否存在未转义的单个 $
    let internalDollarCount = 0;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '$' && (i === 0 || inner[i - 1] !== '\\')) {
        internalDollarCount++;
      }
    }
    if (internalDollarCount === 0) {
      return { stripped: inner, hadOuter: true };
    }
  }

  return { stripped: trimmed, hadOuter: false };
}

/**
 * 清除明确来自网页复制的末尾孤立单反斜杠 (例如末尾由于网页排版复制产生的单个 \)
 * 核心要求：
 * - 绝不能删除矩阵或多行环境中合法的 \\ (偶数个反斜杠)
 * - 仅当末尾有奇数个反斜杠时，删除最后一个单反斜杠
 */
export function stripTrailingIsolatedBackslash(str: string): { result: string; removed: boolean } {
  // 匹配末尾可能带空白的连续反斜杠序列
  const match = str.match(/(\\+)\s*$/);
  if (match) {
    const slashes = match[1];
    // 若反斜杠数量为奇数（如 1、3 等），则末尾存在孤立的单个反斜杠
    if (slashes.length % 2 === 1) {
      const lastSlashIdx = str.lastIndexOf('\\');
      const result = str.slice(0, lastSlashIdx) + str.slice(lastSlashIdx + 1);
      return { result, removed: true };
    }
  }
  return { result: str, removed: false };
}

/**
 * 粘贴内容清洗与符号规范化
 */
export function normalizePastedLatex(rawText: string): {
  normalized: string;
  hasZeroWidthRemoved: boolean;
  hasPunctuationFixed: boolean;
  hasOuterStripped: boolean;
  hasHtmlEntitiesReplaced: boolean;
  hasTrailingSlashFixed: boolean;
  wasModified: boolean;
} {
  if (!rawText) {
    return {
      normalized: '',
      hasZeroWidthRemoved: false,
      hasPunctuationFixed: false,
      hasOuterStripped: false,
      hasHtmlEntitiesReplaced: false,
      hasTrailingSlashFixed: false,
      wasModified: false,
    };
  }

  let text = rawText;
  let hasZeroWidthRemoved = false;
  let hasPunctuationFixed = false;
  let hasHtmlEntitiesReplaced = false;

  // 1. 清除零宽不可见字符
  if (ZERO_WIDTH_REGEX.test(text)) {
    hasZeroWidthRemoved = true;
    text = text.replace(ZERO_WIDTH_REGEX, '');
  }

  // 2. 处理 &#x20; 和 &nbsp; 等明确 HTML 空格实体
  if (HTML_SPACE_ENTITIES_REGEX.test(text)) {
    hasHtmlEntitiesReplaced = true;
    text = text.replace(HTML_SPACE_ENTITIES_REGEX, ' ');
  }

  // 3. 剥离外层唯一数学定界符 ($...$, $$...$$, \(...\), \[...\])
  const { stripped, hadOuter } = stripOuterDelimitersIfEnclosed(text);
  text = stripped;

  // 4. 全角数学标点归一化
  let buffer = '';
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const ch = text[i];
    if (FULLWIDTH_PUNCTUATION_MAP[ch]) {
      buffer += FULLWIDTH_PUNCTUATION_MAP[ch];
      hasPunctuationFixed = true;
    } else {
      buffer += ch;
    }
  }
  text = buffer;

  // 5. 清除末尾孤立单反斜杠 (绝不破坏 \\ 与 &)
  const { result: withoutTrailingSlash, removed: hasTrailingSlashFixed } = stripTrailingIsolatedBackslash(text);
  text = withoutTrailingSlash;

  const wasModified = text !== rawText;
  return {
    normalized: text,
    hasZeroWidthRemoved,
    hasPunctuationFixed,
    hasOuterStripped: hadOuter,
    hasHtmlEntitiesReplaced,
    hasTrailingSlashFixed,
    wasModified,
  };
}
