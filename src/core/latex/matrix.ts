import { MatrixEnv } from '../types';
import { CANONICAL_PLACEHOLDER } from './protocol';
import { splitTopLevelAmpersands, splitTopLevelLineBreaks } from './scanner';

const MATRIX_LIKE_ENVS = new Set([
  'matrix',
  'pmatrix',
  'bmatrix',
  'Bmatrix',
  'vmatrix',
  'Vmatrix',
  'smallmatrix',
  'cases',
  'dcases',
  'rcases',
  'aligned',
  'gathered',
]);

export interface MatrixMatch {
  env: string;
  rows: string[][];
  start: number;
  end: number;
}

export interface MatrixEditResult {
  latex: string;
  changed: boolean;
}

function findEnclosingMatrixBlock(
  latex: string,
  cursorPos?: number
): { env: string; body: string; start: number; end: number } | null {
  const stack: Array<{ env: string; start: number; bodyStart: number }> = [];
  const matches: Array<{ env: string; body: string; start: number; end: number }> = [];
  const tokenRe = /\\(begin|end)\{([A-Za-z0-9*]+)\}/g;

  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(latex)) !== null) {
    const kind = m[1];
    const env = m[2];
    if (kind === 'begin') {
      stack.push({ env, start: m.index, bodyStart: m.index + m[0].length });
    } else {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].env === env) {
          const open = stack.splice(i, 1)[0];
          if (MATRIX_LIKE_ENVS.has(env)) {
            matches.push({
              env,
              body: latex.slice(open.bodyStart, m.index),
              start: open.start,
              end: m.index + m[0].length,
            });
          }
          break;
        }
      }
    }
  }

  if (matches.length === 0) return null;

  if (typeof cursorPos === 'number') {
    const enclosing = matches.filter((item) => cursorPos >= item.start && cursorPos <= item.end);
    if (enclosing.length > 0) {
      // Pick the innermost enclosing matrix
      return enclosing.sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    }
  }

  return matches[0];
}

/**
 * Parses the enclosing (or first) matrix-like environment into rows and columns.
 */
export function parseMatrix(latex: string, cursorPos?: number): MatrixMatch | null {
  const block = findEnclosingMatrixBlock(latex, cursorPos);
  if (!block) return null;

  const rawRows = splitTopLevelLineBreaks(block.body)
    .map((r) => r.trim())
    .filter((r, idx, arr) => r.length > 0 || arr.length === 1);

  const rows = (rawRows.length > 0 ? rawRows : ['']).map((row) =>
    splitTopLevelAmpersands(row).map((cell) => cell.trim())
  );

  return {
    env: block.env,
    rows,
    start: block.start,
    end: block.end,
  };
}

export function serializeMatrix(env: string, rows: string[][]): string {
  const safeRows = rows.length > 0 ? rows : [[CANONICAL_PLACEHOLDER]];
  const body = safeRows
    .map((row) => `  ${row.map((cell) => cell.trim() || CANONICAL_PLACEHOLDER).join(' & ')}`)
    .join(' \\\\\n');
  return `\\begin{${env}}\n${body}\n\\end{${env}}`;
}

export function generateMatrixTemplate(
  env: MatrixEnv,
  rowCount: number,
  colCount: number
): string {
  const safeRows = Math.max(1, Math.min(8, Math.floor(rowCount)));
  const safeCols = env === 'cases' ? 1 : Math.max(1, Math.min(8, Math.floor(colCount)));

  const rows: string[][] = Array.from({ length: safeRows }, () =>
    Array.from({ length: safeCols }, () => CANONICAL_PLACEHOLDER)
  );
  return serializeMatrix(env, rows);
}

function replaceMatrixBlock(
  latex: string,
  match: MatrixMatch,
  nextRows: string[][]
): MatrixEditResult {
  const serialized = serializeMatrix(match.env, nextRows);
  const nextLatex =
    latex.slice(0, match.start) + serialized + latex.slice(match.end);
  return { latex: nextLatex, changed: true };
}

export function appendMatrixRow(latex: string, cursorPos?: number): MatrixEditResult {
  const match = parseMatrix(latex, cursorPos);
  if (!match) return { latex, changed: false };
  const colCount = Math.max(1, ...match.rows.map((r) => r.length));
  const newRow = Array.from({ length: colCount }, () => CANONICAL_PLACEHOLDER);
  return replaceMatrixBlock(latex, match, [...match.rows, newRow]);
}

export function appendMatrixCol(latex: string, cursorPos?: number): MatrixEditResult {
  const match = parseMatrix(latex, cursorPos);
  if (!match) return { latex, changed: false };
  const nextRows = match.rows.map((row) => [...row, CANONICAL_PLACEHOLDER]);
  return replaceMatrixBlock(latex, match, nextRows);
}

export function deleteMatrixRow(latex: string, cursorPos?: number): MatrixEditResult {
  const match = parseMatrix(latex, cursorPos);
  if (!match || match.rows.length <= 1) {
    return { latex, changed: false };
  }
  const nextRows = match.rows.slice(0, -1);
  return replaceMatrixBlock(latex, match, nextRows);
}

export function deleteMatrixCol(latex: string, cursorPos?: number): MatrixEditResult {
  const match = parseMatrix(latex, cursorPos);
  if (!match) return { latex, changed: false };
  const maxCols = Math.max(...match.rows.map((r) => r.length));
  if (maxCols <= 1) return { latex, changed: false };

  const nextRows = match.rows.map((row) =>
    row.length > 1 ? row.slice(0, -1) : row
  );
  return replaceMatrixBlock(latex, match, nextRows);
}
