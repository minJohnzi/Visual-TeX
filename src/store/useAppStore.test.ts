import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './useAppStore';

describe('useAppStore transactions, undo/redo, and fast input stability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.getState().setDocMode('single');
    useAppStore.getState().setSingleLatex('x = 1', 'external');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks EditOrigin and monotonic transaction sequence accurately', () => {
    const beforeSeq = useAppStore.getState().lastTransaction.seq;
    useAppStore.getState().setSingleLatex('x = 2', 'source');
    const after = useAppStore.getState();
    expect(after.lastTransaction.seq).toBe(beforeSeq + 1);
    expect(after.lastTransaction.origin).toBe('source');
    expect(after.document.singleLatex).toBe('x = 2');
  });

  it('supports immutable undo and redo snapshots across commands', () => {
    useAppStore.getState().setSingleLatex('a + b', 'command');
    useAppStore.getState().setSingleLatex('a + b + c', 'command');

    expect(useAppStore.getState().document.singleLatex).toBe('a + b + c');
    useAppStore.getState().undo();
    expect(useAppStore.getState().document.singleLatex).toBe('a + b');
    useAppStore.getState().redo();
    expect(useAppStore.getState().document.singleLatex).toBe('a + b + c');
  });

  it('handles 200+ rapid sequential edits deterministically without dropping characters', () => {
    const payload =
      '\\int_0^\\infty \\frac{x^3}{e^x - 1}\\,dx + \\sum_{n=1}^{\\infty} \\frac{1}{n^2} + \\sqrt{a^2 + b^2} = \\frac{\\pi^4}{15} + \\alpha \\beta \\gamma \\delta \\epsilon \\theta \\lambda \\sigma \\omega';
    let acc = '';
    for (let i = 0; i < payload.length; i++) {
      acc += payload[i];
      useAppStore.getState().setSingleLatex(acc, 'source');
      vi.advanceTimersByTime(5);
    }

    vi.runAllTimers();
    const state = useAppStore.getState();
    expect(state.document.singleLatex).toBe(payload);
    expect(state.compileResult.hasError).toBe(false);
    expect(state.compileResult.html).toContain('katex');
  });

  it('manages mixed blocks (add, move, delete) while preserving at least one block', () => {
    const store = useAppStore.getState();
    store.setDocMode('mixed');
    const initialCount = useAppStore.getState().document.blocks.length;
    const newId = useAppStore.getState().addBlock('math');
    expect(useAppStore.getState().document.blocks).toHaveLength(initialCount + 1);
    expect(useAppStore.getState().activeBlockId).toBe(newId);

    useAppStore.getState().deleteBlock(newId);
    expect(useAppStore.getState().document.blocks).toHaveLength(initialCount);
  });

  it('manages favorites, history notes, selective history clearing, markdown block import, and URL restore', () => {
    const store = useAppStore.getState();
    store.saveToHistoryList('x^2 + y^2 = 1');
    store.saveToHistoryList('a^2 + b^2 = c^2');
    expect(store.toggleFavorite('x^2 + y^2 = 1')).toBe(true);
    store.setHistoryNote('x^2 + y^2 = 1', 'Unit Circle');

    expect(useAppStore.getState().favorites).toContain('x^2 + y^2 = 1');
    expect(useAppStore.getState().historyNotes['x^2 + y^2 = 1']).toBe('Unit Circle');

    useAppStore.getState().clearSavedHistory();
    expect(useAppStore.getState().savedHistory).toEqual(['x^2 + y^2 = 1']);

    useAppStore.getState().importMarkdownBlocks([
      { id: 't1', type: 'text', content: 'Intro text' },
      { id: 'm1', type: 'math', latex: 'E = mc^2' },
    ]);
    expect(useAppStore.getState().docMode).toBe('mixed');
    expect(useAppStore.getState().getActiveMathLatex()).toBe('E = mc^2');

    useAppStore.getState().applyRestoredDocument({
      mode: 'single',
      singleLatex: '\\alpha + \\beta',
      blocks: [{ id: 'm2', type: 'math', latex: '\\alpha + \\beta' }],
      delimiterMode: 'inline',
    });
    expect(useAppStore.getState().docMode).toBe('single');
    expect(useAppStore.getState().delimiterMode).toBe('inline');
    expect(useAppStore.getState().document.singleLatex).toBe('\\alpha + \\beta');
  });
});
