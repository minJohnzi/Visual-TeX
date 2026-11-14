import {
  analyzeTopLevelMultiline,
  countPrecedingBackslashes,
  findMatchingBrace,
  splitTopLevelLineBreaks,
} from './scanner';
import {
  autoWrapNakedChinese,
  normalizeFullwidthPunctuation,
  stripOuterMathDelimiters,
  stripTrailingIsolatedBackslash,
} from './protocol';

export interface EnclosingEnvMatch {
  env: string;
  body: string;
}

/**
 * Checks if the trimmed formula is wholly wrapped in `\begin{env}...\end{env}`.
 */
export function hasEnclosingEnvironment(latex: string): EnclosingEnvMatch | null {
  const trimmed = latex.trim();
  const startMatch = trimmed.match(/^\\begin\{([A-Za-z0-9*]+)\}/);
  if (!startMatch) return null;
  const env = startMatch[1];
  const endTag = `\\end{${env}}`;
  if (!trimmed.endsWith(endTag)) return null;

  // Verify the opening \begin{env} isn't closed before the final \end{env}
  const beginTag = `\\begin{${env}}`;
  let depth = 0;
  let pos = 0;
  while (pos < trimmed.length) {
    const nextBegin = trimmed.indexOf(beginTag, pos);
    const nextEnd = trimmed.indexOf(endTag, pos);
    if (nextBegin !== -1 && (nextEnd === -1 || nextBegin < nextEnd)) {
      depth++;
      pos = nextBegin + beginTag.length;
    } else if (nextEnd !== -1) {
      depth--;
      if (depth === 0) {
        if (nextEnd + endTag.length === trimmed.length) {
          return {
            env,
            body: trimmed.slice(beginTag.length, nextEnd).trim(),
          };
        }
        return null;
      }
      pos = nextEnd + endTag.length;
    } else {
      break;
    }
  }
  return null;
}

/**
 * Safely unwraps MathLive's `\displaylines{...}` wrapper using balanced brace matching.
 */
export function unwrapDisplaylines(latex: string): string {
  const trimmed = latex.trim();
  if (!trimmed.startsWith('\\displaylines')) {
    return latex;
  }

  let cursor = '\\displaylines'.length;
  while (cursor < trimmed.length && /\s/.test(trimmed[cursor])) {
    cursor++;
  }
  if (trimmed[cursor] !== '{') {
    return latex;
  }

  const closeIdx = findMatchingBrace(trimmed, cursor);
  if (closeIdx === -1 || closeIdx !== trimmed.length - 1) {
    return latex;
  }

  return trimmed.slice(cursor + 1, closeIdx).trim();
}

/**
 * Formats top-level multiline breaks and `\begin...\end` blocks cleanly for Source mode.
 */
export function formatMultilineLatex(latex: string): string {
  const clean = latex.trim();
  if (!clean) return '';

  const unwrapped = unwrapDisplaylines(clean);
  const envMatch = hasEnclosingEnvironment(unwrapped);
  if (envMatch) {
    const lines = splitTopLevelLineBreaks(envMatch.body)
      .map((line) => line.trim())
      .filter((line, idx, arr) => line.length > 0 || (idx > 0 && idx < arr.length - 1));
    if (lines.length === 0) {
      return `\\begin{${envMatch.env}}\n  \n\\end{${envMatch.env}}`;
    }
    const formattedBody = lines.map((line) => `  ${line}`).join(' \\\\\n');
    return `\\begin{${envMatch.env}}\n${formattedBody}\n\\end{${envMatch.env}}`;
  }

  const parts = splitTopLevelLineBreaks(unwrapped);
  if (parts.length <= 1) {
    return unwrapped;
  }

  return parts
    .map((part) => part.trim())
    .filter((part, idx, arr) => part.length > 0 || (idx > 0 && idx < arr.length - 1))
    .join(' \\\\\n');
}

/**
 * Converts clean canonical source LaTeX into a representation friendly to MathLive `<math-field>`.
 */
export function sourceToMathfieldLatex(sourceLatex: string): string {
  const clean = stripOuterMathDelimiters(sourceLatex).trim();
  if (!clean) return '';

  const envMatch = hasEnclosingEnvironment(clean);
  if (envMatch) {
    return clean;
  }

  if (clean.startsWith('\\displaylines')) {
    return clean;
  }

  const analysis = analyzeTopLevelMultiline(clean);
  if (analysis.isTopLevelMultiline) {
    if (analysis.hasTopLevelAlignmentAmp) {
      return `\\begin{aligned}\n${clean}\n\\end{aligned}`;
    }
    const normalizedLines = splitTopLevelLineBreaks(clean)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(' \\\\ ');
    return `\\displaylines{${normalizedLines}}`;
  }

  return clean;
}

/**
 * Converts MathLive `<math-field>` LaTeX output back to clean canonical source LaTeX.
 */
export function mathfieldToSourceLatex(mathfieldLatex: string): string {
  let result = mathfieldLatex.trim();
  if (!result) return '';

  // MathLive occasionally emits `#?` for empty placeholders in older/certain commands
  result = result.replace(/#\?/g, '\\placeholder{}');

  const unwrapped = unwrapDisplaylines(result);
  if (unwrapped !== result) {
    return formatMultilineLatex(unwrapped);
  }

  return result;
}

/**
 * Conservative, deterministic syntax cleanup/auto-fix utility invoked explicitly by user command.
 */
export function autoFixLatexSyntax(rawLatex: string): string {
  let fixed = stripOuterMathDelimiters(rawLatex);
  fixed = normalizeFullwidthPunctuation(fixed);
  fixed = autoWrapNakedChinese(fixed);
  fixed = stripTrailingIsolatedBackslash(fixed);

  // Balance unclosed curly braces at the end (outside comments/escaped braces)
  let openBraces = 0;
  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i];
    if (ch === '%') {
      while (i < fixed.length && fixed[i] !== '\n') i++;
      continue;
    }
    if ((ch === '{' || ch === '}') && countPrecedingBackslashes(fixed, i) % 2 === 1) {
      continue;
    }
    if (ch === '{') openBraces++;
    else if (ch === '}' && openBraces > 0) openBraces--;
  }
  if (openBraces > 0) {
    fixed = fixed + '}'.repeat(openBraces);
  }

  // Balance unmatched `\left` without `\right` conservatively by appending `\right.`
  const leftCount = (fixed.match(/\\left(?![A-Za-z])/g) || []).length;
  const rightCount = (fixed.match(/\\right(?![A-Za-z])/g) || []).length;
  if (leftCount > rightCount) {
    fixed = `${fixed}${' \\right.'.repeat(leftCount - rightCount)}`;
  }

  return fixed.trim();
}

export function detectFormulaMode(latex: string): 'inline' | 'display' {
  const trimmed = latex.trim();
  if (!trimmed) return 'inline';
  if (/\\begin\{/.test(trimmed)) return 'display';
  if (/\\dfrac|\\displaystyle|\\sum_|\\prod_|\\int_|\\lim_/.test(trimmed)) return 'display';
  const analysis = analyzeTopLevelMultiline(trimmed);
  if (analysis.isTopLevelMultiline) return 'display';
  return trimmed.length > 45 ? 'display' : 'inline';
}

export function estimateFormulaLineCount(latex: string): number {
  const trimmed = latex.trim();
  if (!trimmed) return 1;
  const breaks = splitTopLevelLineBreaks(unwrapDisplaylines(trimmed));
  const rawNewlines = trimmed.split('\n').length;
  return Math.max(1, breaks.length, rawNewlines);
}

function findTopLevelEqualsOffsets(line: string): Array<{ start: number; end: number; hasAmp: boolean }> {
  const matches: Array<{ start: number; end: number; hasAmp: boolean }> = [];
  let braceDepth = 0;
  let envDepth = 0;

  for (let i = 0; i < line.length; i++) {
    if (countPrecedingBackslashes(line, i) % 2 === 1) continue;

    if (line.startsWith('\\begin{', i)) {
      envDepth++;
      i += 6;
      continue;
    }
    if (line.startsWith('\\end{', i)) {
      envDepth = Math.max(0, envDepth - 1);
      i += 4;
      continue;
    }

    const ch = line[i];
    if (ch === '{') {
      braceDepth++;
      continue;
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }

    if (braceDepth !== 0 || envDepth !== 0) continue;

    if (ch === '&') {
      let j = i + 1;
      while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++;
      if (line[j] === '=' && line[j + 1] !== '=') {
        matches.push({ start: i, end: j + 1, hasAmp: true });
        i = j;
      }
      continue;
    }

    if (ch === '=') {
      const prev = i > 0 ? line[i - 1] : '';
      const next = i + 1 < line.length ? line[i + 1] : '';
      if (prev !== '<' && prev !== '>' && prev !== '!' && prev !== ':' && prev !== '=' && next !== '=') {
        matches.push({ start: i, end: i + 1, hasAmp: false });
      }
    }
  }

  return matches;
}

function alignLineOnFirstEquals(line: string): string {
  const matches = findTopLevelEqualsOffsets(line);
  if (matches.length === 0) return line;
  if (matches.some((m) => m.hasAmp)) return line;
  const first = matches[0];
  return `${line.slice(0, first.start).trimEnd()} &= ${line.slice(first.end).trimStart()}`;
}

function extractStepRhsFromLine(line: string): string {
  const matches = findTopLevelEqualsOffsets(line);
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const rhs = line.slice(last.end).trim();
    return rhs.length > 0 ? rhs : '\\placeholder{}';
  }
  const stripped = line.replace(/^\s*&\s*/, '').trim();
  return stripped.length > 0 ? stripped : '\\placeholder{}';
}

export function deriveNextStepLatex(rawLatex: string): string {
  const stripped = unwrapDisplaylines(stripOuterMathDelimiters(rawLatex)).trim();
  if (!stripped) {
    return '\\begin{aligned}\n\\placeholder{} &= \\placeholder{}\n\\end{aligned}';
  }

  const alignEnvMatch = /^\s*\\begin\{(aligned|align\*?|gather\*?|split)\}([\s\S]*)\\end\{\1\}\s*$/.exec(
    stripped
  );

  if (alignEnvMatch) {
    const envName = alignEnvMatch[1];
    const body = alignEnvMatch[2].trim();
    const lines = splitTopLevelLineBreaks(body).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return `\\begin{${envName}}\n\\placeholder{} &= \\placeholder{}\n\\end{${envName}}`;
    }
    const lastLine = lines[lines.length - 1];
    const rhs = extractStepRhsFromLine(lastLine);
    const cleanedBody = body.replace(/\s*\\\\\s*$/, '');
    return `\\begin{${envName}}\n${cleanedBody} \\\\\n&= ${rhs}\n\\end{${envName}}`;
  }

  const lines = splitTopLevelLineBreaks(stripped).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) {
    const line = lines[0] ?? stripped;
    const eqs = findTopLevelEqualsOffsets(line);
    if (eqs.length === 0) {
      const noLeadingAmp = line.replace(/^\s*&\s*/, '').trim();
      return `\\begin{aligned}\n&${noLeadingAmp} \\\\\n&= ${noLeadingAmp}\n\\end{aligned}`;
    }
    const alignedFirst = alignLineOnFirstEquals(line);
    const rhs = extractStepRhsFromLine(line);
    return `\\begin{aligned}\n${alignedFirst} \\\\\n&= ${rhs}\n\\end{aligned}`;
  }

  const alignedLines = lines.map((line, index) =>
    index === 0 ? alignLineOnFirstEquals(line.trim()) : line.trim()
  );
  const rhs = extractStepRhsFromLine(lines[lines.length - 1]);
  return `\\begin{aligned}\n${alignedLines.join(' \\\\\n')} \\\\\n&= ${rhs}\n\\end{aligned}`;
}
