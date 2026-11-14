import { DelimiterMode } from '../types';
import { findMatchingBrace, isEscapedAt, transformMathModeOnly } from './scanner';

export const CANONICAL_PLACEHOLDER = '\\placeholder{}';

const INVISIBLE_CHARS_RE = /[\u200B-\u200F\u202A-\u202E\uFEFF]/g;
const HTML_SPACE_ENTITIES_RE = /&(?:#x0*20|#0*32|nbsp|#0*160|#x0*a0|ensp|emsp|thinsp);/gi;

export const PASTE_FULLWIDTH_MAP: Record<string, string> = {
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

export const MATH_FULLWIDTH_MAP: Record<string, string> = {
  ...PASTE_FULLWIDTH_MAP,
  '，': ', ',
  '、': ', ',
  '！': '! ',
  '？': '? ',
  '。': '. ',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
};

const PASTE_FULLWIDTH_RE = new RegExp(`[${Object.keys(PASTE_FULLWIDTH_MAP).join('')}]`, 'g');
const MATH_FULLWIDTH_RE = new RegExp(`[${Object.keys(MATH_FULLWIDTH_MAP).join('')}]`, 'g');

export function stripInvisibleChars(input: string): string {
  return input.replace(INVISIBLE_CHARS_RE, '');
}

export function decodeHtmlSpaceEntities(input: string): string {
  return input.replace(HTML_SPACE_ENTITIES_RE, ' ');
}

function hasUnescapedDollar(input: string): boolean {
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '$' && !isEscapedAt(input, i)) {
      return true;
    }
  }
  return false;
}

/**
 * Strips a single outermost math delimiter wrapper (`$$...$$`, `\[...\]`, `\(...\)`,
 * `\begin{equation\*?}...\end{equation\*?}`, or `$...$` with no unescaped internal `$`).
 * Preserves multi-expression strings such as `$a$ + $b$`.
 */
export function stripOuterMathDelimiters(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
    const inner = trimmed.slice(2, -2);
    if (!hasUnescapedDollar(inner)) {
      return inner.trim();
    }
  }

  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length >= 4) {
    return trimmed.slice(2, -2).trim();
  }

  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)') && trimmed.length >= 4) {
    return trimmed.slice(2, -2).trim();
  }

  const eqMatch = trimmed.match(/^\\begin\{(equation\*?)\}([\s\S]*)\\end\{\1\}$/);
  if (eqMatch) {
    return eqMatch[2].trim();
  }

  if (
    trimmed.startsWith('$') &&
    trimmed.endsWith('$') &&
    trimmed.length >= 2 &&
    !trimmed.startsWith('$$') &&
    !isEscapedAt(trimmed, trimmed.length - 1)
  ) {
    const inner = trimmed.slice(1, -1);
    if (!hasUnescapedDollar(inner)) {
      return inner.trim();
    }
  }

  return trimmed;
}

export const stripOuterDelimitersIfEnclosed = stripOuterMathDelimiters;

/**
 * Strips a trailing isolated odd backslash (`... \`) while keeping valid line breaks (`\\`)
 * and alignment ampersands (`&`) intact.
 */
export function stripTrailingIsolatedBackslash(input: string): string {
  const trimmedEnd = input.replace(/[ \t]+$/, '');
  if (!trimmedEnd.endsWith('\\')) return input;

  let trailing = 0;
  for (let i = trimmedEnd.length - 1; i >= 0 && trimmedEnd[i] === '\\'; i--) {
    trailing++;
  }
  if (trailing % 2 === 1) {
    return trimmedEnd.slice(0, -1).replace(/[ \t]+$/, '');
  }
  return input;
}

/**
 * Normalizes pasted LaTeX fragments from external editors, web pages, PDFs, or LLMs.
 */
export function normalizePastedLatex(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/\r\n?/g, '\n');
  text = stripInvisibleChars(text);
  text = decodeHtmlSpaceEntities(text);
  text = stripOuterMathDelimiters(text);
  text = text.replace(PASTE_FULLWIDTH_RE, (ch) => PASTE_FULLWIDTH_MAP[ch] ?? ch);
  text = stripTrailingIsolatedBackslash(text);
  return text.trim();
}

/**
 * Normalizes fullwidth punctuation inside math-mode segments only
 * (leaving comments and `\text{...}` arguments untouched).
 */
export function normalizeFullwidthPunctuation(latex: string): string {
  return transformMathModeOnly(latex, (chunk) =>
    chunk.replace(MATH_FULLWIDTH_RE, (ch) => MATH_FULLWIDTH_MAP[ch] ?? ch)
  );
}

/**
 * Wraps naked CJK character runs in `\text{...}` inside math-mode segments only.
 */
export function autoWrapNakedChinese(latex: string): string {
  return transformMathModeOnly(latex, (chunk) =>
    chunk.replace(/([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+)/g, '\\text{$1}')
  );
}

export function wrapWithDelimiter(latex: string, mode: DelimiterMode): string {
  const clean = stripOuterMathDelimiters(latex);
  switch (mode) {
    case 'none':
      return clean;
    case 'inline':
      return `$${clean}$`;
    case 'display':
      return `$$\n${clean}\n$$`;
    case 'equation':
      return `\\begin{equation}\n${clean}\n\\end{equation}`;
  }
}

export interface PlaceholderRange {
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
  kind: 'placeholder' | 'square';
}

/**
 * Finds the next `\placeholder{...}` (or fallback isolated `\square`) starting at `fromIndex`.
 * Wraps around from 0 if none found after `fromIndex`.
 */
export function findNextPlaceholder(
  latex: string,
  fromIndex = 0
): PlaceholderRange | null {
  const findAfter = (startAt: number): PlaceholderRange | null => {
    const token = '\\placeholder{';
    const phIdx = latex.indexOf(token, startAt);
    const sqMatch = findIsolatedSquare(latex, startAt);

    if (phIdx !== -1 && (sqMatch === -1 || phIdx <= sqMatch)) {
      const braceStart = phIdx + '\\placeholder'.length;
      const braceEnd = findMatchingBrace(latex, braceStart);
      if (braceEnd !== -1) {
        return {
          start: phIdx,
          end: braceEnd + 1,
          contentStart: braceStart + 1,
          contentEnd: braceEnd,
          kind: 'placeholder',
        };
      }
    }

    if (sqMatch !== -1) {
      return {
        start: sqMatch,
        end: sqMatch + '\\square'.length,
        contentStart: sqMatch,
        contentEnd: sqMatch + '\\square'.length,
        kind: 'square',
      };
    }

    return null;
  };

  return findAfter(fromIndex) ?? (fromIndex > 0 ? findAfter(0) : null);
}

function findIsolatedSquare(latex: string, startAt: number): number {
  let idx = startAt;
  while (idx < latex.length) {
    const pos = latex.indexOf('\\square', idx);
    if (pos === -1) return -1;
    const after = latex[pos + '\\square'.length];
    if (!after || !/[A-Za-z]/.test(after)) {
      return pos;
    }
    idx = pos + '\\square'.length;
  }
  return -1;
}

/**
 * Replaces `\placeholder{...}` tokens safely before sending LaTeX to MathJax / KaTeX:
 * - For visual preview (`forPreview = true`): empty `\placeholder{}` becomes a muted `\square`.
 * - For final export (`forPreview = false`): empty `\placeholder{}` is removed; non-empty keeps inner content.
 */
export function resolvePlaceholdersForRender(latex: string, forPreview: boolean): string {
  let result = '';
  let i = 0;
  const token = '\\placeholder';

  while (i < latex.length) {
    const idx = latex.indexOf(token, i);
    if (idx === -1) {
      result += latex.slice(i);
      break;
    }

    result += latex.slice(i, idx);
    let cursor = idx + token.length;
    while (cursor < latex.length && latex[cursor] === ' ') cursor++;

    if (latex[cursor] === '{') {
      const closeIdx = findMatchingBrace(latex, cursor);
      if (closeIdx !== -1) {
        const inner = latex.slice(cursor + 1, closeIdx);
        if (inner.trim().length > 0) {
          result += inner;
        } else if (forPreview) {
          result += '{\\color{#94a3b8}\\square}';
        }
        i = closeIdx + 1;
        continue;
      }
    }

    result += token;
    i = idx + token.length;
  }

  return result;
}

export function sanitizeMathForDisplay(latex: string): string {
  return resolvePlaceholdersForRender(latex, true);
}

export function stripPlaceholdersForExport(latex: string): string {
  return resolvePlaceholdersForRender(latex, false);
}

export function computeLineAndColumn(
  source: string,
  index: number
): { line: number; column: number; rawLine: string } {
  const safeIndex = Math.max(0, Math.min(index, source.length));
  const prefix = source.slice(0, safeIndex);
  const lastNl = prefix.lastIndexOf('\n');
  const line = prefix.split('\n').length;
  const column = lastNl === -1 ? safeIndex + 1 : safeIndex - lastNl;

  const lineStart = lastNl + 1;
  const nextNl = source.indexOf('\n', lineStart);
  const rawLine = nextNl === -1 ? source.slice(lineStart) : source.slice(lineStart, nextNl);

  return { line, column, rawLine };
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeCjkAndPunctuation(latex: string): string {
  return autoWrapNakedChinese(normalizeFullwidthPunctuation(latex));
}
