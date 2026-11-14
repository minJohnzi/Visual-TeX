import { describe, expect, it } from 'vitest';
import { exportPaddingToPx } from './domPng';
import { encodeFormulaToUrlHash, parseFormulaFromLocation } from './urlShare';

describe('urlShare', () => {
  it('encodes and restores single formula with default delimiter via #tex=', () => {
    const latex = String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a} + \text{中文公式}`;
    const url = encodeFormulaToUrlHash(
      {
        mode: 'single',
        singleLatex: latex,
        blocks: [{ id: 'm1', type: 'math', latex }],
        delimiterMode: 'none',
      },
      'https://example.com/'
    );

    expect(url.startsWith('https://example.com/#tex=b64.')).toBe(true);
    const hash = url.slice(url.indexOf('#'));
    const restored = parseFormulaFromLocation({ hash });
    expect(restored).not.toBeNull();
    expect(restored?.mode).toBe('single');
    expect(restored?.singleLatex).toBe(latex);
    expect(restored?.delimiterMode).toBe('none');
  });

  it('encodes and restores mixed blocks and non-default delimiters via #doc=', () => {
    const url = encodeFormulaToUrlHash(
      {
        mode: 'mixed',
        singleLatex: 'x^2',
        delimiterMode: 'equation',
        blocks: [
          { id: 't1', type: 'text', content: '说明：$a$' },
          { id: 'm1', type: 'math', latex: String.raw`E^2 = (pc)^2 + (m_0 c^2)^2` },
        ],
      },
      'http://localhost:3000/'
    );

    expect(url).toContain('#doc=b64.');
    const restored = parseFormulaFromLocation(url.slice(url.indexOf('#')));
    expect(restored?.mode).toBe('mixed');
    expect(restored?.delimiterMode).toBe('equation');
    expect(restored?.blocks).toHaveLength(2);
    expect(restored?.blocks[0]).toMatchObject({ type: 'text', content: '说明：$a$' });
    expect(restored?.blocks[1]).toMatchObject({
      type: 'math',
      latex: String.raw`E^2 = (pc)^2 + (m_0 c^2)^2`,
    });
  });

  it('returns null on empty or invalid URL hashes', () => {
    expect(parseFormulaFromLocation('')).toBeNull();
    expect(parseFormulaFromLocation({ hash: '#unrelated' })).toBeNull();
    expect(parseFormulaFromLocation({ hash: '#doc=b64.!!!notvalid!!!' })).toBeNull();
  });
});

describe('exportPaddingToPx', () => {
  it('maps padding modes to expected pixel margins', () => {
    expect(exportPaddingToPx('compact')).toBe(8);
    expect(exportPaddingToPx('normal')).toBe(16);
    expect(exportPaddingToPx('relaxed')).toBe(32);
    expect(exportPaddingToPx(undefined)).toBe(24);
  });
});
