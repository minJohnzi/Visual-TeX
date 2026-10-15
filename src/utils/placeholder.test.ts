import { describe, it, expect } from 'vitest';
import {
  findNextPlaceholder,
  findPrevPlaceholder,
  stripInternalPlaceholders,
  normalizePlaceholders,
} from './placeholder';

describe('Placeholder utilities', () => {
  it('finds next placeholder with \\placeholder{} and \\square', () => {
    const text = '\\frac{\\placeholder{}}{\\square} + x';
    const first = findNextPlaceholder(text, 0);
    expect(first).not.toBeNull();
    expect(first?.raw).toBe('\\placeholder{}');
    expect(first?.start).toBe(6);

    const second = findNextPlaceholder(text, first!.end);
    expect(second).not.toBeNull();
    expect(second?.raw).toBe('\\square');
  });

  it('navigates backward with Shift+Tab (findPrevPlaceholder)', () => {
    const text = '\\frac{\\placeholder{}}{\\placeholder{}}';
    const last = findNextPlaceholder(text, 10);
    expect(last).not.toBeNull();

    const prev = findPrevPlaceholder(text, last!.start);
    expect(prev).not.toBeNull();
    expect(prev?.start).toBe(6);
  });

  it('cleans internal placeholders for export', () => {
    const text = '\\frac{\\placeholder{a}}{\\placeholder{}} + \\square';
    const cleaned = stripInternalPlaceholders(text);
    expect(cleaned).toBe('\\frac{a}{\\Box} + \\Box');
    expect(cleaned).not.toContain('\\placeholder');
    expect(cleaned).not.toContain('\\square');
  });

  it('normalizes legacy \\square to \\placeholder{}', () => {
    const legacy = '\\sqrt{\\square} + x_{\\square}';
    expect(normalizePlaceholders(legacy)).toBe('\\sqrt{\\placeholder{}} + x_{\\placeholder{}}');
  });
});
