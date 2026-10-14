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
 * 检查公式是否已经处于多行环境或矩阵等闭合环境中
 */
export function hasEnclosingEnvironment(code: string): boolean {
  const envRegex = /\\begin\{(aligned|align\*?|gathered|gather\*?|split|cases|[a-zA-Z]*matrix|array|eqnarray\*?|multiline)\}/i;
  return envRegex.test(code);
}

/**
 * 纯公式预处理与多行智能包裹：
 * 若包含回车换行 \n 或 \\ 或 & 对齐符，且未显式声明环境，自动为其包裹 \begin{aligned} ... \end{aligned}
 * 并将未转义的普通回车兼容处理为 \\ 换行，支持多行推导
 */
export function normalizePureMathForRender(rawMath: string): {
  normalized: string;
  wasAutoAligned: boolean;
} {
  const cleanPlaceholders = rawMath
    .replace(/\\placeholder\{([^}]*)\}/g, (_m, inner) => (inner ? inner : '\\Box'))
    .replace(/\\placeholder/g, '\\Box')
    .replace(/\\square/g, '\\Box')
    .replace(/#\?/g, '\\Box')
    .replace(/#@/g, '');

  const trimmed = cleanPlaceholders.trim();
  if (!trimmed) {
    return { normalized: '', wasAutoAligned: false };
  }

  // 若已有环境，不重复包装
  if (hasEnclosingEnvironment(trimmed)) {
    return { normalized: trimmed, wasAutoAligned: false };
  }

  const hasNewlines = trimmed.includes('\n');
  const hasLatexBreaks = /\\\\(?!\w)/.test(trimmed);
  const hasAlignMarkers = /(^|[^\\])&/.test(trimmed);

  // 纯单行公式且无对齐与分行指令，直接返回
  if (!hasNewlines && !hasLatexBreaks && !hasAlignMarkers) {
    return { normalized: trimmed, wasAutoAligned: false };
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
 * 使用正则精准切分文本块，文本保留换行与 Markdown 格式，仅将 $...$ 和 $$...$$ 交由 KaTeX 渲染
 */
export function renderMixedMarkdownMath(content: string): {
  html: string;
  success: boolean;
  errorMessage?: string;
  errorPosition?: number;
  errorLength?: number;
  errorLine?: number;
  errorColumn?: number;
} {
  if (!content.trim()) {
    return { html: '', success: true };
  }

  // 核心分词正则：匹配 $$...$$, \[...\], $...$, \(...\)
  const tokenRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|(?<!\\)\$(?:\\\$|[^\$\n])+?(?<!\\)\$|\\\(.*?\\\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const parts: string[] = [];
  let hasAnyError = false;
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

    if (matchedStr.startsWith('$$') && matchedStr.endsWith('$$')) {
      isBlock = true;
      mathCode = matchedStr.slice(2, -2).trim();
    } else if (matchedStr.startsWith('\\[') && matchedStr.endsWith('\\]')) {
      isBlock = true;
      mathCode = matchedStr.slice(2, -2).trim();
    } else if (matchedStr.startsWith('\\(') && matchedStr.endsWith('\\)')) {
      isBlock = false;
      mathCode = matchedStr.slice(2, -2).trim();
    } else if (matchedStr.startsWith('$') && matchedStr.endsWith('$')) {
      isBlock = false;
      mathCode = matchedStr.slice(1, -1).trim();
    }

    // 占位符与多行处理
    const { normalized } = isBlock
      ? normalizePureMathForRender(mathCode)
      : {
          normalized: mathCode
            .replace(/\\placeholder\{([^}]*)\}/g, (_m, inner) => (inner ? inner : '\\Box'))
            .replace(/\\placeholder/g, '\\Box')
            .replace(/\\square/g, '\\Box')
            .replace(/#\?/g, '\\Box')
            .replace(/#@/g, ''),
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
        if (typeof innerPos === 'number') {
          const delimOffset = matchedStr.startsWith('$$') || matchedStr.startsWith('\\[') ? 2 : 1;
          const absPos = Math.max(0, Math.min(matchIndex + delimOffset + innerPos, content.length));
          firstErrorPos = absPos;
          firstErrorLen = detectErrorTokenLength(content, absPos);
          const loc = computeLineAndColumn(content, absPos);
          firstErrorLine = loc?.line;
          firstErrorCol = loc?.column;
        }
      }

      // 容错渲染
      try {
        const fallbackHtml = katex.renderToString(normalized, {
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

  let lastIndex = 0;
  let html = '';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      html += escapeHtml(normalized.substring(lastIndex, match.index));
    }
    lastIndex = tokenRegex.lastIndex;

    const [full, comment, square, envMatch, envName, cmd, delim, num, op] = match;

    if (comment) {
      html += `<span class="tok-comment">${escapeHtml(comment)}</span>`;
    } else if (square) {
      html += `<span class="tok-square">${escapeHtml(square)}</span>`;
    } else if (envMatch) {
      const isBegin = full.startsWith('\\begin');
      const structTag = isBegin ? '\\begin' : '\\end';
      html += `<span class="tok-struct">${structTag}</span><span class="tok-delim">{</span><span class="tok-env">${escapeHtml(envName)}</span><span class="tok-delim">}</span>`;
    } else if (cmd) {
      if (/^\\(frac|sqrt|sum|prod|int|iint|iiint|oint|lim|partial)/.test(cmd)) {
        html += `<span class="tok-calc">${escapeHtml(cmd)}</span>`;
      } else if (
        /^\\(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)/.test(
          cmd
        )
      ) {
        html += `<span class="tok-greek">${escapeHtml(cmd)}</span>`;
      } else if (
        /^\\(mathbf|mathbb|mathcal|mathrm|text|vec|hat|bar|dot|ddot|tilde|overline|underline)/.test(
          cmd
        )
      ) {
        html += `<span class="tok-type">${escapeHtml(cmd)}</span>`;
      } else if (/^\\(left|right)/.test(cmd)) {
        html += `<span class="tok-bracket-cmd">${escapeHtml(cmd)}</span>`;
      } else {
        html += `<span class="tok-cmd">${escapeHtml(cmd)}</span>`;
      }
    } else if (delim) {
      html += `<span class="tok-delim">${escapeHtml(delim)}</span>`;
    } else if (num) {
      html += `<span class="tok-num">${escapeHtml(num)}</span>`;
    } else if (op) {
      html += `<span class="tok-op">${escapeHtml(op)}</span>`;
    }
  }

  if (lastIndex < normalized.length) {
    html += escapeHtml(normalized.substring(lastIndex));
  }

  return html;
}

export function computeLineAndColumn(
  source: string,
  position: number
): { line: number; column: number } | null {
  if (typeof position !== 'number' || Number.isNaN(position) || position < 0 || position > source.length) {
    return null;
  }

  let line = 1;
  let lastLineStart = 0;

  for (let i = 0; i < position; i++) {
    if (source[i] === '\n') {
      line += 1;
      lastLineStart = i + 1;
    }
  }

  const column = position - lastLineStart + 1;
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
  const matches = rawLatex.match(/\\\\/g);
  const latexBreakCount = matches ? matches.length : 0;

  const hasMultiLineEnv = /\\begin\{(aligned|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|gather|split|align|array)\}/.test(
    rawLatex
  );

  const estimatedLines =
    hasMultiLineEnv && latexBreakCount > 0
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
  errorMessage?: string;
  errorPosition?: number;
  errorLength?: number;
  errorLine?: number;
  errorColumn?: number;
}

/**
 * 核心全能公式安全渲染器：
 * 具备智能模式识别、多行环境自适应包裹与图文题解混排能力
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
  const { normalized, wasAutoAligned } = normalizePureMathForRender(cleaned);

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
        };
      } catch (errCleaned) {
        // 原始代码抛出的 ParseError 位置直接映射到 cleaned
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

    // 尝试宽松模式容错渲染
    let fallbackHtml = '';
    try {
      fallbackHtml = katex.renderToString(normalized, {
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
