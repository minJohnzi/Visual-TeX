import { describe, it, expect } from 'vitest';
import {
  tryExpandShortcut,
  isInsideTextCommand,
} from './shortcuts';

describe('shortcuts expansion', () => {
  it('expands symbol shortcuts >=, <=, !=, ->, <-', () => {
    const s1 = tryExpandShortcut('a >=', 4);
    expect(s1?.expandedText).toBe('a \\ge ');

    const s2 = tryExpandShortcut('x ->', 4);
    expect(s2?.expandedText).toBe('x \\to ');

    const s3 = tryExpandShortcut('a !=', 4);
    expect(s3?.expandedText).toBe('a \\ne ');
  });

  it('expands word shortcuts alpha, beta, gamma, sin, sinh, oo', () => {
    const s1 = tryExpandShortcut('alpha', 5);
    expect(s1?.expandedText).toBe('\\alpha ');

    const s2 = tryExpandShortcut('sinh', 4);
    expect(s2?.expandedText).toBe('\\sinh ');

    const s3 = tryExpandShortcut('oo', 2);
    expect(s3?.expandedText).toBe('\\infty ');
  });

  it('does NOT expand inside \\text{...}', () => {
    const text = '\\text{let a -> b}';
    expect(isInsideTextCommand(text, 14)).toBe(true);
    const result = tryExpandShortcut(text, 14);
    expect(result).toBeNull();
  });

  it('does NOT corrupt already escaped commands like \\sin or \\alpha', () => {
    const text = '\\alpha';
    const result = tryExpandShortcut(text, 6);
    expect(result).toBeNull();
  });
});
