/**
 * Unified, single-pass O(N) LaTeX lexical / structural scanner.
 * Replaces duplicate brace, environment, comment, and text-command walkers.
 */

const TEXT_CONTENT_COMMANDS = new Set([
  'text',
  'textbf',
  'textit',
  'textrm',
  'textsf',
  'texttt',
  'textsc',
  'textup',
  'textnormal',
  'mbox',
  'hbox',
  'mathrm',
  'mathit',
  'mathbf',
  'mathsf',
  'mathtt',
  'operatorname',
  'tag',
  'label',
  'ref',
  'eqref',
  'cite',
  'href',
  'url',
  'begin',
  'end',
]);

export interface TopLevelAnalysis {
  hasTopLevelLineBreak: boolean;
  hasTopLevelAlignmentAmp: boolean;
  isTopLevelMultiline: boolean;
  hasAnyEnvironment: boolean;
}

export function countPrecedingBackslashes(input: string, index: number): number {
  let count = 0;
  for (let i = index - 1; i >= 0 && input[i] === '\\'; i--) {
    count++;
  }
  return count;
}

export function isEscapedAt(input: string, index: number): boolean {
  return countPrecedingBackslashes(input, index) % 2 === 1;
}

/**
 * Finds the matching closing brace `}` for an opening `{` at `openIndex`.
 * Returns -1 if unbalanced.
 */
export function findMatchingBrace(input: string, openIndex: number): number {
  if (openIndex < 0 || openIndex >= input.length || input[openIndex] !== '{') {
    return -1;
  }
  let depth = 0;
  for (let i = openIndex; i < input.length; i++) {
    const ch = input[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '%') {
      while (i < input.length && input[i] !== '\n') {
        i++;
      }
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function skipOptionalBracketArgs(input: string, startIndex: number): number {
  let i = startIndex;
  while (i < input.length && (input[i] === ' ' || input[i] === '\t')) {
    i++;
  }
  if (input[i] === '[') {
    let depth = 1;
    i++;
    while (i < input.length && depth > 0) {
      if (input[i] === '\\') {
        i += 2;
        continue;
      }
      if (input[i] === '[') depth++;
      else if (input[i] === ']') depth--;
      i++;
    }
  }
  while (i < input.length && (input[i] === ' ' || input[i] === '\t')) {
    i++;
  }
  return i;
}

function readCommandName(input: string, backslashIndex: number): { name: string; endIndex: number } {
  let i = backslashIndex + 1;
  if (i >= input.length) {
    return { name: '', endIndex: i };
  }
  if (!/[A-Za-z]/.test(input[i])) {
    return { name: input[i], endIndex: i + 1 };
  }
  while (i < input.length && /[A-Za-z*]/.test(input[i])) {
    i++;
  }
  return { name: input.slice(backslashIndex + 1, i), endIndex: i };
}

/**
 * Returns true if `pos` is inside the `{...}` argument of a text-mode / label / env command
 * (e.g. `\text{...}`, `\mbox{...}`, `\mathrm{...}`, `\begin{...}`).
 */
export function isInsideTextCommand(input: string, pos: number): boolean {
  const limit = Math.min(pos, input.length);
  const stack: Array<{ isTextScope: boolean }> = [];
  let i = 0;

  while (i < limit) {
    const ch = input[i];
    if (ch === '%') {
      const nl = input.indexOf('\n', i);
      if (nl === -1 || nl >= limit) return true;
      i = nl + 1;
      continue;
    }
    if (ch === '\\') {
      const { name, endIndex } = readCommandName(input, i);
      if (TEXT_CONTENT_COMMANDS.has(name)) {
        const afterOpt = skipOptionalBracketArgs(input, endIndex);
        if (afterOpt < limit && input[afterOpt] === '{') {
          stack.push({ isTextScope: true });
          i = afterOpt + 1;
          continue;
        }
      }
      i = endIndex;
      continue;
    }
    if (ch === '{') {
      stack.push({ isTextScope: false });
      i++;
      continue;
    }
    if (ch === '}') {
      if (stack.length > 0) {
        stack.pop();
      }
      i++;
      continue;
    }
    i++;
  }

  return stack.some((entry) => entry.isTextScope);
}

/**
 * Single-pass structural analysis at depth 0 (outside `{...}` and `\begin...\end`).
 */
export function analyzeTopLevelMultiline(input: string): TopLevelAnalysis {
  let braceDepth = 0;
  let envDepth = 0;
  let hasTopLevelLineBreak = false;
  let hasTopLevelAlignmentAmp = false;
  let hasAnyEnvironment = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (ch === '%') {
      while (i < input.length && input[i] !== '\n') i++;
      continue;
    }

    if (ch === '\\') {
      const next = input[i + 1];
      if (next === '\\') {
        if (braceDepth === 0 && envDepth === 0) {
          hasTopLevelLineBreak = true;
        }
        i++;
        continue;
      }
      const { name, endIndex } = readCommandName(input, i);
      if (name === 'begin' || name === 'end') {
        const afterSpace = skipOptionalBracketArgs(input, endIndex);
        if (input[afterSpace] === '{') {
          const closeIdx = findMatchingBrace(input, afterSpace);
          if (closeIdx !== -1) {
            hasAnyEnvironment = true;
            if (name === 'begin') envDepth++;
            else envDepth = Math.max(0, envDepth - 1);
            i = closeIdx;
            continue;
          }
        }
      }
      i = Math.max(i, endIndex - 1);
      continue;
    }

    if (ch === '{') {
      braceDepth++;
    } else if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (ch === '&' && braceDepth === 0 && envDepth === 0) {
      hasTopLevelAlignmentAmp = true;
    }
  }

  return {
    hasTopLevelLineBreak,
    hasTopLevelAlignmentAmp,
    isTopLevelMultiline: hasTopLevelLineBreak || hasTopLevelAlignmentAmp,
    hasAnyEnvironment,
  };
}

/**
 * Splits `input` at top-level `\\` line breaks (ignoring `\\` nested inside braces/environments).
 * Preserves optional spacing suffixes like `\\[4pt]` or `\\*` by stripping them only if requested.
 */
export function splitTopLevelLineBreaks(input: string): string[] {
  const parts: string[] = [];
  let braceDepth = 0;
  let envDepth = 0;
  let segmentStart = 0;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (ch === '%') {
      while (i < input.length && input[i] !== '\n') i++;
      continue;
    }

    if (ch === '\\') {
      const next = input[i + 1];
      if (next === '\\') {
        if (braceDepth === 0 && envDepth === 0) {
          parts.push(input.slice(segmentStart, i));
          let breakEnd = i + 2;
          if (input[breakEnd] === '*') breakEnd++;
          if (input[breakEnd] === '[') {
            const closeBracket = input.indexOf(']', breakEnd + 1);
            if (closeBracket !== -1) {
              breakEnd = closeBracket + 1;
            }
          }
          segmentStart = breakEnd;
          i = breakEnd - 1;
          continue;
        }
        i++;
        continue;
      }

      const { name, endIndex } = readCommandName(input, i);
      if (name === 'begin' || name === 'end') {
        const afterOpt = skipOptionalBracketArgs(input, endIndex);
        if (input[afterOpt] === '{') {
          const closeIdx = findMatchingBrace(input, afterOpt);
          if (closeIdx !== -1) {
            if (name === 'begin') envDepth++;
            else envDepth = Math.max(0, envDepth - 1);
            i = closeIdx;
            continue;
          }
        }
      }
      i = Math.max(i, endIndex - 1);
      continue;
    }

    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
  }

  parts.push(input.slice(segmentStart));
  return parts;
}

/**
 * Splits a single matrix/environment row on unescaped top-level `&` separators.
 */
export function splitTopLevelAmpersands(row: string): string[] {
  const cells: string[] = [];
  let braceDepth = 0;
  let envDepth = 0;
  let cellStart = 0;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '%') {
      while (i < row.length && row[i] !== '\n') i++;
      continue;
    }
    if (ch === '\\') {
      const { name, endIndex } = readCommandName(row, i);
      if (name === 'begin' || name === 'end') {
        const afterOpt = skipOptionalBracketArgs(row, endIndex);
        if (row[afterOpt] === '{') {
          const closeIdx = findMatchingBrace(row, afterOpt);
          if (closeIdx !== -1) {
            if (name === 'begin') envDepth++;
            else envDepth = Math.max(0, envDepth - 1);
            i = closeIdx;
            continue;
          }
        }
      }
      i = Math.max(i, endIndex - 1);
      continue;
    }
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === '&' && braceDepth === 0 && envDepth === 0) {
      cells.push(row.slice(cellStart, i));
      cellStart = i + 1;
    }
  }

  cells.push(row.slice(cellStart));
  return cells;
}

/**
 * Applies `transformMathChunk` only to characters outside comments (`%...`),
 * escaped commands, and text-command arguments (`\text{...}`, `\mbox{...}`, `\mathrm{...}`, etc.).
 */
export function transformMathModeOnly(
  input: string,
  transformMathChunk: (chunk: string) => string
): string {
  let out = '';
  let plainStart = 0;
  let i = 0;

  const flushPlain = (end: number) => {
    if (end > plainStart) {
      out += transformMathChunk(input.slice(plainStart, end));
    }
  };

  while (i < input.length) {
    const ch = input[i];

    if (ch === '%') {
      flushPlain(i);
      const nl = input.indexOf('\n', i);
      const end = nl === -1 ? input.length : nl + 1;
      out += input.slice(i, end);
      i = end;
      plainStart = i;
      continue;
    }

    if (ch === '\\') {
      flushPlain(i);
      const { name, endIndex } = readCommandName(input, i);

      if (TEXT_CONTENT_COMMANDS.has(name)) {
        const afterOpt = skipOptionalBracketArgs(input, endIndex);
        if (afterOpt < input.length && input[afterOpt] === '{') {
          const closeIdx = findMatchingBrace(input, afterOpt);
          if (closeIdx !== -1) {
            out += input.slice(i, closeIdx + 1);
            i = closeIdx + 1;
            plainStart = i;
            continue;
          }
        }
      }

      out += input.slice(i, endIndex);
      i = endIndex;
      plainStart = i;
      continue;
    }

    i++;
  }

  flushPlain(input.length);
  return out;
}

/**
 * Inserts clean newlines around top-level `\\` breaks in Source mode formatting.
 */
export function formatTopLevelBreaksWithNewline(input: string): string {
  const parts = splitTopLevelLineBreaks(input);
  if (parts.length <= 1) {
    return input.trim();
  }
  return parts
    .map((part) => part.trim())
    .filter((part, idx, arr) => part.length > 0 || (idx > 0 && idx < arr.length - 1))
    .join(' \\\\\n');
}
