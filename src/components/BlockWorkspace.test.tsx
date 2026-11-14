import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { useAppStore } from '../store/useAppStore';
import { BlockWorkspace } from './editor/BlockWorkspace';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('BlockWorkspace single-active-editor invariant', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useAppStore.getState().setDocMode('mixed');
    useAppStore.getState().setEditorMode('source');
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('mounts at most one active editor across multiple mixed text and math blocks', () => {
    act(() => {
      root.render(
        <I18nProvider>
          <BlockWorkspace />
        </I18nProvider>
      );
    });

    const cards = container.querySelectorAll('.block-card');
    expect(cards.length).toBeGreaterThanOrEqual(2);

    // Count live active editors (CodeMirror .cm-editor + live .text-block-textarea)
    const activeCmCount = container.querySelectorAll('.cm-editor').length;
    const activeTextCount = container.querySelectorAll('textarea.text-block-textarea').length;
    expect(activeCmCount + activeTextCount).toBe(1);

    // Click an inactive summary block -> active editor switches, total live editors stays 1
    const summaryTrigger = container.querySelector('.block-summary-trigger') as HTMLButtonElement | null;
    expect(summaryTrigger).not.toBeNull();
    act(() => {
      summaryTrigger!.click();
    });

    const afterCm = container.querySelectorAll('.cm-editor').length;
    const afterText = container.querySelectorAll('textarea.text-block-textarea').length;
    expect(afterCm + afterText).toBe(1);
    expect(container.querySelectorAll('[role="tab"]').length).toBeGreaterThanOrEqual(4);

    // Status bar metrics and mixed markdown import trigger are rendered
    expect(container.querySelector('.editor-status-bar')?.textContent).toBeTruthy();
    expect(container.querySelector('.md-import-panel')).toBeNull();
  });
});
