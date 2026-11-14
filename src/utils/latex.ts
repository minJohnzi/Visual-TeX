import katex, { ParseError } from 'katex';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 剥除公式最外层的单一包裹定界符 ($$...$$, \[...\], \(...\), $...$)
 */
export function stripOuterMathDelimiters(raw: string): {
  cleaned: string;
  wasStripped: boolean;
  delimiter?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { cleaned: '', wasStripped: false };
  }

  // 1. $$ ... $$
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
    const inner = trimmed.slice(2, -2);
    if (!inner.includes('$$')) {
      return { cleaned: inner.trim(), wasStripped: true, delimiter: '$$...$$' };
    }
  }

  // 2. \[ ... \]
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length >= 4) {
    const inner = trimmed.slice(2, -2);
    if (!inner.includes('\\[') && !inner.includes('\\]')) {
      return { cleaned: inner.trim(), wasStripped: true, delimiter: '\\[...\\]' };
    }
  }

  // 3. \( ... \)
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)') && trimmed.length >= 4) {
    const inner = trimmed.slice(2, -2);
    if (!inner.includes('\\(') && !inner.includes('\\)')) {
      return { cleaned: inner.trim(), wasStripped: true, delimiter: '\\(...\\)' };
    }
  }

  // 4. $ ... $
  if (
    trimmed.startsWith('$') &&
    !trimmed.startsWith('$$') &&
    trimmed.endsWith('$') &&
    !trimmed.endsWith('$$') &&
    trimmed.length >= 2
  ) {
    const inner = trimmed.slice(1, -1);
    const hasUnescapedDollar = /(^|[^\\])\$/.test(inner);
    if (!hasUnescapedDollar) {
      return { cleaned: inner.trim(), wasStripped: true, delimiter: '$...$' };
    }
  }

  return { cleaned: raw, wasStripped: false };
}

export type FormulaMode = 'pure-math' | 'mixed-content';

/**
 * 智能模式识别：判断内容是图文/题解混排模式 (Mixed Markdown/Math) 还是纯公式模式 (Pure Math)
 */
export function detectFormulaMode(rawText: string): {
  mode: FormulaMode;
  cleanedText: string;
  wasOuterStripped: boolean;
  outerDelimiter?: string;
} {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { mode: 'pure-math', cleanedText: '', wasOuterStripped: false };
  }

  // 优先检测最外层单一公式定界符
  const { cleaned, wasStripped, delimiter } = stripOuterMathDelimiters(trimmed);

  // 检查剥除最外层后，内部是否仍有未转义的 $ 符号
  const hasInnerDollar = /(?:^|[^\\])\$/.test(cleaned);

  if (wasStripped && !hasInnerDollar) {
    // 整体由单一最外层包裹的纯数学公式
    return {
      mode: 'pure-math',
      cleanedText: cleaned,
      wasOuterStripped: true,
      outerDelimiter: delimiter,
    };
  }

  // 定界符正则（匹配 $$...$$, \[...\], \(...\), $...$）
  const delimiterPattern = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|(?<!\\)\$(?:\\\$|[^\$\n])+?(?<!\\)\$|\\\(.*?\\\))/;
  const hasDelimiters = delimiterPattern.test(rawText);

  if (hasDelimiters) {
    // 检测定界符外部是否有非空白普通文本，或者是否包含多个独立公式块
    const withoutDelims = rawText.replace(new RegExp(delimiterPattern.source, 'g'), '');
    const hasTextOutside = withoutDelims.trim().length > 0;
    const allMatches = rawText.match(new RegExp(delimiterPattern.source, 'g')) || [];

    if (hasTextOutside || allMatches.length > 1) {
      return {
        mode: 'mixed-content',
        cleanedText: rawText,
        wasOuterStripped: false,
      };
    }
  }

  // 若无任何定界符：检查是否包含大段中文自然语言正文但无任何 LaTeX 关键词
  const hasLatexCommands = /\\[a-zA-Z]+/.test(trimmed);
  const hasCjk = /[\u4e00-\u9fa5]/.test(trimmed);

  if (hasCjk && !hasLatexCommands && trimmed.includes('\n')) {
    return {
      mode: 'mixed-content',
      cleanedText: rawText,
      wasOuterStripped: false,
    };
  }

  return {
    mode: 'pure-math',
    cleanedText: wasStripped ? cleaned : trimmed,
    wasOuterStripped: wasStripped,
    outerDelimiter: delimiter,
  };
}

/**
 * 遍历 LaTeX 源码，区分数学模式与已有文本/注释块（\text{...}, \mbox{...}, %...），
 * 仅对纯数学模式片段执行自定义转换变换函数
 */
export function transformMathModeOnly(
  latex: string,
  transformMath: (mathChunk: string) => string
): string {
  if (!latex) return '';

  let result = '';
  let i = 0;
  const len = latex.length;

  while (i < len) {
    // 1. LaTeX 注释：% 直到本行行末
    if (latex[i] === '%') {
      const nextNewline = latex.indexOf('\n', i);
      if (nextNewline === -1) {
        result += latex.slice(i);
        break;
      } else {
        result += latex.slice(i, nextNewline + 1);
        i = nextNewline + 1;
        continue;
      }
    }

    // 2. 文本模式命令：\text{, \mbox{, \mathrm{, \mathbf{, \textbf{, \textit{, \textnormal{, \textsf{, \texttt{
    const textCmdMatch = latex
      .slice(i)
      .match(/^\\(text|mbox|mathrm|mathbf|textbf|textit|textnormal|textsf|texttt)\*?\{/);

    if (textCmdMatch) {
      const prefix = textCmdMatch[0];
      const startBrace = i + prefix.length;
      let depth = 1;
      let j = startBrace;
      while (j < len && depth > 0) {
        if (latex[j] === '\\') {
          j += 2;
          continue;
        }
        if (latex[j] === '{') depth++;
        else if (latex[j] === '}') depth--;
        j++;
      }
      // 文本块保持原样
      result += latex.slice(i, j);
      i = j;
      continue;
    }

    // 3. 收集一段连续的数学模式字符，直到下一个 % 或文本模式命令
    let j = i;
    while (j < len) {
      if (latex[j] === '%') break;
      if (
        latex
          .slice(j)
          .match(/^\\(text|mbox|mathrm|mathbf|textbf|textit|textnormal|textsf|texttt)\*?\{/)
      ) {
        break;
      }
      j++;
    }

    const mathChunk = latex.slice(i, j);
    result += transformMath(mathChunk);
    i = j;
  }

  return result;
}

/**
 * 将公式中的中文全角标点符号智能转换为标准 LaTeX 半角符号
 * （仅在非 \text{...} 模式中转换，避免破坏纯文本说明）
 */
export function normalizeFullwidthPunctuation(latex: string): string {
  const map: Record<string, string> = {
    '（': '(',
    '）': ')',
    '，': ', ',
    '；': '; ',
    '：': ': ',
    '【': '[',
    '】': ']',
    '、': ', ',
    '！': '! ',
    '？': '? ',
    '“': '"',
    '”': '"',
    '‘': "'",
    '’': "'",
  };

  return transformMathModeOnly(latex, (chunk) => {
    return chunk.replace(/[（），；：【】、！？“”‘’]/g, (char) => map[char] || char);
  });
}

/**
 * 检测数学模式中未被 \text{...}, \mbox{...}, \mathrm{...} 等包裹的连续中文字符，
 * 自动将其包裹为 \text{中文内容}，消除中文下标或注释引发的 KaTeX Unicode 警告与排版异常。
 */
export function autoWrapNakedChinese(latex: string): string {
  return transformMathModeOnly(latex, (chunk) => {
    return chunk.replace(/([\u4e00-\u9fa5]+)/g, (_m, chinese) => {
      return `\\text{${chinese}}`;
    });
  });
}

/**
 * 全面智能清洗数学公式（全角符号纠正 + 裸汉字包裹）
 */
export function sanitizeMathForDisplay(latex: string): {
  sanitized: string;
  hasChineseWrapped: boolean;
  hasPunctuationFixed: boolean;
  wasModified: boolean;
} {
  const original = latex;
  const puncFixed = normalizeFullwidthPunctuation(latex);
  const chineseWrapped = autoWrapNakedChinese(puncFixed);
  return {
    sanitized: chineseWrapped,
    hasChineseWrapped: chineseWrapped !== puncFixed,
    hasPunctuationFixed: puncFixed !== original,
    wasModified: chineseWrapped !== original,
  };
}

/**
 * 格式化顶层 \\ 换行符，使其后紧跟真实换行符 \n（忽略 \begin{...}...\end{...} 与 {...} 内部）
 */
function formatTopLevelBreaksWithNewline(code: string): string {
  if (!code) return '';
  let result = '';
  let envDepth = 0;
  let braceDepth = 0;
  const len = code.length;
  let i = 0;

  while (i < len) {
    if (code[i] === '\\') {
      const rest = code.slice(i);
      const beginMatch = rest.match(/^\\begin\s*\{[^}]+\}/);
      if (beginMatch) {
        envDepth++;
        result += beginMatch[0];
        i += beginMatch[0].length;
        continue;
      }
      const endMatch = rest.match(/^\\end\s*\{[^}]+\}/);
      if (endMatch) {
        envDepth = Math.max(0, envDepth - 1);
        result += endMatch[0];
        i += endMatch[0].length;
        continue;
      }

      // 顶层 \\ 换行符
      if (
        envDepth === 0 &&
        braceDepth === 0 &&
        rest.startsWith('\\\\') &&
        (rest.length === 2 || !/[a-zA-Z]/.test(rest[2]))
      ) {
        const breakMatch = rest.match(/^(\\\\(?:[ \t]*\[[^\]]*\])?)[ \t]*(\r?\n)?/);
        if (breakMatch) {
          const breakToken = breakMatch[1];
          // 确保 \\ 前有一个空格（若前方非空且非空白）
          if (result.length > 0 && !/\s$/.test(result)) {
            result += ' ';
          }
          result += `${breakToken}\n`;
          i += breakMatch[0].length;
          continue;
        }
      }

      if (i + 1 < len) {
        result += code[i] + code[i + 1];
        i += 2;
        continue;
      }
    }

    if (code[i] === '{') {
      braceDepth++;
      result += code[i];
      i++;
      continue;
    }
    if (code[i] === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      result += code[i];
      i++;
      continue;
    }

    result += code[i];
    i++;
  }

  return result;
}

/**
 * 剥离并展开 MathLive / Plain TeX 的 \displaylines{...} 多行结构为标准多行 LaTeX
 */
export function unwrapDisplaylines(latex: string): string {
  if (!latex || !latex.includes('\\displaylines')) return latex;

  let result = latex;
  let safetyCounter = 0;

  while (result.includes('\\displaylines') && safetyCounter < 20) {
    safetyCounter++;
    const idx = result.indexOf('\\displaylines');
    if (idx === -1) break;

    const afterCmd = idx + '\\displaylines'.length;
    if (afterCmd < result.length && /[a-zA-Z]/.test(result[afterCmd])) {
      break;
    }

    let braceStart = afterCmd;
    while (braceStart < result.length && /\s/.test(result[braceStart])) {
      braceStart++;
    }

    if (braceStart >= result.length || result[braceStart] !== '{') {
      result = result.slice(0, idx) + result.slice(afterCmd).trimStart();
      continue;
    }

    let depth = 0;
    let braceEnd = -1;
    for (let i = braceStart; i < result.length; i++) {
      if (result[i] === '\\') {
        i++;
        continue;
      }
      if (result[i] === '{') {
        depth++;
      } else if (result[i] === '}') {
        depth--;
        if (depth === 0) {
          braceEnd = i;
          break;
        }
      }
    }

    const inner =
      braceEnd !== -1
        ? result.slice(braceStart + 1, braceEnd)
        : result.slice(braceStart + 1);

    const formattedInner = formatTopLevelBreaksWithNewline(inner);

    result =
      result.slice(0, idx) +
      formattedInner +
      (braceEnd !== -1 ? result.slice(braceEnd + 1) : '');
  }

  return result;
}

/**
 * 顶层多行结构扫描分析：
 * 精确跟踪 \begin{...} / \end{...} 环境深度与 { ... } 花括号深度，
 * 仅在顶层（envDepth === 0 && braceDepth === 0）识别：
 * - 顶层换行符：\\ (含可选间距 \\[4pt] 与紧随其后的 \n) 或 顶层独立换行 \n
 * - 顶层对齐符：未转义的 &
 */
export function analyzeTopLevelMultiline(code: string): {
  lines: string[];
  hasTopLevelBreak: boolean;
  hasTopLevelAmpersand: boolean;
  isMultiLine: boolean;
} {
  const lines: string[] = [];
  let current = '';
  let envDepth = 0;
  let braceDepth = 0;
  let hasTopLevelBreak = false;
  let hasTopLevelAmpersand = false;

  const len = code.length;
  let i = 0;

  while (i < len) {
    if (code[i] === '\\') {
      const rest = code.slice(i);
      const beginMatch = rest.match(/^\\begin\s*\{[^}]+\}/);
      if (beginMatch) {
        envDepth++;
        current += beginMatch[0];
        i += beginMatch[0].length;
        continue;
      }
      const endMatch = rest.match(/^\\end\s*\{[^}]+\}/);
      if (endMatch) {
        envDepth = Math.max(0, envDepth - 1);
        current += endMatch[0];
        i += endMatch[0].length;
        continue;
      }

      if (
        envDepth === 0 &&
        braceDepth === 0 &&
        rest.startsWith('\\\\') &&
        (rest.length === 2 || !/[a-zA-Z]/.test(rest[2]))
      ) {
        hasTopLevelBreak = true;
        const breakMatch = rest.match(/^\\\\(?:[ \t]*\[[^\]]*\])?[ \t]*(?:\r?\n)?/);
        const consumed = breakMatch ? breakMatch[0].length : 2;
        lines.push(current.trim());
        current = '';
        i += consumed;
        continue;
      }

      if (i + 1 < len) {
        current += code[i] + code[i + 1];
        i += 2;
        continue;
      }
    }

    if (code[i] === '{') {
      braceDepth++;
      current += code[i];
      i++;
      continue;
    }
    if (code[i] === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      current += code[i];
      i++;
      continue;
    }

    if (envDepth === 0 && braceDepth === 0 && code[i] === '&') {
      hasTopLevelAmpersand = true;
      current += code[i];
      i++;
      continue;
    }

    if (
      envDepth === 0 &&
      braceDepth === 0 &&
      (code[i] === '\n' || (code[i] === '\r' && code[i + 1] === '\n'))
    ) {
      const nlLen = code[i] === '\r' ? 2 : 1;
      lines.push(current.trim());
      current = '';
      i += nlLen;
      continue;
    }

    current += code[i];
    i++;
  }

  lines.push(current.trim());

  // 剔除未带显式 \\ 的末尾纯空白换行；若有显式 \\ (如刚按下换行)，保留末尾空行
  while (lines.length > 1 && lines[lines.length - 1] === '' && !hasTopLevelBreak) {
    lines.pop();
  }
  while (lines.length > 1 && lines[0] === '') {
    lines.shift();
  }

  const nonEmptyCount = lines.filter((l) => l.length > 0).length;
  const isMultiLine = lines.length > 1 && (nonEmptyCount > 1 || hasTopLevelBreak);

  return {
    lines,
    hasTopLevelBreak,
    hasTopLevelAmpersand,
    isMultiLine,
  };
}

/**
 * 将标准源码 LaTeX 转换为 MathLive 视觉编辑器所需的格式：
 * - 将 \square 转为 \placeholder{}
 * - 若存在顶层多行（\\ 或 \n）且未被外层环境包裹：
 *   - 含顶层 & 对齐符时包裹为 \begin{aligned} ... \end{aligned}
 *   - 无顶层 & 对齐符时包裹为 \displaylines{ ... } 以激活 MathLive 原生多行左对齐视觉编辑
 */
export function sourceToMathfieldLatex(latex: string): string {
  if (!latex) return '';
  const withPlaceholders = latex.replace(/\\square/g, '\\placeholder{}');
  const trimmed = withPlaceholders.trim();
  if (!trimmed) return withPlaceholders;

  if (/^\\displaylines\s*\{/.test(trimmed)) {
    return withPlaceholders;
  }

  const topLevel = analyzeTopLevelMultiline(withPlaceholders);
  if (!topLevel.isMultiLine && !topLevel.hasTopLevelBreak) {
    return withPlaceholders;
  }

  const innerLines = topLevel.lines.join(' \\\\ ');
  if (topLevel.hasTopLevelAmpersand) {
    return `\\begin{aligned}${innerLines}\\end{aligned}`;
  }
  return `\\displaylines{${innerLines}}`;
}

/**
 * 将 MathLive 视觉编辑器输出的 LaTeX 转换为标准、纯净的多行 LaTeX 源码
 */
export function mathfieldToSourceLatex(mfLatex: string): string {
  if (!mfLatex) return '';
  return unwrapDisplaylines(mfLatex)
    .replace(/\\differentialD(?![a-zA-Z])/g, '\\mathrm{d}')
    .replace(/\\imaginaryI(?![a-zA-Z])/g, '\\mathrm{i}')
    .replace(/\\imaginaryJ(?![a-zA-Z])/g, '\\mathrm{j}')
    .replace(/\\exponentialE(?![a-zA-Z])/g, '\\mathrm{e}')
    .replace(/\\doubleprime(?![a-zA-Z])/g, '\\prime\\prime');
}

/**
 * 格式化整理多行 LaTeX 源码排版：
 * - 展开 \displaylines{...}
 * - 将顶层多行补齐标准 \\ 换行符并清理行尾多余空白
 */
export function formatMultilineLatex(rawLatex: string): string {
  if (!rawLatex.trim()) return '';
  const unwrapped = unwrapDisplaylines(rawLatex);
  const topLevel = analyzeTopLevelMultiline(unwrapped);

  if (topLevel.isMultiLine) {
    return topLevel.lines
      .map((line, idx) => {
        const isLast = idx === topLevel.lines.length - 1;
        if (isLast) return line;
        return line ? `${line} \\\\` : '\\\\';
      })
      .join('\n')
      .trim();
  }

  return unwrapped
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();
}

/**
 * 一键语法自动修复（Auto Fix）与预览容错补全
 * 1. 剥离并展开 \displaylines{...}
 * 2. 纠正中文全角标点为标准 LaTeX 符号
 * 3. 自动给裸汉字包裹 \text{...}
 * 4. 自动将不支持的 align / align* / equation / multline 替换为 aligned / gathered
 * 5. 补齐未闭合的 \left -> \right.
 * 6. 补齐不完整 \frac{...} 的缺失项为 \Box
 * 7. 补齐末尾未闭合的花括号 {
 */
export function autoFixLatexSyntax(rawLatex: string): {
  fixed: string;
  wasModified: boolean;
} {
  if (!rawLatex.trim()) return { fixed: rawLatex, wasModified: false };

  let fixed = unwrapDisplaylines(rawLatex);

  // 1. 中文全角标点纠正
  fixed = normalizeFullwidthPunctuation(fixed);

  // 2. 裸汉字自动包裹
  fixed = autoWrapNakedChinese(fixed);

  // 3. 环境替换：align / align* / equation -> aligned, multline -> gathered
  fixed = fixed.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}');
  fixed = fixed.replace(/\\end\{align\*?\}/g, '\\end{aligned}');
  fixed = fixed.replace(/\\begin\{equation\*?\}/g, '\\begin{aligned}');
  fixed = fixed.replace(/\\end\{equation\*?\}/g, '\\end{aligned}');
  fixed = fixed.replace(/\\begin\{multline\*?\}/g, '\\begin{gathered}');
  fixed = fixed.replace(/\\end\{multline\*?\}/g, '\\end{gathered}');

  // 4. 补齐未闭合的 \left ... \right.
  const leftMatches = fixed.match(/\\left(?![a-zA-Z])/g) || [];
  const rightMatches = fixed.match(/\\right(?![a-zA-Z])/g) || [];
  if (leftMatches.length > rightMatches.length) {
    const diff = leftMatches.length - rightMatches.length;
    fixed += ' ' + Array(diff).fill('\\right.').join(' ');
  }

  // 5. 补齐未闭合的 \frac
  fixed = fixed.replace(/\\frac\{([^{}]+)\}(?!\s*\{)/g, '\\frac{$1}{\\Box}');
  fixed = fixed.replace(/\\frac\{([^{}]+)\}\{\s*$/g, '\\frac{$1}{\\Box}');
  fixed = fixed.replace(/\\frac\{\s*$/g, '\\frac{\\Box}{\\Box}');

  // 6. 统计未闭合的花括号 { (忽略转义 \{ 和 \})
  let openBraces = 0;
  for (let i = 0; i < fixed.length; i++) {
    if (fixed[i] === '\\') {
      i++;
      continue;
    }
    if (fixed[i] === '{') openBraces++;
    else if (fixed[i] === '}') openBraces = Math.max(0, openBraces - 1);
  }
  if (openBraces > 0) {
    fixed += '}'.repeat(openBraces);
  }

  return {
    fixed,
    wasModified: fixed !== rawLatex,
  };
}

/**
 * 检查公式是否已经处于多行环境或矩阵等闭合环境中
 */
export function hasEnclosingEnvironment(code: string): boolean {
  const envRegex = /\\begin\{(aligned|align\*?|gathered|gather\*?|split|cases|[a-zA-Z]*matrix|array|eqnarray\*?|multiline|multline\*?)\}/i;
  return envRegex.test(code);
}

/**
 * 纯公式预处理与多行智能包裹：
 * 1. 展开 \displaylines{...} 与占位符降级
 * 2. 中文全角标点归一化与裸汉字自动包裹
 * 3. 若顶层包含回车换行 \n 或 \\ 或 & 对齐符，自动为其包裹 \begin{aligned} ... \end{aligned}（无 & 时自动左对齐）
 */
export function normalizePureMathForRender(rawMath: string): {
  normalized: string;
  wasAutoAligned: boolean;
  wasSanitized: boolean;
} {
  const unwrapped = unwrapDisplaylines(rawMath);
  const wasUnwrapped = unwrapped !== rawMath;

  const cleanPlaceholders = unwrapped
    .replace(/\\placeholder\{([^}]*)\}/g, (_m, inner) => (inner ? inner : '\\Box'))
    .replace(/\\placeholder/g, '\\Box')
    .replace(/\\square/g, '\\Box')
    .replace(/#\?/g, '\\Box')
    .replace(/#@/g, '')
    .replace(/\\begin\{multline\*?\}/g, '\\begin{gathered}')
    .replace(/\\end\{multline\*?\}/g, '\\end{gathered}');

  const { sanitized, wasModified } = sanitizeMathForDisplay(cleanPlaceholders);
  const trimmed = sanitized.trim();
  if (!trimmed) {
    return { normalized: '', wasAutoAligned: false, wasSanitized: wasModified || wasUnwrapped };
  }

  const topLevel = analyzeTopLevelMultiline(trimmed);

  // 纯单行公式（或完整闭合在单一矩阵/aligned/cases环境内部）且顶层无对齐与分行指令，直接返回
  if (!topLevel.isMultiLine && !topLevel.hasTopLevelBreak && !topLevel.hasTopLevelAmpersand) {
    return { normalized: trimmed, wasAutoAligned: false, wasSanitized: wasModified || wasUnwrapped };
  }

  const lines = topLevel.lines;
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    const isLastLine = i === lines.length - 1;

    if (!trimmedLine && isLastLine && processedLines.length > 0) {
      continue;
    }

    const alignedLine = topLevel.hasTopLevelAmpersand
      ? trimmedLine
      : trimmedLine
      ? `&${trimmedLine}`
      : '&';

    const hasMoreNonEmpty = lines.slice(i + 1).some((l) => l.trim().length > 0);
    if (!isLastLine && hasMoreNonEmpty) {
      processedLines.push(`${alignedLine} \\\\`);
    } else {
      processedLines.push(alignedLine);
    }
  }

  const innerContent = processedLines.join('\n');
  const wrapped = `\\begin{aligned}\n${innerContent}\n\\end{aligned}`;

  return {
    normalized: wrapped,
    wasAutoAligned: true,
    wasSanitized: wasModified || wasUnwrapped,
  };
}

/**
 * 混排 Markdown 文本块格式化（安全转义与基础 Markdown 样式）
 */
function formatMarkdownTextChunk(text: string): string {
  if (!text) return '';

  // 1. 转义 HTML 特殊字符
  let escaped = escapeHtml(text);

  // 2. 标题语法 (# Title, ## Subtitle, ### H3) - 针对行首
  escaped = escaped.replace(/^(#{1,3})\s+(.+)$/gm, (_m, hashes, title) => {
    const level = hashes.length;
    return `<h${level} class="mixed-heading mixed-h${level}">${title.trim()}</h${level}>`;
  });

  // 3. 行内加粗 (**bold**)
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 4. 行内斜体 (*italic*)
  escaped = escaped.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // 5. 行内代码 (`code`)
  escaped = escaped.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 6. 换行符转换为 <br />，并保留空行段落感
  escaped = escaped.replace(/\n\n+/g, '</p><p class="mixed-paragraph">');
  escaped = escaped.replace(/\n/g, '<br />');

  return escaped;
}

/**
 * 根据出错位置探测出错标记（Token）的长度，便于在编辑器中精准选中整个出错词法单元
 */
export function detectErrorTokenLength(rawText: string, pos: number): number {
  if (pos < 0 || pos >= rawText.length) return 1;
  const remaining = rawText.slice(pos);

  // 1. LaTeX 命令：以反斜杠开头，如 \frac, \unknowncmd 等
  const cmdMatch = remaining.match(/^(\\[a-zA-Z]+|\\[^a-zA-Z\s])/);
  if (cmdMatch) return cmdMatch[0].length;

  // 2. 标识符 / 单词
  const wordMatch = remaining.match(/^[a-zA-Z0-9]+/);
  if (wordMatch) return wordMatch[0].length;

  // 3. 常见成对括号或定界符
  if (/^[{}()\[\]]/.test(remaining)) return 1;

  return 1;
}

/**
 * 提取 KaTeX ParseError 中的出错字符偏移量 (0-indexed)
 */
export function extractKatexErrorPosition(err: unknown, text: string): number | null {
  if (!err) return null;
  let pos: number | null = null;
  if (typeof (err as { position?: number }).position === 'number') {
    pos = (err as { position?: number }).position!;
  } else if ((err as Error).message) {
    const match = (err as Error).message.match(/at position (\d+)/i);
    if (match) pos = parseInt(match[1], 10);
  }

  if (typeof pos === 'number') {
    // 针对末尾遗漏闭合括号等超出文本长度的情况（如 \frac{1}{ 报 at position 9）
    if (pos >= text.length && text.length > 0) {
      return Math.max(0, text.length - 1);
    }
    return Math.max(0, Math.min(pos, text.length));
  }
  return null;
}

/**
 * 图文 / 题解混排模式渲染器：
 * 使用正则精准切分文本块，记录每个公式片段在全文中的绝对行列坐标与偏移，
 * 仅将 $...$ 和 $$...$$ 交由 KaTeX 渲染，实现 100% 精准错误定位映射
 */
export function renderMixedMarkdownMath(content: string): {
  html: string;
  success: boolean;
  wasAutoFixed: boolean;
  errorMessage?: string;
  errorPosition?: number;
  errorLength?: number;
  errorLine?: number;
  errorColumn?: number;
} {
  if (!content.trim()) {
    return { html: '', success: true, wasAutoFixed: false };
  }

  // 核心分词正则：匹配 $$...$$, \[...\], $...$, \(...\)
  const tokenRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|(?<!\\)\$(?:\\\$|[^\$\n])+?(?<!\\)\$|\\\(.*?\\\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const parts: string[] = [];
  let hasAnyError = false;
  let anyAutoFixed = false;
  let firstErrorMessage = '';
  let firstErrorPos: number | undefined;
  let firstErrorLen: number | undefined;
  let firstErrorLine: number | undefined;
  let firstErrorCol: number | undefined;

  while ((match = tokenRegex.exec(content)) !== null) {
    // 处理数学公式前的普通文本块
    if (match.index > lastIndex) {
      const textBlock = content.substring(lastIndex, match.index);
      const formattedText = formatMarkdownTextChunk(textBlock);
      if (formattedText) {
        parts.push(formattedText);
      }
    }
    lastIndex = tokenRegex.lastIndex;

    const matchedStr = match[0];
    const matchIndex = match.index;
    let isBlock = false;
    let mathCode = '';
    let delimOffset = 1;

    if (matchedStr.startsWith('$$') && matchedStr.endsWith('$$')) {
      isBlock = true;
      delimOffset = 2;
      mathCode = matchedStr.slice(2, -2).trim();
    } else if (matchedStr.startsWith('\\[') && matchedStr.endsWith('\\]')) {
      isBlock = true;
      delimOffset = 2;
      mathCode = matchedStr.slice(2, -2).trim();
    } else if (matchedStr.startsWith('\\(') && matchedStr.endsWith('\\)')) {
      isBlock = false;
      delimOffset = 2;
      mathCode = matchedStr.slice(2, -2).trim();
    } else if (matchedStr.startsWith('$') && matchedStr.endsWith('$')) {
      isBlock = false;
      delimOffset = 1;
      mathCode = matchedStr.slice(1, -1).trim();
    }

    const formulaStartOffset = matchIndex + delimOffset;

    // 清洗占位符与全角/中文
    const { sanitized, wasModified } = sanitizeMathForDisplay(mathCode);
    if (wasModified) anyAutoFixed = true;

    const { normalized, wasAutoAligned } = isBlock
      ? normalizePureMathForRender(sanitized)
      : {
          normalized: sanitized
            .replace(/\\placeholder\{([^}]*)\}/g, (_m, inner) => (inner ? inner : '\\Box'))
            .replace(/\\placeholder/g, '\\Box')
            .replace(/\\square/g, '\\Box')
            .replace(/#\?/g, '\\Box')
            .replace(/#@/g, ''),
          wasAutoAligned: false,
        };

    try {
      const mathHtml = katex.renderToString(normalized, {
        displayMode: isBlock,
        throwOnError: true,
        trust: false,
        strict: 'ignore',
        output: 'htmlAndMathml',
        macros: {
          '\\placeholder': '\\Box',
          '\\square': '\\Box',
          '\\differentialD': '\\mathrm{d}',
          '\\imaginaryI': '\\mathrm{i}',
          '\\imaginaryJ': '\\mathrm{j}',
          '\\exponentialE': '\\mathrm{e}',
          '\\doubleprime': '\\prime\\prime',
        },
      });

      if (isBlock) {
        parts.push(`<div class="katex-display-block">${mathHtml}</div>`);
      } else {
        parts.push(`<span class="katex-inline-block">${mathHtml}</span>`);
      }
    } catch (err: unknown) {
      hasAnyError = true;
      if (!firstErrorMessage && err instanceof Error) {
        firstErrorMessage = err.message.replace(/^KaTeX parse error:\s*/i, '');
        const innerPos = extractKatexErrorPosition(err, normalized);
        let adjustedInnerPos = typeof innerPos === 'number' ? innerPos : 0;
        if (wasAutoAligned) {
          const alignPrefixLen = "\\begin{aligned}\n".length;
          adjustedInnerPos = Math.max(0, adjustedInnerPos - alignPrefixLen);
        }
        // 精确换算为全文绝对字符位置
        const absPos = Math.max(0, Math.min(formulaStartOffset + adjustedInnerPos, content.length));
        firstErrorPos = absPos;
        firstErrorLen = detectErrorTokenLength(content, absPos);
        const loc = computeLineAndColumn(content, absPos);
        firstErrorLine = loc?.line;
        firstErrorCol = loc?.column;
      }

      // 宽松容错渲染（使用预览补齐）
      try {
        const { fixed: previewFixed } = autoFixLatexSyntax(normalized);
        const fallbackHtml = katex.renderToString(previewFixed, {
          displayMode: isBlock,
          throwOnError: false,
          trust: false,
          strict: 'ignore',
          output: 'htmlAndMathml',
          macros: {
            '\\placeholder': '\\Box',
            '\\square': '\\Box',
          },
        });
        if (isBlock) {
          parts.push(`<div class="katex-display-block fallback">${fallbackHtml}</div>`);
        } else {
          parts.push(`<span class="katex-inline-block fallback">${fallbackHtml}</span>`);
        }
      } catch {
        parts.push(`<code class="katex-error-snippet">${escapeHtml(matchedStr)}</code>`);
      }
    }
  }

  // 追加结尾普通文本
  if (lastIndex < content.length) {
    const trailingText = content.substring(lastIndex);
    const formattedTrailing = formatMarkdownTextChunk(trailingText);
    if (formattedTrailing) {
      parts.push(formattedTrailing);
    }
  }

  const finalHtml = `<div class="mixed-content-rendered"><p class="mixed-paragraph">${parts.join('')}</p></div>`;

  return {
    html: finalHtml,
    success: !hasAnyError,
    wasAutoFixed: anyAutoFixed,
    errorMessage: firstErrorMessage,
    errorPosition: firstErrorPos,
    errorLength: firstErrorLen,
    errorLine: firstErrorLine,
    errorColumn: firstErrorCol,
  };
}

export function highlightLatexTokens(code: string): string {
  if (!code) return '';
  let normalized = code;
  if (normalized.endsWith('\n')) {
    normalized += ' ';
  }

  const tokenRegex =
    /(%[^\n]*)|(\\square)|(\\(?:begin|end)\{([a-zA-Z0-9*_-]+)\})|(\\[a-zA-Z]+|\\[^a-zA-Z\s])|(\$\$|\$|\\\\|&|[{}[\]()])|(\b\d+(?:\.\d+)?\b)|([=+\-*/^~_<>])/g;

  return normalized.replace(
    tokenRegex,
    (
      match,
      comment,
      square,
      envBlock,
      _envName,
      command,
      delimiter,
      number,
      operator
    ) => {
      if (comment) {
        return `<span class="tok-comment">${escapeHtml(comment)}</span>`;
      }
      if (square) {
        return `<span class="tok-placeholder">${escapeHtml(square)}</span>`;
      }
      if (envBlock) {
        return `<span class="tok-env">${escapeHtml(envBlock)}</span>`;
      }
      if (command) {
        return `<span class="tok-command">${escapeHtml(command)}</span>`;
      }
      if (delimiter) {
        return `<span class="tok-delim">${escapeHtml(delimiter)}</span>`;
      }
      if (number) {
        return `<span class="tok-num">${escapeHtml(number)}</span>`;
      }
      if (operator) {
        return `<span class="tok-operator">${escapeHtml(operator)}</span>`;
      }
      return escapeHtml(match);
    }
  );
}

export function computeLineAndColumn(
  text: string,
  index: number
): { line: number; column: number } | null {
  if (index < 0 || index > text.length) return null;
  const safeIndex = Math.min(index, text.length);
  const upToPos = text.slice(0, safeIndex);
  const lines = upToPos.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

export function estimateFormulaLineCount(rawLatex: string): {
  physicalLines: number;
  latexBreakCount: number;
  estimatedLines: number;
  isMultiLine: boolean;
} {
  if (!rawLatex.trim()) {
    return { physicalLines: 1, latexBreakCount: 0, estimatedLines: 1, isMultiLine: false };
  }

  const unwrapped = unwrapDisplaylines(rawLatex);
  const topLevel = analyzeTopLevelMultiline(unwrapped);
  const physicalLines = rawLatex.split('\n').length;
  const breakMatches = unwrapped.match(/\\\\(?!\w)/g);
  const latexBreakCount = breakMatches ? breakMatches.length : 0;
  const baseEstimated =
    physicalLines <= 1 && latexBreakCount > 0
      ? latexBreakCount + 1
      : Math.max(physicalLines, latexBreakCount > 0 ? latexBreakCount + 1 : 1);
  const estimatedLines = Math.max(topLevel.lines.length, baseEstimated);

  return {
    physicalLines,
    latexBreakCount,
    estimatedLines,
    isMultiLine: estimatedLines > 1,
  };
}

export interface RenderOutcome {
  success: boolean;
  html: string;
  cleanedLatex: string;
  wasStripped: boolean;
  strippedDelimiter?: string;
  mode: FormulaMode;
  isMixed: boolean;
  wasAutoAligned?: boolean;
  wasAutoFixed?: boolean;
  errorMessage?: string;
  errorPosition?: number;
  errorLength?: number;
  errorLine?: number;
  errorColumn?: number;
}

/**
 * 核心全能公式安全渲染器：
 * 具备智能模式识别、多行环境自适应包裹、图文题解混排、全角纠错与裸汉字 \text{} 保护能力
 */
export function renderFormulaSafely(rawLatex: string): RenderOutcome {
  if (!rawLatex.trim()) {
    return {
      success: true,
      html: '',
      cleanedLatex: '',
      wasStripped: false,
      mode: 'pure-math',
      isMixed: false,
    };
  }

  const modeDetect = detectFormulaMode(rawLatex);

  // 模式一：图文 / 题解混排模式 (Mixed Markdown/Math)
  if (modeDetect.mode === 'mixed-content') {
    const mixedRes = renderMixedMarkdownMath(rawLatex);
    return {
      success: mixedRes.success,
      html: mixedRes.html,
      cleanedLatex: rawLatex,
      wasStripped: false,
      mode: 'mixed-content',
      isMixed: true,
      wasAutoFixed: mixedRes.wasAutoFixed,
      errorMessage: mixedRes.errorMessage,
      errorPosition: mixedRes.errorPosition,
      errorLength: mixedRes.errorLength,
      errorLine: mixedRes.errorLine,
      errorColumn: mixedRes.errorColumn,
    };
  }

  // 模式二：纯公式模式 (Pure Math)
  const cleaned = modeDetect.cleanedText;
  const unwrappedCleaned = unwrapDisplaylines(cleaned);
  const outerOffset = modeDetect.wasOuterStripped ? Math.max(0, rawLatex.indexOf(cleaned)) : 0;
  const { normalized, wasAutoAligned, wasSanitized } = normalizePureMathForRender(cleaned);

  try {
    const html = katex.renderToString(normalized, {
      displayMode: true,
      throwOnError: true,
      trust: false,
      strict: 'ignore',
      output: 'htmlAndMathml',
      macros: {
        '\\placeholder': '\\Box',
        '\\square': '\\Box',
      },
    });

    return {
      success: true,
      html,
      cleanedLatex: unwrappedCleaned,
      wasStripped: modeDetect.wasOuterStripped,
      strippedDelimiter: modeDetect.outerDelimiter,
      mode: 'pure-math',
      isMixed: false,
      wasAutoAligned,
      wasAutoFixed: wasSanitized,
    };
  } catch (err: unknown) {
    let activeErr = err;
    let isRelativeCleaned = false;

    // 若自动包装 aligned 失败，尝试展开 displaylines 后的原始代码渲染以获取最准确的错误或成功
    if (wasAutoAligned) {
      try {
        const rawHtml = katex.renderToString(unwrappedCleaned, {
          displayMode: true,
          throwOnError: true,
          trust: false,
          strict: 'ignore',
          output: 'htmlAndMathml',
          macros: {
            '\\placeholder': '\\Box',
            '\\square': '\\Box',
          },
        });
        return {
          success: true,
          html: rawHtml,
          cleanedLatex: unwrappedCleaned,
          wasStripped: modeDetect.wasOuterStripped,
          strippedDelimiter: modeDetect.outerDelimiter,
          mode: 'pure-math',
          isMixed: false,
          wasAutoAligned: false,
          wasAutoFixed: wasSanitized,
        };
      } catch (errCleaned) {
        activeErr = errCleaned;
        isRelativeCleaned = true;
      }
    }

    const posInCode = extractKatexErrorPosition(activeErr, isRelativeCleaned ? unwrappedCleaned : normalized);
    let absolutePos = 0;
    if (typeof posInCode === 'number') {
      if (isRelativeCleaned || !wasAutoAligned) {
        absolutePos = outerOffset + posInCode;
      } else {
        const alignPrefixLen = "\\begin{aligned}\n".length;
        absolutePos = outerOffset + Math.max(0, posInCode - alignPrefixLen);
      }
    }
    absolutePos = Math.max(0, Math.min(absolutePos, rawLatex.length));
    const errorLength = detectErrorTokenLength(rawLatex, absolutePos);
    const loc = computeLineAndColumn(rawLatex, absolutePos);

    // 尝试宽松模式容错渲染：对临时副本应用预览级自动补齐 (Auto-Sanitize for Preview)
    let fallbackHtml = '';
    try {
      const { fixed: previewFixed } = autoFixLatexSyntax(normalized);
      fallbackHtml = katex.renderToString(previewFixed, {
        displayMode: true,
        throwOnError: false,
        trust: false,
        strict: 'ignore',
        output: 'htmlAndMathml',
        macros: {
          '\\placeholder': '\\Box',
          '\\square': '\\Box',
        },
      });
    } catch {
      // ignore
    }

    const errorMsg =
      activeErr instanceof ParseError
        ? activeErr.message.replace(/^KaTeX parse error:\s*/i, '')
        : activeErr instanceof Error
        ? activeErr.message
        : '公式解析时发生错误';

    return {
      success: false,
      html: fallbackHtml,
      cleanedLatex: cleaned,
      wasStripped: modeDetect.wasOuterStripped,
      strippedDelimiter: modeDetect.outerDelimiter,
      mode: 'pure-math',
      isMixed: false,
      wasAutoAligned,
      wasAutoFixed: wasSanitized,
      errorMessage: errorMsg,
      errorPosition: absolutePos,
      errorLength,
      errorLine: loc?.line,
      errorColumn: loc?.column,
    };
  }
}

export function renderSymbolPreviewHtml(previewLatex: string): string {
  try {
    return katex.renderToString(previewLatex, {
      displayMode: false,
      throwOnError: false,
      trust: false,
      strict: 'ignore',
      output: 'html',
    });
  } catch {
    return previewLatex;
  }
}
