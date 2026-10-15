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
 * 一键语法自动修复（Auto Fix）与预览容错补全
 * 1. 纠正中文全角标点为标准 LaTeX 符号
 * 2. 自动给裸汉字包裹 \text{...}
 * 3. 自动将不支持的 align / align* / equation 替换为 aligned
 * 4. 补齐未闭合的 \left -> \right.
 * 5. 补齐不完整 \frac{...} 的缺失项为 \Box
 * 6. 补齐末尾未闭合的花括号 {
 */
export function autoFixLatexSyntax(rawLatex: string): {
  fixed: string;
  wasModified: boolean;
} {
  if (!rawLatex.trim()) return { fixed: rawLatex, wasModified: false };

  let fixed = rawLatex;

  // 1. 中文全角标点纠正
  fixed = normalizeFullwidthPunctuation(fixed);

  // 2. 裸汉字自动包裹
  fixed = autoWrapNakedChinese(fixed);

  // 3. 环境替换：align / align* / equation -> aligned
  fixed = fixed.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}');
  fixed = fixed.replace(/\\end\{align\*?\}/g, '\\end{aligned}');
  fixed = fixed.replace(/\\begin\{equation\*?\}/g, '\\begin{aligned}');
  fixed = fixed.replace(/\\end\{equation\*?\}/g, '\\end{aligned}');

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
  const envRegex = /\\begin\{(aligned|align\*?|gathered|gather\*?|split|cases|[a-zA-Z]*matrix|array|eqnarray\*?|multiline)\}/i;
  return envRegex.test(code);
}

/**
 * 纯公式预处理与多行智能包裹：
 * 1. 占位符转换与降级
 * 2. 中文全角标点归一化与裸汉字自动包裹
 * 3. 若包含回车换行 \n 或 \\ 或 & 对齐符，且未显式声明环境，自动为其包裹 \begin{aligned} ... \end{aligned}
 */
export function normalizePureMathForRender(rawMath: string): {
  normalized: string;
  wasAutoAligned: boolean;
  wasSanitized: boolean;
} {
  const cleanPlaceholders = rawMath
    .replace(/\\placeholder\{([^}]*)\}/g, (_m, inner) => (inner ? inner : '\\Box'))
    .replace(/\\placeholder/g, '\\Box')
    .replace(/\\square/g, '\\Box')
    .replace(/#\?/g, '\\Box')
    .replace(/#@/g, '');

  const { sanitized, wasModified } = sanitizeMathForDisplay(cleanPlaceholders);
  const trimmed = sanitized.trim();
  if (!trimmed) {
    return { normalized: '', wasAutoAligned: false, wasSanitized: wasModified };
  }

  // 若已有环境，不重复包装
  if (hasEnclosingEnvironment(trimmed)) {
    return { normalized: trimmed, wasAutoAligned: false, wasSanitized: wasModified };
  }

  const hasNewlines = trimmed.includes('\n');
  const hasLatexBreaks = /\\\\(?!\w)/.test(trimmed);
  const hasAlignMarkers = /(^|[^\\])&/.test(trimmed);

  // 纯单行公式且无对齐与分行指令，直接返回
  if (!hasNewlines && !hasLatexBreaks && !hasAlignMarkers) {
    return { normalized: trimmed, wasAutoAligned: false, wasSanitized: wasModified };
  }

  // 针对多行或带 \\ / & 的公式进行 aligned 兼容包裹
  const lines = trimmed.split('\n');
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmedLine = rawLine.trim();

    if (!trimmedLine && i === lines.length - 1) {
      continue;
    }

    const isLastLine = i === lines.length - 1 || lines.slice(i + 1).every((l) => !l.trim());

    if (!isLastLine) {
      // 检查行尾是否已有 \\
      if (!trimmedLine.endsWith('\\\\')) {
        processedLines.push(trimmedLine ? `${trimmedLine} \\\\` : '\\\\');
      } else {
        processedLines.push(trimmedLine);
      }
    } else {
      processedLines.push(trimmedLine);
    }
  }

  const innerContent = processedLines.join('\n');
  const wrapped = `\\begin{aligned}\n${innerContent}\n\\end{aligned}`;

  return {
    normalized: wrapped,
    wasAutoAligned: true,
    wasSanitized: wasModified,
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

  const physicalLines = rawLatex.split('\n').length;
  const breakMatches = rawLatex.match(/\\\\(?!\w)/g);
  const latexBreakCount = breakMatches ? breakMatches.length : 0;
  const estimatedLines =
    physicalLines <= 1 && latexBreakCount > 0
      ? latexBreakCount + 1
      : Math.max(physicalLines, latexBreakCount > 0 ? latexBreakCount + 1 : 1);

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
      cleanedLatex: cleaned,
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

    // 若自动包装 aligned 失败，尝试原始代码渲染以获取最准确的错误或成功
    if (wasAutoAligned) {
      try {
        const rawHtml = katex.renderToString(cleaned, {
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
          cleanedLatex: cleaned,
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

    const posInCode = extractKatexErrorPosition(activeErr, isRelativeCleaned ? cleaned : normalized);
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
