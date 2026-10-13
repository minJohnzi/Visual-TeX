import katex, { ParseError } from 'katex';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  errorMessage?: string;
  errorPosition?: number;
  errorLine?: number;
  errorColumn?: number;
}

export function renderFormulaSafely(rawLatex: string): RenderOutcome {
  const { cleaned, wasStripped, delimiter } = stripOuterMathDelimiters(rawLatex);

  if (!cleaned.trim()) {
    return {
      success: true,
      html: '',
      cleanedLatex: '',
      wasStripped: false,
    };
  }

  try {
    // 将占位符 \square 以及 MathLive 输出的 \placeholder{} 与 #? 转换为可清晰显示的 \Box
    const displayCode = cleaned
      .replace(/\\placeholder\{([^}]*)\}/g, (_m, inner) => (inner ? inner : '\\Box'))
      .replace(/\\placeholder/g, '\\Box')
      .replace(/\\square/g, '\\Box')
      .replace(/#\?/g, '\\Box')
      .replace(/#@/g, '');

    const html = katex.renderToString(displayCode, {
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
      wasStripped,
      strippedDelimiter: delimiter,
    };
  } catch (err: unknown) {
    if (err instanceof ParseError) {
      const maybePos = (err as ParseError & { position?: number }).position;
      const loc =
        typeof maybePos === 'number' ? computeLineAndColumn(cleaned, maybePos) : null;

      // 尝试宽松模式容错渲染
      let fallbackHtml = '';
      try {
        const fallbackCode = cleaned
          .replace(/\\placeholder\{([^}]*)\}/g, (_m, inner) => (inner ? inner : '\\Box'))
          .replace(/\\placeholder/g, '\\Box')
          .replace(/\\square/g, '\\Box')
          .replace(/#\?/g, '\\Box')
          .replace(/#@/g, '');

        fallbackHtml = katex.renderToString(fallbackCode, {
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

      return {
        success: false,
        html: fallbackHtml,
        cleanedLatex: cleaned,
        wasStripped,
        strippedDelimiter: delimiter,
        errorMessage: err.message.replace(/^KaTeX parse error:\s*/i, ''),
        errorPosition: typeof maybePos === 'number' ? maybePos : undefined,
        errorLine: loc?.line,
        errorColumn: loc?.column,
      };
    }

    const fallbackMsg =
      err instanceof Error ? err.message : '公式解析时发生错误';
    return {
      success: false,
      html: '',
      cleanedLatex: cleaned,
      wasStripped,
      strippedDelimiter: delimiter,
      errorMessage: fallbackMsg,
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
