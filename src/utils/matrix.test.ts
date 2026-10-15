import { describe, it, expect } from 'vitest';
import {
  parseMatrix,
  appendMatrixCol,
  appendMatrixRow,
  deleteMatrixCol,
  deleteMatrixRow,
  splitTopLevel,
} from './matrix';

describe('Matrix operations', () => {
  it('correctly splits top-level delimiters while respecting nested braces', () => {
    const text = 'a & \\frac{b & c}{d} & e';
    const cells = splitTopLevel(text, '&');
    expect(cells.length).toBe(3);
    expect(cells[0].trim()).toBe('a');
    expect(cells[1].trim()).toBe('\\frac{b & c}{d}');
    expect(cells[2].trim()).toBe('e');
  });

  it('correctly splits rows with nested \\begin...\\end environments', () => {
    const text = '1 & 2 \\\\ 3 & \\begin{pmatrix} 4 \\\\ 5 \\end{pmatrix}';
    const rows = splitTopLevel(text, '\\\\');
    expect(rows.length).toBe(2);
    expect(rows[1]).toContain('\\begin{pmatrix} 4 \\\\ 5 \\end{pmatrix}');
  });

  it('handles user specified single-line matrix case: append column then append row', () => {
    const input = '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}';

    // 1. 追加一列
    const colAppended = appendMatrixCol(input);
    const parsedCol = parseMatrix(colAppended);
    expect(parsedCol.matched).toBe(true);
    expect(parsedCol.grid.length).toBe(2);
    expect(parsedCol.grid[0].length).toBe(3);
    expect(parsedCol.grid[1].length).toBe(3);
    expect(parsedCol.grid[0][0]).toBe('a');
    expect(parsedCol.grid[0][1]).toBe('b');
    expect(parsedCol.grid[0][2]).toBe('\\placeholder{}');
    expect(parsedCol.grid[1][0]).toBe('c');
    expect(parsedCol.grid[1][1]).toBe('d');
    expect(parsedCol.grid[1][2]).toBe('\\placeholder{}');

    // 2. 再追加一行
    const rowAppended = appendMatrixRow(colAppended);
    const parsedRow = parseMatrix(rowAppended);
    expect(parsedRow.matched).toBe(true);
    expect(parsedRow.grid.length).toBe(3);
    expect(parsedRow.grid[0].length).toBe(3);
    expect(parsedRow.grid[1].length).toBe(3);
    expect(parsedRow.grid[2].length).toBe(3);
    expect(parsedRow.grid[2]).toEqual(['\\placeholder{}', '\\placeholder{}', '\\placeholder{}']);
  });

  it('handles row and column deletions safely', () => {
    const input = '\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}';
    const rowDeleted = deleteMatrixRow(input);
    const parsedRow = parseMatrix(rowDeleted);
    expect(parsedRow.grid.length).toBe(1);
    expect(parsedRow.grid[0].length).toBe(2);

    const colDeleted = deleteMatrixCol(input);
    const parsedCol = parseMatrix(colDeleted);
    expect(parsedCol.grid.length).toBe(2);
    expect(parsedCol.grid[0].length).toBe(1);
  });

  it('does not corrupt when deleting last remaining row or column', () => {
    const single1x1 = '\\begin{matrix} 1 \\end{matrix}';
    expect(deleteMatrixRow(single1x1)).toBe(single1x1);
    expect(deleteMatrixCol(single1x1)).toBe(single1x1);
  });

  it('supports various matrix types: pmatrix, bmatrix, vmatrix, Bmatrix, Vmatrix, cases, aligned', () => {
    for (const env of ['pmatrix', 'bmatrix', 'vmatrix', 'Bmatrix', 'Vmatrix', 'cases', 'aligned']) {
      const code = `\\begin{${env}}\n  x & y \\\\\n  z & w\n\\end{${env}}`;
      const appended = appendMatrixCol(code);
      expect(appended).toContain(`\\begin{${env}}`);
      expect(appended).toContain(`\\end{${env}}`);
      const parsed = parseMatrix(appended);
      expect(parsed.grid[0].length).toBe(3);
    }
  });
});
