import { describe, expect, it } from 'vitest';
import {
  appendMatrixCol,
  appendMatrixRow,
  deleteMatrixCol,
  deleteMatrixRow,
  generateMatrixTemplate,
  parseMatrix,
} from './matrix';

describe('matrix structural operations', () => {
  it('generates templates with canonical \\placeholder{} cells', () => {
    const tpl = generateMatrixTemplate('bmatrix', 2, 2);
    expect(tpl).toBe(
      '\\begin{bmatrix}\n  \\placeholder{} & \\placeholder{} \\\\\n  \\placeholder{} & \\placeholder{}\n\\end{bmatrix}'
    );

    const casesTpl = generateMatrixTemplate('cases', 2, 4);
    expect(casesTpl).not.toContain('&');
  });

  it('parses cells containing nested fractions and appends/deletes rows & cols safely', () => {
    const latex = '\\begin{pmatrix} \\frac{a}{b} & c \\\\ d & e \\end{pmatrix}';
    const parsed = parseMatrix(latex);
    expect(parsed).not.toBeNull();
    expect(parsed?.rows).toEqual([
      ['\\frac{a}{b}', 'c'],
      ['d', 'e'],
    ]);

    const addRow = appendMatrixRow(latex);
    expect(addRow.changed).toBe(true);
    expect(parseMatrix(addRow.latex)?.rows).toHaveLength(3);

    const addCol = appendMatrixCol(latex);
    expect(addCol.changed).toBe(true);
    expect(parseMatrix(addCol.latex)?.rows[0]).toHaveLength(3);

    const delRow = deleteMatrixRow(latex);
    expect(delRow.changed).toBe(true);
    expect(parseMatrix(delRow.latex)?.rows).toHaveLength(1);

    // Must not delete the last remaining row or column
    expect(deleteMatrixRow(delRow.latex).changed).toBe(false);
    const delCol = deleteMatrixCol(latex);
    expect(delCol.changed).toBe(true);
    expect(deleteMatrixCol(delCol.latex).changed).toBe(false);
  });

  it('disambiguates multiple matrices using cursor position', () => {
    const twoMatrices =
      '\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix} + \\begin{bmatrix} a \\\\ b \\end{bmatrix}';
    const secondStart = twoMatrices.indexOf('\\begin{bmatrix}') + 5;
    const picked = parseMatrix(twoMatrices, secondStart);
    expect(picked?.env).toBe('bmatrix');
  });
});
