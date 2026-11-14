import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { useAppStore } from '../store/useAppStore';
import { ExportModal } from './ExportModal';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('ExportModal lazy mount & format controls', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useAppStore.getState().setDocMode('single');
    useAppStore.getState().setSingleLatex('E = mc^2', 'external');
    useAppStore.getState().setModalOpen('export', false);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not mount modal DOM when closed', () => {
    act(() => {
      root.render(
        <I18nProvider>
          <ExportModal />
        </I18nProvider>
      );
    });
    expect(container.firstChild).toBeNull();
  });

  it('mounts PNG, SVG, and MathML format controls when open', () => {
    useAppStore.getState().setModalOpen('export', true);

    act(() => {
      root.render(
        <I18nProvider>
          <ExportModal />
        </I18nProvider>
      );
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();

    const tabs = Array.from(container.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    expect(tabs.map((el) => el.textContent?.trim())).toEqual(['PNG', 'SVG', 'MathML']);

    // Verify 5x resolution pill and export padding options exist on PNG tab
    expect(container.textContent).toContain('5x');
    expect(container.textContent).toContain('8px');
    expect(container.textContent).toContain('32px');

    const mathmlTab = tabs[2];
    act(() => {
      mathmlTab.click();
    });
    expect(container.textContent).toContain('<math');
  });
});
