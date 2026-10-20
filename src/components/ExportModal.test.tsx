import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ExportModal } from './ExportModal';
import { I18nProvider } from '../i18n/context';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ExportModal Hooks stability test', () => {
  it('renders and toggles isOpen between false and true without breaking React Rules of Hooks', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onToast = vi.fn();
    const onClose = vi.fn();

    // 1. Initial render with isOpen = false
    await act(async () => {
      root.render(
        <I18nProvider>
          <ExportModal
            isOpen={false}
            onClose={onClose}
            latex="x^2 + y^2 = z^2"
            currentBgMode="checker"
            currentColor="default"
            onToast={onToast}
          />
        </I18nProvider>
      );
    });

    expect(container.querySelector('.modal-backdrop')).toBeNull();

    // 2. Re-render with isOpen = true (Previously caused: Error: Rendered more hooks than during previous render)
    await act(async () => {
      root.render(
        <I18nProvider>
          <ExportModal
            isOpen={true}
            onClose={onClose}
            latex="x^2 + y^2 = z^2"
            currentBgMode="checker"
            currentColor="default"
            onToast={onToast}
          />
        </I18nProvider>
      );
    });

    expect(container.querySelector('.modal-backdrop')).not.toBeNull();
    expect(container.querySelector('.export-settings-modal')).not.toBeNull();

    // 3. Re-render back to isOpen = false
    await act(async () => {
      root.render(
        <I18nProvider>
          <ExportModal
            isOpen={false}
            onClose={onClose}
            latex="x^2 + y^2 = z^2"
            currentBgMode="checker"
            currentColor="default"
            onToast={onToast}
          />
        </I18nProvider>
      );
    });

    expect(container.querySelector('.modal-backdrop')).toBeNull();

    // Cleanup
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
