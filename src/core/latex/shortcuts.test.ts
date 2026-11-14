import { describe, expect, it } from 'vitest';
import { getCommandCompletionsAtCursor, tryExpandShortcut } from './shortcuts';

describe('shortcuts & command completion', () => {
  it('expands symbol and word shortcuts on space trigger', () => {
    const res1 = tryExpandShortcut('x >=', 4);
    expect(res1?.expandedTo).toBe('\\geq');
    expect(res1?.nextValue).toBe('x \\geq ');

    const res2 = tryExpandShortcut('alpha', 5);
    expect(res2?.expandedTo).toBe('\\alpha');
    expect(res2?.nextValue).toBe('\\alpha ');

    const res3 = tryExpandShortcut('x -> oo', 7);
    expect(res3?.expandedTo).toBe('\\infty');
  });

  it('does not expand shortcuts inside \\text{}, \\mathrm{}, or already escaped commands', () => {
    expect(tryExpandShortcut('\\sin', 4)).toBeNull();
    expect(tryExpandShortcut('foo', 3)).toBeNull();
    expect(tryExpandShortcut('\\text{x >=}', 10)).toBeNull();
    expect(tryExpandShortcut('\\mathrm{alpha}', 13)).toBeNull();
  });

  it('returns prefix matches for inline TeX command completions', () => {
    const match = getCommandCompletionsAtCursor('x + \\fr', 7);
    expect(match).not.toBeNull();
    expect(match!.items.some((item) => item.cmd === '\\frac')).toBe(true);
    expect(getCommandCompletionsAtCursor('x + y', 5)).toBeNull();
  });
});
