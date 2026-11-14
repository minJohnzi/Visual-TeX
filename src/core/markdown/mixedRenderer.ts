import katex from 'katex';
import { ContentBlock, DelimiterMode } from '../types';
import { escapeHtml, sanitizeMathForDisplay, stripOuterMathDelimiters, wrapWithDelimiter } from '../latex/protocol';

export type InlineMathRenderer = (tex: string, displayMode: boolean) => string;

function defaultInlineMathRenderer(tex: string, displayMode: boolean): string {
  const prepared = sanitizeMathForDisplay(tex.trim());
  try {
    return katex.renderToString(prepared, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

/**
 * Formats inline Markdown (inline `$...$` / `\(...\)`, `code`, `**bold**`, `*italic*`)
 * while escaping raw text before inline tag injection to prevent HTML injection.
 */
export function formatMarkdownInline(
  text: string,
  renderMath: InlineMathRenderer = defaultInlineMathRenderer
): string {
  // Tokenize inline math & inline code first so their contents aren't altered by bold/italic
  const tokens: Array<{ type: 'text' | 'code' | 'math'; value: string }> = [];
  let cursor = 0;
  const inlineTokenRe = /(`[^`\n]+`|\$(?!\$)(?:\\.|[^$\\\n])+\$|\\\((?:\\.|[\s\S])*?\\\))/g;
  let m: RegExpExecArray | null;

  while ((m = inlineTokenRe.exec(text)) !== null) {
    if (m.index > cursor) {
      tokens.push({ type: 'text', value: text.slice(cursor, m.index) });
    }
    const raw = m[0];
    if (raw.startsWith('`')) {
      tokens.push({ type: 'code', value: raw.slice(1, -1) });
    } else {
      tokens.push({ type: 'math', value: stripOuterMathDelimiters(raw) });
    }
    cursor = m.index + raw.length;
  }
  if (cursor < text.length) {
    tokens.push({ type: 'text', value: text.slice(cursor) });
  }

  return tokens
    .map((tok) => {
      if (tok.type === 'code') {
        return `<code class="mixed-inline-code">${escapeHtml(tok.value)}</code>`;
      }
      if (tok.type === 'math') {
        return `<span class="mixed-inline-math">${renderMath(tok.value, false)}</span>`;
      }
      let safe = escapeHtml(tok.value);
      safe = safe.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      safe = safe.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
      return safe;
    })
    .join('');
}

/**
 * Renders a Markdown TextBlock (supports headings, lists, blockquotes, hr, paragraphs, and inline math).
 */
export function renderTextBlockHtml(
  markdown: string,
  renderMath: InlineMathRenderer = defaultInlineMathRenderer
): string {
  const normalized = markdown.replace(/\r\n?/g, '\n').trim();
  if (!normalized) {
    return '<div class="mixed-text-block mixed-text-empty"></div>';
  }

  const lines = normalized.split('\n');
  const htmlParts: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const content = paragraphLines
      .map((line) => formatMarkdownInline(line, renderMath))
      .join('<br />');
    htmlParts.push(`<p>${content}</p>`);
    paragraphLines = [];
  };

  const closeList = () => {
    if (!listType) return;
    htmlParts.push(`</${listType}>`);
    listType = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    // Fenced display math $$...$$ inside text block
    if (trimmed.startsWith('$$')) {
      flushParagraph();
      closeList();
      if (trimmed.endsWith('$$') && trimmed.length > 4) {
        const inner = trimmed.slice(2, -2).trim();
        htmlParts.push(`<div class="mixed-text-display-math">${renderMath(inner, true)}</div>`);
        continue;
      }
      const mathLines: string[] = [trimmed.slice(2)];
      let j = i + 1;
      while (j < lines.length) {
        const endIdx = lines[j].indexOf('$$');
        if (endIdx !== -1) {
          mathLines.push(lines[j].slice(0, endIdx));
          i = j;
          break;
        }
        mathLines.push(lines[j]);
        j++;
      }
      if (j >= lines.length) i = lines.length - 1;
      htmlParts.push(
        `<div class="mixed-text-display-math">${renderMath(mathLines.join('\n').trim(), true)}</div>`
      );
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph();
      closeList();
      htmlParts.push('<hr />');
      continue;
    }

    // Headings H1-H4
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = headingMatch[1].length;
      htmlParts.push(
        `<h${level}>${formatMarkdownInline(headingMatch[2], renderMath)}</h${level}>`
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      flushParagraph();
      closeList();
      const quoteText = trimmed.replace(/^>\s?/, '');
      htmlParts.push(
        `<blockquote>${formatMarkdownInline(quoteText, renderMath)}</blockquote>`
      );
      continue;
    }

    // Unordered list
    const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        htmlParts.push('<ul>');
      }
      htmlParts.push(`<li>${formatMarkdownInline(ulMatch[1], renderMath)}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        htmlParts.push('<ol>');
      }
      htmlParts.push(`<li>${formatMarkdownInline(olMatch[1], renderMath)}</li>`);
      continue;
    }

    closeList();
    paragraphLines.push(rawLine);
  }

  flushParagraph();
  closeList();

  return `<div class="mixed-text-block">${htmlParts.join('\n')}</div>`;
}

function defaultMarkdownBlockId(index: number, type: 'text' | 'math'): string {
  return `${type === 'text' ? 'txt' : 'math'}-${index + 1}-${Date.now().toString(36)}`;
}

export function parseMarkdownToBlocks(
  rawMarkdown: string,
  idFactory: (index: number, type: 'text' | 'math') => string = defaultMarkdownBlockId
): ContentBlock[] {
  const source = rawMarkdown.replace(/\r\n/g, '\n');
  if (!source.trim()) return [];

  const entries: Array<{ type: 'text'; content: string } | { type: 'math'; latex: string }> = [];
  const textBuffer: string[] = [];

  const flushText = () => {
    const joined = textBuffer.join('\n').trim();
    textBuffer.length = 0;
    if (joined.length > 0) {
      entries.push({ type: 'text', content: joined });
    }
  };

  const lines = source.split('\n');
  let i = 0;
  let inCodeFence: string | null = null;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    const fenceMatch = /^(```+|~~~+)/.exec(trimmed);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inCodeFence) {
        inCodeFence = marker;
      } else if (inCodeFence === marker) {
        inCodeFence = null;
      }
      textBuffer.push(line);
      i++;
      continue;
    }

    if (inCodeFence) {
      textBuffer.push(line);
      i++;
      continue;
    }

    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
      const inner = trimmed.slice(2, -2).trim();
      if (!inner.includes('$$')) {
        flushText();
        entries.push({ type: 'math', latex: inner });
        i++;
        continue;
      }
    }

    if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length > 4) {
      const inner = trimmed.slice(2, -2).trim();
      flushText();
      entries.push({ type: 'math', latex: inner });
      i++;
      continue;
    }

    if (trimmed === '$$') {
      let j = i + 1;
      const mathLines: string[] = [];
      let closed = false;
      while (j < lines.length) {
        if (lines[j].trim() === '$$') {
          closed = true;
          break;
        }
        mathLines.push(lines[j]);
        j++;
      }
      if (closed) {
        flushText();
        entries.push({ type: 'math', latex: mathLines.join('\n').trim() });
        i = j + 1;
        continue;
      }
    }

    if (trimmed === '\\[') {
      let j = i + 1;
      const mathLines: string[] = [];
      let closed = false;
      while (j < lines.length) {
        if (lines[j].trim() === '\\]') {
          closed = true;
          break;
        }
        mathLines.push(lines[j]);
        j++;
      }
      if (closed) {
        flushText();
        entries.push({ type: 'math', latex: mathLines.join('\n').trim() });
        i = j + 1;
        continue;
      }
    }

    textBuffer.push(line);
    i++;
  }

  flushText();

  return entries.map((entry, idx) =>
    entry.type === 'text'
      ? { id: idFactory(idx, 'text'), type: 'text', content: entry.content }
      : { id: idFactory(idx, 'math'), type: 'math', latex: entry.latex }
  );
}

export function serializeBlocksToMarkdown(
  blocks: ContentBlock[],
  delimiterMode: DelimiterMode = 'display'
): string {
  const effectiveDelimiter: DelimiterMode = delimiterMode === 'none' ? 'display' : delimiterMode;
  return blocks
    .map((block) => {
      if (block.type === 'text') {
        return block.content.trim();
      }
      const raw = stripOuterMathDelimiters(block.latex).trim();
      if (!raw) return '';
      if (effectiveDelimiter === 'inline' && raw.includes('\n')) {
        return `$$\n${raw}\n$$`;
      }
      if (effectiveDelimiter === 'display') {
        return `$$\n${raw}\n$$`;
      }
      return wrapWithDelimiter(raw, effectiveDelimiter);
    })
    .filter((segment) => segment.length > 0)
    .join('\n\n');
}
