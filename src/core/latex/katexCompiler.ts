import katex from 'katex';
import {
  BlockCompileResult,
  CompileError,
  CompileResult,
  DocumentModel,
} from '../types';
import {
  computeLineAndColumn,
  escapeHtml,
  stripOuterMathDelimiters,
} from './protocol';
import {
  analyzeTopLevelMultiline,
  findMatchingBrace,
  isEscapedAt,
} from './scanner';
import { renderTextBlockHtml } from '../markdown/mixedRenderer';

const SYMBOL_PREVIEW_CACHE = new Map<string, string>();
const MAX_SYMBOL_CACHE_SIZE = 600;

const DISPLAY_PLACEHOLDER_TOKEN = '{\\color{#94a3b8}\\square}';

interface PreparedLatex {
  prepared: string;
  mapPreparedOffsetToSource: (preparedOffset: number) => number;
}

/**
 * Replaces `\placeholder{...}` with renderable preview tokens while keeping an exact
 * character index mapping back to the raw LaTeX string for KaTeX ParseError jump-to-error.
 */
function prepareLatexWithOffsetMap(source: string): PreparedLatex {
  let prepared = '';
  // offsetMap[i] stores the raw source index corresponding to prepared[i]
  const offsetMap: number[] = [];
  let i = 0;

  const pushChunk = (text: string, mappedRawStart: number, oneToOne: boolean) => {
    for (let k = 0; k < text.length; k++) {
      offsetMap.push(oneToOne ? mappedRawStart + k : mappedRawStart);
    }
    prepared += text;
  };

  while (i < source.length) {
    if (source.startsWith('\\placeholder', i)) {
      let cursor = i + '\\placeholder'.length;
      while (cursor < source.length && source[cursor] === ' ') cursor++;
      if (source[cursor] === '{') {
        const closeIdx = findMatchingBrace(source, cursor);
        if (closeIdx !== -1) {
          const inner = source.slice(cursor + 1, closeIdx);
          if (inner.trim().length > 0) {
            pushChunk(inner, cursor + 1, true);
          } else {
            pushChunk(DISPLAY_PLACEHOLDER_TOKEN, i, false);
          }
          i = closeIdx + 1;
          continue;
        }
      }
    }

    offsetMap.push(i);
    prepared += source[i];
    i++;
  }
  offsetMap.push(source.length);

  return {
    prepared,
    mapPreparedOffsetToSource: (offset: number) => {
      if (offset <= 0) return 0;
      if (offset >= offsetMap.length) return source.length;
      return offsetMap[offset] ?? source.length;
    },
  };
}

/**
 * Wraps top-level multiline formulas (`\\` or `&` outside `\begin...\end`)
 * in `gathered` / `aligned` so KaTeX renders multiline layouts properly.
 */
function wrapMultilineForKatex(prepared: PreparedLatex): PreparedLatex {
  const analysis = analyzeTopLevelMultiline(prepared.prepared);
  if (!analysis.isTopLevelMultiline) {
    return prepared;
  }

  const trimmed = prepared.prepared.trim();
  if (/^\\begin\{/.test(trimmed)) {
    return prepared;
  }

  const env = analysis.hasTopLevelAlignmentAmp ? 'aligned' : 'gathered';
  const prefix = `\\begin{${env}}`;
  const suffix = `\\end{${env}}`;

  return {
    prepared: `${prefix}${prepared.prepared}${suffix}`,
    mapPreparedOffsetToSource: (offset: number) => {
      const innerOffset = Math.max(0, Math.min(prepared.prepared.length, offset - prefix.length));
      return prepared.mapPreparedOffsetToSource(innerOffset);
    },
  };
}

export function detectErrorTokenLength(source: string, index: number): number {
  if (index < 0 || index >= source.length) return 1;
  const tail = source.slice(index);
  const cmdMatch = tail.match(/^\\[A-Za-z*]+/);
  if (cmdMatch) return cmdMatch[0].length;
  const wordMatch = tail.match(/^[A-Za-z0-9]+/);
  if (wordMatch) return wordMatch[0].length;
  return 1;
}

function extractMathMlFromHtmlAndMathml(renderedHtml: string): string {
  const start = renderedHtml.indexOf('<math');
  const end = renderedHtml.lastIndexOf('</math>');
  if (start === -1 || end === -1 || end < start) return '';
  return renderedHtml.slice(start, end + '</math>'.length);
}

function cleanKatexErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/^KaTeX parse error:\s*/i, '').trim();
}

export interface SingleCompileOutput {
  html: string;
  mathml: string;
  error: CompileError | null;
}

/**
 * Single-pass KaTeX compiler (generates both HTML & MathML in one parse call).
 */
export function compileSingleFormula(
  rawLatex: string,
  blockId?: string
): SingleCompileOutput {
  const trimmed = rawLatex.trim();
  if (!trimmed) {
    return { html: '', mathml: '', error: null };
  }

  // Strip outer delimiters safely if pasted/typed while keeping inner offset alignment
  const stripped = stripOuterMathDelimiters(rawLatex);
  const stripStartOffset = rawLatex.indexOf(stripped);
  const sourceBaseOffset = stripStartOffset >= 0 ? stripStartOffset : 0;

  const basePrepared = prepareLatexWithOffsetMap(stripped);
  const finalPrepared = wrapMultilineForKatex(basePrepared);

  try {
    const rendered = katex.renderToString(finalPrepared.prepared, {
      displayMode: true,
      throwOnError: true,
      output: 'htmlAndMathml',
      strict: 'ignore',
      trust: false,
      macros: {
        '\\placeholder': DISPLAY_PLACEHOLDER_TOKEN,
      },
    });

    return {
      html: rendered,
      mathml: extractMathMlFromHtmlAndMathml(rendered),
      error: null,
    };
  } catch (err) {
    const katexErr = err as { position?: number };
    const rawPos = typeof katexErr?.position === 'number' ? katexErr.position : 0;
    const mappedLocalIndex = finalPrepared.mapPreparedOffsetToSource(rawPos);
    const absoluteIndex = Math.max(
      0,
      Math.min(rawLatex.length, sourceBaseOffset + mappedLocalIndex)
    );
    const { line, column, rawLine } = computeLineAndColumn(rawLatex, absoluteIndex);
    const tokenLength = detectErrorTokenLength(rawLatex, absoluteIndex);

    return {
      html: '',
      mathml: '',
      error: {
        blockId,
        message: cleanKatexErrorMessage(err),
        index: absoluteIndex,
        tokenLength,
        line,
        column,
        rawLine,
      },
    };
  }
}

/**
 * Compiles the full DocumentModel (`single` or `mixed` block mode) once per store transaction.
 */
export function compileDocument(doc: DocumentModel): CompileResult {
  if (doc.mode === 'single') {
    const single = compileSingleFormula(doc.singleLatex, 'single');
    const isEmpty = doc.singleLatex.trim().length === 0;
    return {
      html: single.html,
      mathml: single.mathml,
      error: single.error,
      blockResults: [
        {
          blockId: 'single',
          type: 'math',
          html: single.html,
          mathml: single.mathml,
          error: single.error ?? undefined,
        },
      ],
      hasError: Boolean(single.error),
      isEmpty,
    };
  }

  const blockResults: BlockCompileResult[] = [];
  let firstError: CompileError | null = null;
  let combinedHtmlParts: string[] = [];
  const combinedMathMlParts: string[] = [];
  let hasAnyContent = false;

  for (const block of doc.blocks) {
    if (block.type === 'text') {
      if (block.content.trim().length > 0) hasAnyContent = true;
      const html = renderTextBlockHtml(block.content, (tex, displayMode) => {
        const compiled = katex.renderToString(
          prepareLatexWithOffsetMap(tex).prepared,
          {
            displayMode,
            throwOnError: false,
            strict: 'ignore',
            trust: false,
          }
        );
        return compiled;
      });
      blockResults.push({
        blockId: block.id,
        type: 'text',
        html,
      });
      combinedHtmlParts.push(
        `<div class="mixed-block mixed-block-text" data-block-id="${escapeHtml(block.id)}">${html}</div>`
      );
    } else {
      if (block.latex.trim().length > 0) hasAnyContent = true;
      const compiled = compileSingleFormula(block.latex, block.id);
      if (compiled.error && !firstError) {
        firstError = compiled.error;
      }
      if (compiled.mathml) {
        combinedMathMlParts.push(compiled.mathml);
      }
      const renderedBlockHtml = compiled.error
        ? `<div class="mixed-math-error">${escapeHtml(compiled.error.message)}</div>`
        : compiled.html || '<div class="mixed-math-empty">∅</div>';
      blockResults.push({
        blockId: block.id,
        type: 'math',
        html: renderedBlockHtml,
        mathml: compiled.mathml,
        error: compiled.error ?? undefined,
      });
      combinedHtmlParts.push(
        `<div class="mixed-block mixed-block-math" data-block-id="${escapeHtml(block.id)}">${renderedBlockHtml}</div>`
      );
    }
  }

  return {
    html: `<div class="mixed-content-rendered">${combinedHtmlParts.join('\n')}</div>`,
    mathml: combinedMathMlParts.join('\n'),
    error: firstError,
    blockResults,
    hasError: Boolean(firstError),
    isEmpty: !hasAnyContent,
  };
}

/**
 * Memoized KaTeX preview rendering for SymbolPalette cards (renders each symbol once).
 */
export function renderSymbolPreviewHtml(latex: string): string {
  const cached = SYMBOL_PREVIEW_CACHE.get(latex);
  if (cached !== undefined) {
    return cached;
  }

  const prepared = prepareLatexWithOffsetMap(latex).prepared;
  let html: string;
  try {
    html = katex.renderToString(prepared, {
      displayMode: false,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      macros: {
        '\\placeholder': '{\\color{#94a3b8}\\square}',
      },
    });
  } catch {
    html = `<code>${escapeHtml(latex)}</code>`;
  }

  if (SYMBOL_PREVIEW_CACHE.size >= MAX_SYMBOL_CACHE_SIZE) {
    SYMBOL_PREVIEW_CACHE.clear();
  }
  SYMBOL_PREVIEW_CACHE.set(latex, html);
  return html;
}

export function clearSymbolPreviewCache(): void {
  SYMBOL_PREVIEW_CACHE.clear();
}

export { isEscapedAt };
