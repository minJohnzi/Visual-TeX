import { describe, it, expect } from 'vitest';
import { wrapWithDelimiter } from './delimiter';

describe('wrapWithDelimiter', () => {
  const formula = 'E = mc^2';

  it('wraps with none mode', () => {
    expect(wrapWithDelimiter(formula, 'none')).toBe('E = mc^2');
  });

  it('wraps with inline mode ($...$)', () => {
    expect(wrapWithDelimiter(formula, 'inline')).toBe('$E = mc^2$');
  });

  it('wraps with display mode ($$...$$)', () => {
    expect(wrapWithDelimiter(formula, 'display')).toBe('$$\nE = mc^2\n$$');
  });

  it('wraps with equation mode (\\begin{equation}...\\end{equation})', () => {
    expect(wrapWithDelimiter(formula, 'equation')).toBe('\\begin{equation}\nE = mc^2\n\\end{equation}');
  });

  it('prevents double wrapping if input already has delimiters', () => {
    const wrapped = '$x + y$';
    expect(wrapWithDelimiter(wrapped, 'equation')).toBe('\\begin{equation}\nx + y\n\\end{equation}');
    const eqWrapped = '\\begin{equation}\nx = 1\n\\end{equation}';
    expect(wrapWithDelimiter(eqWrapped, 'inline')).toBe('$x = 1$');
  });

  it('handles empty strings cleanly', () => {
    expect(wrapWithDelimiter('', 'inline')).toBe('');
    expect(wrapWithDelimiter('   ', 'equation')).toBe('');
  });
});
