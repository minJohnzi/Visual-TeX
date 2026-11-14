import { describe, expect, it } from 'vitest';
import {
  parseMarkdownToBlocks,
  renderTextBlockHtml,
  serializeBlocksToMarkdown,
} from './mixedRenderer';

describe('mixedRenderer markdown import & export', () => {
  it('splits mixed markdown around single-line and multi-line display math blocks while preserving inline $...$ and code fences', () => {
    const md = [
      '# Derivation Notes',
      '',
      'Consider inline $x^2 + y^2 = r^2$ inside prose.',
      '',
      '```markdown',
      '$$',
      'code_block_ignored = 1',
      '$$',
      '```',
      '',
      '$$ E = mc^2 $$',
      '',
      'And multi-line display:',
      '',
      '$$',
      'a^2 + b^2 &= c^2',
      '$$',
      '',
      String.raw`\[`,
      String.raw`\int_0^1 x\,dx = \frac{1}{2}`,
      String.raw`\]`,
    ].join('\n');

    const blocks = parseMarkdownToBlocks(md, (idx, tp) => `${tp}-${idx}`);
    expect(blocks.map((b) => b.type)).toEqual([
      'text',
      'math',
      'text',
      'math',
      'math',
    ]);
    expect(blocks[0]).toMatchObject({ type: 'text' });
    if (blocks[0].type === 'text') {
      expect(blocks[0].content).toContain('$x^2 + y^2 = r^2$');
      expect(blocks[0].content).toContain('code_block_ignored = 1');
    }
    expect(blocks[1]).toEqual({ id: 'math-1', type: 'math', latex: 'E = mc^2' });
    expect(blocks[3]).toEqual({ id: 'math-3', type: 'math', latex: 'a^2 + b^2 &= c^2' });
    expect(blocks[4]).toEqual({
      id: 'math-4',
      type: 'math',
      latex: String.raw`\int_0^1 x\,dx = \frac{1}{2}`,
    });
  });

  it('returns empty list for blank markdown and renders parsed mixed blocks cleanly', () => {
    expect(parseMarkdownToBlocks('   \n\n  ')).toEqual([]);

    const blocks = parseMarkdownToBlocks('Energy: $E$\n\n$$\nE = mc^2\n$$');
    const serialized = serializeBlocksToMarkdown(blocks, 'display');
    expect(serialized).toContain('Energy: $E$');
    expect(serialized).toContain('$$\nE = mc^2\n$$');

    const firstText = blocks[0];
    expect(firstText?.type).toBe('text');
    if (firstText?.type === 'text') {
      const html = renderTextBlockHtml(firstText.content, (latex) => `<span>${latex}</span>`);
      expect(html).toContain('mixed-text-block');
      expect(html).toContain('<span>E</span>');
    }
  });
});
