import { describe, expect, it, vi } from 'vitest';
import { commandBus } from './commandBus';
import { useAppStore } from '../store/useAppStore';

describe('CommandBus dispatch', () => {
  it('executes format-source, auto-fix, and matrix-edit cleanly against active store', () => {
    useAppStore.getState().setDocMode('single');
    useAppStore.getState().setSingleLatex('$a ＋ b$', 'external');

    const fixed = commandBus.dispatch({ type: 'auto-fix' });
    expect(fixed).toBe(true);
    expect(useAppStore.getState().getActiveMathLatex()).toBe('a + b');

    useAppStore.getState().setSingleLatex(
      '\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}',
      'command'
    );
    const rowAdded = commandBus.dispatch({ type: 'matrix-edit', op: 'append-row' });
    expect(rowAdded).toBe(true);
    expect(useAppStore.getState().getActiveMathLatex()).toContain('\\placeholder{} & \\placeholder{}');
  });

  it('delegates template insertion and jumpPlaceholder to registered active adapter', () => {
    const insertTemplate = vi.fn();
    const jumpPlaceholder = vi.fn(() => true);
    commandBus.registerAdapter({
      insertTemplate,
      insertNewline: vi.fn(),
      jumpPlaceholder,
      focusAt: vi.fn(),
      getSelectionRange: () => ({ start: 0, end: 0 }),
    });

    commandBus.dispatch({ type: 'insert-template', latex: '\\sqrt{\\placeholder{}}' });
    expect(insertTemplate).toHaveBeenCalledWith('\\sqrt{\\placeholder{}}', 'wrap-or-insert');

    commandBus.dispatch({
      type: 'insert-template',
      latex: '\\sqrt{\\placeholder{}}',
      wrapLatex: '\\sqrt{${SEL}}',
    });
    expect(insertTemplate).toHaveBeenCalledWith(
      '\\sqrt{\\placeholder{}}',
      'wrap-or-insert',
      '\\sqrt{${SEL}}'
    );

    expect(commandBus.dispatch({ type: 'jump-placeholder', direction: 'next' })).toBe(true);
    expect(jumpPlaceholder).toHaveBeenCalledWith('next');

    commandBus.registerAdapter(null);
  });

  it('supports derive-next-step and CJK normalize-punctuation commands', () => {
    useAppStore.getState().setDocMode('single');
    useAppStore.getState().setSingleLatex('y ＝ 2x ＋ 偏差', 'command');

    expect(commandBus.dispatch({ type: 'normalize-punctuation' })).toBe(true);
    expect(useAppStore.getState().getActiveMathLatex()).toBe('y = 2x + \\text{偏差}');

    expect(commandBus.dispatch({ type: 'derive-next-step' })).toBe(true);
    expect(useAppStore.getState().getActiveMathLatex()).toContain('\\begin{aligned}');
    expect(useAppStore.getState().getActiveMathLatex()).toContain('&= 2x + \\text{偏差}');
  });
});
